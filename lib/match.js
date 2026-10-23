import { norm } from "./seen.js";

/**
 * Motor de avaliação. Duas camadas:
 *  1. heurística local (grátis, sempre roda)  -> nota 0-100 + motivos
 *  2. LLM opcional (OpenAI-compatível)        -> substitui a nota final
 * Nada aqui faz rede a não ser `aiEvaluate`.
 */

const SKILL_ALIASES = {
  go: ["go", "golang"],
  python: ["python", "django", "flask", "fastapi"],
  javascript: ["javascript", "js", "ecmascript"],
  typescript: ["typescript", "ts"],
  node: ["node", "node.js", "nodejs"],
  react: ["react", "react.js", "reactjs"],
  angular: ["angular", "angularjs"],
  django: ["django"],
  postgresql: ["postgres", "postgresql", "pgsql"],
  mysql: ["mysql", "mariadb"],
  sqlserver: ["sql server", "sqlserver", "t-sql", "tsql"],
  sql: ["sql"],
  firebase: ["firebase", "firestore", "cloud functions"],
  supabase: ["supabase"],
  gcp: ["gcp", "google cloud", "cloud run", "bigquery"],
  rest: ["api rest", "rest api", "restful", "apis rest", "rest"],
  selenium: ["selenium", "webdriver"],
  rpa: ["rpa", "robotic process automation", "automacao de processos", "automacao"],
  git: ["git", "github", "gitlab", "versionamento"],
  cicd: ["github actions", "ci/cd", "cicd", "pipeline", "devops"],
  scrum: ["scrum", "agile", "agil", "kanban"],
  powerbi: ["power bi", "powerbi", "looker", "data studio"],
  excel: ["excel", "vba", "planilha", "powerquery", "power query"],
  cpp: ["c++", "arduino", "embedded"],
  micropython: ["micropython", "raspberry", "iot"],
  wails: ["wails"],
  chromedp: ["chromedp", "devtools protocol", "cdp"],
  html: ["html", "css", "front-end", "frontend"],
  etl: ["etl", "pipeline de dados", "airflow", "dbt", "ingestao"]
};

const ROLE_BONUS = [
  { re: /desenvolvedor|developer|programador|engenheiro de software|software engineer/, pts: 14, why: "cargo de desenvolvimento" },
  { re: /\brpa\b|automacao|automation/, pts: 12, why: "RPA / automação" },
  { re: /analista de dados|data analyst|engenheiro de dados|data engineer|bi\b|business intelligence/, pts: 9, why: "dados / BI" },
  { re: /analista de sistemas|analista desenvolvedor|analista tecnico/, pts: 8, why: "analista de sistemas" },
  { re: /qa\b|quality assurance|testes automatizados|sdet|automacao de testes/, pts: 8, why: "QA / testes automatizados" },
  { re: /full ?stack|fullstack/, pts: 8, why: "full stack" },
  { re: /back ?end|backend/, pts: 7, why: "backend" },
  { re: /front ?end|frontend/, pts: 5, why: "frontend" },
  { re: /suporte|help ?desk|service desk|infraestrutura|infra|operador de computador/, pts: -22, why: "suporte/infra, fora do alvo" },
  { re: /administrativo|secretaria|recepcionista|faturista|telemarketing|vendas|vendedor|caixa/, pts: -28, why: "área administrativa" },
  { re: /estagio|estagiario|trainee|aprendiz/, pts: -10, why: "estágio/trainee" }
];

const SENIOR_HEAVY = /\b(senior|sr\.?|especialista|specialist|staff|principal|lead|lider|arquiteto|architect|coordenador|gerente|manager|head)\b/;
const SENIOR_LIGHT = /\b(junior|jr\.?|pleno|mid|ii)\b/;

const FOREIGN_STACKS = [
  "java", "kotlin", "c#", ".net", "asp.net", "php", "ruby", "rails", "swift", "ios",
  "android", "flutter", "dart", "cobol", "delphi", "salesforce", "sap", "abap",
  "golang" /* tratado à parte */, "scala", "elixir", "rust", "perl", "r"
];

const DAY = 24 * 60 * 60 * 1000;

function has(text, needle) {
  const n = norm(needle);
  if (!n) return false;
  if (n.length <= 3) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`).test(text);
  }
  return text.includes(n);
}

function skillHits(text, skills) {
  const hits = [];
  for (const skill of skills) {
    const canonical = norm(skill);
    const aliases = SKILL_ALIASES[canonical] || [canonical];
    if (aliases.some((alias) => has(text, alias))) hits.push(skill);
  }
  return hits;
}

function parseSalary(text) {
  const values = [];
  const re = /r\$\s*([\d.]{3,})(?:[,.](\d{2}))?/gi;
  let match;
  while ((match = re.exec(text))) {
    const integer = match[1].replace(/\./g, "");
    const cents = match[2] || "00";
    const value = Number(`${integer}.${cents}`);
    if (Number.isFinite(value) && value >= 500) values.push(value);
  }
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function daysSince(iso) {
  const ts = Date.parse(iso || "");
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / DAY);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * @param {object} job  {title, company, location, salary, description, postedAt, site}
 * @param {object} candidate  {skills, targetRoles, cities, seniorities, salaryFloor, yearsExperience}
 */
export function scoreHeuristic(job, candidate = {}) {
  const title = norm(job.title);
  const location = norm(job.location);
  const description = norm(job.description || "");
  const whole = norm(`${job.title} ${job.company} ${job.location} ${job.description || ""}`);
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const cities = Array.isArray(candidate.cities) ? candidate.cities : [];
  const seniorities = (Array.isArray(candidate.seniorities) ? candidate.seniorities : []).map(norm);
  const salaryFloor = Number(candidate.salaryFloor) || 0;

  const reasons = [];
  const gaps = [];
  let score = 30;

  // 0. Blacklist de empresas — zera a chance antes do resto.
  const company = norm(job.company);
  const companyAlpha = company.replace(/[^a-z0-9]/g, "");
  const avoidCompanies = (Array.isArray(candidate.companiesAvoid) ? candidate.companiesAvoid : [])
    .map(norm)
    .map((c) => c.replace(/[^a-z0-9]/g, ""));
  const isBlacklisted = company && avoidCompanies.some((bad) => {
    if (company.includes(bad) || companyAlpha.includes(bad) || bad.includes(companyAlpha)) return true;
    // prefix match para casos como "ciandt" vs "cit" (CI&T)
    if (companyAlpha.length >= 3 && bad.startsWith(companyAlpha)) return true;
    if (bad.length >= 3 && companyAlpha.startsWith(bad)) return true;
    return false;
  });
  if (isBlacklisted) {
    score -= 100;
    gaps.push(`empresa na blacklist: ${job.company}`);
    return {
      score: clamp(score, 0, 100),
      verdict: verdictFor(score),
      reasons: [...new Set(reasons)].slice(0, 6),
      gaps: [...new Set(gaps)].slice(0, 5),
      skillHits: [],
      method: "heuristic"
    };
  }

  // 1. Cargo — só o melhor enquadramento pontua; os ruins sempre descontam.
  let rolePoints = 0;
  let roleMatched = false;
  for (const rule of ROLE_BONUS) {
    if (!rule.re.test(title)) continue;
    if (rule.pts > 0) {
      rolePoints = Math.max(rolePoints, rule.pts);
      if (rule.pts >= 8) roleMatched = true;
      if (!reasons.includes(rule.why)) reasons.push(rule.why);
    } else {
      score += rule.pts;
      gaps.push(rule.why);
    }
  }
  score += rolePoints;
  const targets = (Array.isArray(candidate.targetRoles) ? candidate.targetRoles : []).map(norm);
  if (targets.length && targets.some((role) => title.includes(role))) {
    score += 5;
    if (!reasons.includes("cargo alvo")) reasons.push("cargo alvo");
    roleMatched = true;
  }
  if (!roleMatched) score -= 12;

  // 2. Stack
  const hits = skillHits(whole, skills);
  const stackPoints = Math.min(20, hits.length * 4);
  if (stackPoints) {
    score += stackPoints;
    reasons.push(`stack: ${hits.slice(0, 5).join(", ")}`);
  }
  if (hits.length === 0) gaps.push("nenhuma tecnologia do seu perfil citada");

  // 3. Senioridade
  const heavy = SENIOR_HEAVY.test(title);
  const light = SENIOR_LIGHT.test(title);
  if (heavy) {
    score -= 22;
    gaps.push("vaga sênior/lead");
  } else if (light) {
    score += seniorities.some((s) => title.includes(s)) ? 6 : 2;
    reasons.push("senioridade compatível");
  }

  const yearsMatch = description.match(/(\d+)\s*(?:\+)?\s*anos?/);
  if (yearsMatch) {
    const years = Number(yearsMatch[1]);
    if (years >= 6) {
      score -= 14;
      gaps.push(`pede ${years}+ anos`);
    } else if (years >= 4) {
      score -= 7;
      gaps.push(`pede ${years}+ anos`);
    } else if (years <= 2) {
      score += 3;
    }
  }

  // 4. Localização / modelo — só conta a favor se o cargo já combina.
  const remote = /remoto|home ?office|100% remoto|anywhere|teletrabalho/.test(whole);
  const cityMatch = cities.some((city) => city && has(whole, city));
  const otherCity = /(rio de janeiro|belo horizonte|curitiba|porto alegre|recife|fortaleza|brasilia|salvador|florianopolis|campinas|sao jos[eé]|barueri|osasco|guarulhos|santo andre|sorocaba|ribeirao)/.test(
    norm(job.location || "")
  );
  if (remote) {
    if (roleMatched) {
      score += 8;
      reasons.push("remoto");
    }
  } else if (cityMatch && roleMatched) {
    score += 7;
    reasons.push("na sua região");
  } else if (otherCity) {
    score -= 16;
    gaps.push("presencial em outra cidade");
  } else if (location && !roleMatched) {
    score -= 4;
  }

  // 5. Salário
  const salary = parseSalary(job.salary || "") || parseSalary(job.description || "");
  if (salary && salaryFloor) {
    if (salary.max < salaryFloor) {
      score -= 14;
      gaps.push("salário abaixo do piso");
    } else if (salary.max >= salaryFloor * 1.3) {
      score += 6;
      reasons.push("faixa salarial boa");
    }
  }

  // 6. Stack estrangeira como requisito principal
  const headline = norm(`${job.title} ${(job.description || "").slice(0, 400)}`);
  for (const foreign of FOREIGN_STACKS) {
    if (foreign === "golang") continue;
    if (!has(headline, foreign)) continue;
    const own = hits.some((skill) => (SKILL_ALIASES[norm(skill)] || [norm(skill)]).includes(foreign));
    if (!own) {
      score -= 9;
      gaps.push(`stack fora do perfil: ${foreign}`);
      break;
    }
  }

  // 7. Bônus de domínio real do currículo
  if (/\betl\b|pipeline de dados|engenharia de dados|data engineer/.test(whole)) {
    score += 6;
    reasons.push("ETL / engenharia de dados");
  }
  if (/postgres|plpgsql|pl\/pgsql|modelagem de dados/.test(whole)) {
    score += 4;
    reasons.push("banco relacional / modelagem");
  }

  // 8. Frescor e expiração
  const age = daysSince(job.postedAt);
  if (age != null && age <= 3) {
    score += 5;
    reasons.push("publicada há poucos dias");
  } else if (age != null && age > 45) {
    score -= 8;
    gaps.push("anúncio antigo");
  }
  if (job.expired) {
    score -= 30;
    gaps.push("vaga encerrada");
  }

  const final = clamp(score, 0, 100);
  return {
    score: final,
    verdict: verdictFor(final),
    reasons: [...new Set(reasons)].slice(0, 6),
    gaps: [...new Set(gaps)].slice(0, 5),
    skillHits: hits,
    method: "heuristic"
  };
}

export function verdictFor(score) {
  if (score >= 80) return "forte";
  if (score >= 65) return "boa";
  if (score >= 50) return "talvez";
  return "fraca";
}

export function shortlist(jobs, minScore) {
  return jobs
    .filter((job) => job.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/* ------------------------------ LLM opcional ------------------------------ */

const AI_SYSTEM = `Você é um recrutador técnico brasileiro, direto e honesto.
Avalie se a vaga combina com o currículo do candidato.
Responda SOMENTE com JSON válido no formato:
{"score":0-100,"verdict":"forte|boa|talvez|fraca","reasons":["..."],"gaps":["..."],"seniority":"...","remote":"sim|nao|nao informado"}
Regras:
- score >= 80 só para aderência real de stack, senioridade e localização.
- Considere que o candidato tem experiência formal em logística/administrativo, mas projetos reais de software (Go, React, Angular, Node, PostgreSQL), RPA e automação. Não penalize por título anterior se as competências baterem.
- Penalize vagas sênior/lead, stacks que ele não domina, presencial fora de São Paulo e salário abaixo de R$ 4.000.
- reasons e gaps: no máximo 4 itens curtos, em português.`;

export function aiPrompt(job, candidate = {}) {
  const resume = String(candidate.resumeText || "").slice(0, 7000);
  const description = String(job.description || "").slice(0, 6000);
  return [
    "### CURRÍCULO",
    resume || "(sem texto de currículo)",
    "",
    "### VAGA",
    `Título: ${job.title || ""}`,
    `Empresa: ${job.company || ""}`,
    `Local: ${job.location || ""}`,
    `Salário: ${job.salary || "não informado"}`,
    `Publicada: ${job.postedAt || "não informado"}`,
    "",
    description || "(sem descrição)"
  ].join("\n");
}

export async function aiEvaluate(job, candidate, aiConfig = {}, { signal } = {}) {
  const baseUrl = String(aiConfig.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = String(aiConfig.model || "gpt-4o-mini");
  const apiKey = String(aiConfig.apiKey || "").trim();
  if (!apiKey) throw new Error("informe a API key da IA");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(aiConfig.timeoutMs) || 45000);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_SYSTEM },
          { role: "user", content: aiPrompt(job, candidate) }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`IA respondeu ${response.status}: ${text.slice(0, 180)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonLoose(content);
    if (!parsed || typeof parsed.score !== "number") {
      throw new Error("IA não devolveu JSON com score");
    }

    const score = clamp(parsed.score, 0, 100);
    return {
      score,
      verdict: parsed.verdict || verdictFor(score),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 4).map(String) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 4).map(String) : [],
      seniority: parsed.seniority || "",
      method: `ai:${model}`
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonLoose(content) {
  const text = String(content || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    /* tenta achar o objeto */
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const KEYS = {
  config: "mjb.config",
  run: "mjb.run",
  history: "mjb.history",
  daily: "mjb.daily",
  logs: "mjb.logs"
};

export const CONFIG_VERSION = 5;

export const DEFAULTS = {
  configVersion: CONFIG_VERSION,
  activeProfile: 0,
  profiles: [
    {
      id: "felipe",
      name: "Felipe Reis",
      profile: {
        fullName: "Felipe Reis Amorim Dias de Souza",
        email: "felipe.reis.dias@gmail.com",
        phone: "(11) 98597-3926",
        city: "São Paulo",
        state: "SP",
        salaryExpectation: "R$ 4.000",
        linkedin: "",
        github: "",
        portfolio: "",
        yearsExperience: "3",
        english: "Fluente",
        education: "Pós-graduação em Desenvolvimento Full Stack · Graduação em Engenharia de Software",
        availability: "Imediata",
        pcd: "Não",
        summary: ""
      },
      resumeText: "",
      searches: [
        { id: "s1", site: "catho", label: "Catho — Desenvolvedor", url: "https://www.catho.com.br/vagas/desenvolvedor/", enabled: true },
        { id: "s2", site: "catho", label: "Catho — Engenheiro de software", url: "https://www.catho.com.br/vagas/engenheiro-de-software/", enabled: true },
        { id: "s3", site: "infojobs", label: "InfoJobs — Desenvolvedor", url: "https://www.infojobs.com.br/vagas-de-emprego-desenvolvedor.aspx", enabled: true },
        { id: "s4", site: "infojobs", label: "InfoJobs — Desenvolvedor júnior", url: "https://www.infojobs.com.br/vagas-de-desenvolvedor-junior.aspx", enabled: true },
        { id: "s5", site: "linkedin", label: "LinkedIn — Desenvolvedor júnior", url: "https://www.linkedin.com/jobs/search/?keywords=desenvolvedor%20j%C3%BAnior&location=Brasil&f_TPR=r604800", enabled: false }
      ],
      triage: {
        enabled: true,
        scheduleHour: 8,
        maxPagesPerSearch: 2,
        maxJobsPerRun: 30,
        maxSearchesPerRun: 8,
        showTab: false,
        keepTabOpen: false,
        delayMinMs: 1200,
        delayMaxMs: 2800,
        minScoreToEmail: 0,
        topPerEmail: 15,
        candidate: {
          targetRoles: [
            "desenvolvedor", "developer", "engenheiro de software", "analista de sistemas",
            "analista desenvolvedor", "full stack", "rpa", "automação", "analista de dados",
            "engenheiro de dados", "qa", "quality assurance"
          ],
          seniorities: ["júnior", "junior", "pleno"],
          cities: ["São Paulo", "SP", "remoto", "home office", "híbrido"],
          salaryFloor: 4000,
          yearsExperience: 3,
          skills: [
            "Go", "Python", "JavaScript", "TypeScript", "Node.js", "React", "Angular", "Django",
            "PostgreSQL", "MySQL", "SQL Server", "SQL", "Firebase", "Supabase", "Google Cloud",
            "REST API", "Selenium", "RPA", "Git", "GitHub Actions", "Scrum", "Power BI",
            "Excel/VBA", "C++", "Arduino", "Micropython", "Wails", "chromedp", "ETL"
          ],
          avoid: [
            "suporte técnico", "help desk", "service desk", "infraestrutura", "administrativo",
            "secretária", "telemarketing", "vendas"
          ],
          companiesAvoid: [
            "bairesdev", "ciandt", "cit", "toptal", "andela", "revelo", "geekhunter", "vinta", "kenoby"
          ]
        }
      },
      email: {
        enabled: true,
        provider: "web3forms",
        apiKey: "",
        fromName: "MEU Job Bot",
        fromEmail: "",
        toEmail: "felipe.reis.dias@gmail.com",
        webhookUrl: ""
      }
    },
    {
      id: "luciana",
      name: "Luciana Pereira Reis",
      profile: {
        fullName: "Luciana Pereira Reis",
        email: "luhsp0@gmail.com",
        phone: "",
        city: "São Paulo",
        state: "SP",
        salaryExpectation: "R$ 3.500",
        linkedin: "www.linkedin.com/in/luciana-pereira-reis-436a5a15a",
        github: "",
        portfolio: "",
        yearsExperience: "5",
        english: "Fluente",
        education: "Licenciatura em Letras - Inglês (2022-2025) · Pós em Secretariado Executivo (2025) · Bacharel em Tradutor/Intérprete (2018-2021)",
        availability: "Imediata",
        pcd: "Não",
        summary: "Professora de Inglês / Tradutora e Intérprete com experiência em secretariado executivo e atendimento. Busco oportunidade para atuar no ensino de língua inglesa (presencial ou remoto)."
      },
      resumeText: "",
      searches: [
        { id: "s1", site: "catho", label: "Catho — Professor Inglês", url: "https://www.catho.com.br/vagas/professor-ingles/", enabled: true },
        { id: "s2", site: "catho", label: "Catho — Instrutor Idiomas", url: "https://www.catho.com.br/vagas/instrutor-idiomas/", enabled: true },
        { id: "s3", site: "infojobs", label: "InfoJobs — Professor Inglês", url: "https://www.infojobs.com.br/vagas-de-emprego-professor-ingles.aspx", enabled: true },
        { id: "s4", site: "infojobs", label: "InfoJobs — Instrutor Inglês", url: "https://www.infojobs.com.br/vagas-de-emprego-instrutor-ingles.aspx", enabled: true },
        { id: "s5", site: "catho", label: "Catho — Tradutor", url: "https://www.catho.com.br/vagas/tradutor/", enabled: true },
        { id: "s6", site: "infojobs", label: "InfoJobs — Tradutor", url: "https://www.infojobs.com.br/vagas-de-emprego-tradutor.aspx", enabled: true }
      ],
      triage: {
        enabled: true,
        scheduleHour: 9,
        maxPagesPerSearch: 2,
        maxJobsPerRun: 20,
        maxSearchesPerRun: 6,
        showTab: false,
        keepTabOpen: false,
        delayMinMs: 1200,
        delayMaxMs: 2800,
        minScoreToEmail: 0,
        topPerEmail: 10,
        candidate: {
          targetRoles: [
            "professor de inglês", "professor de ingles", "instrutor de inglês", "instrutor de idiomas",
            "professor inglês", "teacher english", "english teacher", "tradutor", "intérprete",
            "tradutor inglês", "tradutor e intérprete", "coordenador pedagógico"
          ],
          seniorities: ["júnior", "junior", "pleno", "sênior"],
          cities: ["São Paulo", "SP", "remoto", "home office", "híbrido", "online"],
          salaryFloor: 2500,
          yearsExperience: 3,
          skills: [
            "Inglês", "English", "Ensino de idiomas", "Metodologia de ensino", "Letras",
            "Tradução", "Interpretação", "Secretariado executivo", "Atendimento ao cliente",
            "Gestão de agenda", "Comunicação", "Material didático", "Aulas online", "Google Classroom",
            "Zoom", "Teams", "Pedagogia", "Letras inglês", "Literatura inglesa"
          ],
          avoid: [
            "vendas", "telemarketing", "operador de caixa", "recepcionista", "auxiliar de limpeza",
            "motorista", "segurança", "estoque", "logística", "promotor de vendas"
          ],
          companiesAvoid: []
        }
      },
      email: {
        enabled: true,
        provider: "web3forms",
        apiKey: "",
        fromName: "MEU Job Bot",
        fromEmail: "",
        toEmail: "luhsp0@gmail.com",
        webhookUrl: ""
      }
    }
  ],
  ai: {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    maxPerRun: 40,
    minHeuristic: 45
  }
};

export function deepMerge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base.slice();
  if (base && typeof base === "object") {
    const out = { ...base };
    if (override && typeof override === "object") {
      for (const key of Object.keys(override)) out[key] = deepMerge(base[key], override[key]);
    }
    return out;
  }
  return override === undefined ? base : override;
}

export async function loadConfig() {
  const stored = await chrome.storage.local.get(KEYS.config);
  const raw = stored[KEYS.config] || {};
  const config = deepMerge(DEFAULTS, raw);
  if (migrate(config, raw.configVersion)) await saveConfig(config);
  return config;
}

/**
 * Ajustes de configuração entre versões. Só mexe no que ainda está no padrão
 * antigo — configuração que você já personalizou nunca é sobrescrita.
 */
function migrate(config, storedVersion) {
  const from = Number(storedVersion || 1);
  let changed = false;

  // v2: Brevo sem chave -> Web3Forms (aplica apenas se estrutura antiga com email na raiz)
  if (from < 2) {
    // Verifica se é estrutura antiga (email na raiz) ou nova (em profiles)
    const email = config.email || (config.profiles?.[0]?.email);
    const untouched = !String(email?.apiKey || "").trim() && (email?.provider === "brevo" || !email?.provider);
    if (untouched) {
      if (config.email) {
        config.email.provider = DEFAULTS.profiles[0].email.provider;
        config.email.apiKey = DEFAULTS.profiles[0].email.apiKey;
        config.email.enabled = true;
        if (!String(config.email.toEmail || "").includes("@")) config.email.toEmail = DEFAULTS.profiles[0].email.toEmail;
      } else if (config.profiles?.[0]?.email) {
        config.profiles[0].email.provider = DEFAULTS.profiles[0].email.provider;
        config.profiles[0].email.apiKey = DEFAULTS.profiles[0].email.apiKey;
        config.profiles[0].email.enabled = true;
        if (!String(config.profiles[0].email.toEmail || "").includes("@")) config.profiles[0].email.toEmail = DEFAULTS.profiles[0].email.toEmail;
      }
    }
    changed = true;
  }

  // v3: o e-mail passa a listar todas as vagas avaliadas, com nota (sem corte em 60).
  if (from < 3) {
    // Aplica no triage antigo ou no profile[0]
    const triage = config.triage || config.profiles?.[0]?.triage;
    if (triage && Number(triage.minScoreToEmail) === 60) {
      triage.minScoreToEmail = 0;
    }
    changed = true;
  }

  // v4: ritmo mais rápido (menos páginas/vagas por execução, pausas menores).
  if (from < 4) {
    const t = config.triage || config.profiles?.[0]?.triage;
    const D = DEFAULTS.profiles[0].triage;
    if (t) {
      if (Number(t.maxPagesPerSearch) === 3) t.maxPagesPerSearch = D.maxPagesPerSearch;
      if (Number(t.maxJobsPerRun) === 50) t.maxJobsPerRun = D.maxJobsPerRun;
      if (Number(t.delayMinMs) === 2500) t.delayMinMs = D.delayMinMs;
      if (Number(t.delayMaxMs) === 6000) t.delayMaxMs = D.delayMaxMs;
      if (t.maxSearchesPerRun == null) t.maxSearchesPerRun = D.maxSearchesPerRun;
    }
    changed = true;
  }

  // v5: múltiplos perfis (Felipe + Luciana). Migra estrutura antiga para profiles[0].
  if (from < 5) {
    const oldTriage = config.triage;
    const oldEmail = config.email;
    const oldProfile = config.profile;
    const oldSearches = config.searches;
    const oldResume = config.resume;

    config.profiles = [{
      id: "felipe",
      name: "Felipe Reis",
      profile: oldProfile || DEFAULTS.profiles[0].profile,
      resumeText: oldResume || "",
      searches: oldSearches || DEFAULTS.profiles[0].searches,
      triage: oldTriage || DEFAULTS.profiles[0].triage,
      email: oldEmail || DEFAULTS.profiles[0].email
    }, DEFAULTS.profiles[1]]; // adiciona Luciana como segundo perfil

    config.activeProfile = 0;
    delete config.triage;
    delete config.email;
    delete config.profile;
    delete config.searches;
    delete config.resume;
    delete config.rules;
    changed = true;
  }

  if (from < CONFIG_VERSION) {
    config.configVersion = CONFIG_VERSION;
    changed = true;
  }
  return changed;
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ [KEYS.config]: config });
}

export function getActiveProfile(config) {
  const idx = Number(config.activeProfile || 0);
  return config.profiles[idx] || config.profiles[0];
}

export function setActiveProfile(config, profileId) {
  const idx = config.profiles.findIndex((p) => p.id === profileId);
  if (idx >= 0) {
    config.activeProfile = idx;
    return true;
  }
  return false;
}
if (!globalThis.__MEU_JOB_BOT__) {
  globalThis.__MEU_JOB_BOT__ = true;

  const state = {
    jobs: [],
    applying: false
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "SCAN") {
      scan()
        .then((jobs) => sendResponse({ jobs }))
        .catch((error) => sendResponse({ jobs: [], error: String(error) }));
      return true;
    }
    if (message?.type === "APPLY") {
      applySelected(message.ids || [], message.maxApplies)
        .then((payload) => sendResponse(payload))
        .catch((error) => sendResponse({ results: [], stopped: true, reason: String(error) }));
      return true;
    }
  });

  scan().catch(() => {});

  let rescanTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => scan().catch(() => {}), 1500);
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeReg(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesTerm(hay, term) {
  const needle = norm(term);
  if (!needle) return false;
  if (needle.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${escapeReg(needle)}([^a-z0-9]|$)`).test(hay);
  }
  return hay.includes(needle);
}

function sourceName() {
  const host = location.hostname.replace(/^www\./, "");
  if (host.includes("catho")) return "Catho";
  if (host.includes("infojobs")) return "InfoJobs";
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("gupy")) return "Gupy";
  if (host.includes("programathor")) return "Programathor";
  return host;
}

function textOf(el) {
  return (el?.innerText || el?.textContent || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function isApplyControl(el) {
  const raw = textOf(el) || el.getAttribute?.("aria-label") || "";
  const text = norm(raw);
  if (!text || text.length > 70) return false;
  if (/cadastr|destaque|comprar|denunc|salvar busca|login|entrar|assinar|upgrade|filtros|ordenar/.test(text)) {
    return false;
  }
  return /quero me candidatar|candidat|easy apply|candidatura facil|inscrever-se|inscreva-se|enviar curriculo|enviar cv/.test(text);
}

function findApplyControl(root) {
  const nodes = root.querySelectorAll("button, a, [role='button'], input[type='submit']");
  return [...nodes].find(isApplyControl) || null;
}

function cardFrom(anchor) {
  let node = anchor;
  for (let depth = 0; depth < 7 && node; depth += 1) {
    const text = textOf(node);
    if (text.length > 40 && text.length < 1400 && findApplyControl(node)) return node;
    node = node.parentElement;
  }
  return anchor.closest("li, article, section") || anchor.parentElement || anchor;
}

function pushJob(bucket, seen, job) {
  if (!job?.title || job.title.length < 3 || seen.has(job.id)) return;
  seen.add(job.id);
  bucket.push(job);
}

function extractByPattern(pattern) {
  const jobs = [];
  const seen = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    let url;
    try {
      url = new URL(anchor.href, location.href);
    } catch {
      continue;
    }
    const match = url.href.match(pattern);
    if (!match) continue;
    const title = (anchor.getAttribute("title") || textOf(anchor)).trim();
    if (title.length < 3 || title.length > 160) continue;
    const card = cardFrom(anchor);
    const blob = textOf(card);
    const lines = blob.split("\n").map((line) => line.trim()).filter((line) => line && line !== title);
    pushJob(jobs, seen, {
      id: `${sourceName()}:${match[1] || url.pathname}`,
      title,
      company: lines.find((line) => line !== title && line.length < 80) || "",
      location: (blob.match(/[A-ZÁÉÍÓÚÃÕÂÊÔ][\p{L}\s]+ - [A-Z]{2}/u) || [])[0] || "",
      snippet: blob.slice(0, 280),
      url: url.href.split("#")[0],
      source: sourceName(),
      canApply: Boolean(findApplyControl(card)),
      card
    });
  }
  return jobs;
}

function extractDetail() {
  const h1 = document.querySelector("h1");
  const title = textOf(h1);
  if (!title || title.length > 180) return [];
  const apply = findApplyControl(document.body);
  const looksLikeJob = /vaga|job|emprego|\/jobs\/view\//i.test(location.href) || Boolean(apply);
  if (!looksLikeJob) return [];
  return [{
    id: `${sourceName()}:${location.pathname}`,
    title,
    company: "",
    location: "",
    snippet: textOf(document.querySelector("main") || document.body).slice(0, 400),
    url: location.href.split("#")[0],
    source: sourceName(),
    canApply: Boolean(apply),
    card: apply?.closest("form, section, article, div") || document.body
  }];
}

function extractJobs() {
  const host = location.hostname;
  let jobs = [];
  if (host.includes("catho")) {
    jobs = extractByPattern(/\/vagas\/[^/?#]+\/(\d+)/i);
  } else if (host.includes("infojobs")) {
    jobs = extractByPattern(/\/vaga-de-[^?#]*__(\d+)\.aspx/i);
  } else if (host.includes("linkedin")) {
    jobs = extractByPattern(/\/jobs\/view\/(\d+)/i);
  } else if (host.includes("gupy")) {
    jobs = extractByPattern(/\/jobs?\/(\d+)/i);
  } else if (host.includes("programathor")) {
    jobs = extractByPattern(/\/jobs\/([^/?#]+)/i);
  } else {
    jobs = extractByPattern(/(\/vaga[^?#\s]{0,80}|\/jobs?\/[^?#\s]+)/i);
  }
  if (jobs.length >= 2) return jobs;
  const detail = extractDetail();
  return detail.length ? detail : jobs;
}

function scoreJob(job, profile) {
  const title = norm(job.title);
  const hay = norm(`${job.title} ${job.company} ${job.location} ${job.snippet}`);
  let score = 0;
  const hits = [];
  const misses = [];

  for (const term of profile.include || []) {
    if (includesTerm(title, term)) {
      score += 4;
      hits.push(term);
    } else if (includesTerm(hay, term)) {
      score += 1;
      hits.push(term);
    }
  }
  for (const term of profile.exclude || []) {
    if (includesTerm(title, term)) {
      score -= 8;
      misses.push(term);
    } else if (includesTerm(hay, term)) {
      score -= 3;
      misses.push(term);
    }
  }
  if (/\b(help ?desk|service desk|suporte|infraestrutura)\b/.test(title)) {
    score -= 5;
    misses.push("suporte ou infra");
  }
  for (const city of profile.cities || []) {
    if (includesTerm(hay, city)) {
      score += 2;
      hits.push(city);
    }
  }
  return { score, hits: [...new Set(hits)].slice(0, 6), misses: [...new Set(misses)].slice(0, 4) };
}

async function loadProfile() {
  const stored = await chrome.storage.local.get("profile");
  return { ...DEFAULT_PROFILE, ...(stored.profile || {}) };
}

function rememberApplied(ids) {
  return chrome.storage.local.get("applied").then(({ applied = {} }) => {
    const next = { ...applied };
    for (const id of ids) next[id] = Date.now();
    return chrome.storage.local.set({ applied: next });
  });
}

async function scan() {
  const profile = await loadProfile();
  const { applied = {} } = await chrome.storage.local.get("applied");
  const jobs = extractJobs().map((job) => {
    const ranked = scoreJob(job, profile);
    return {
      ...job,
      score: ranked.score,
      hits: ranked.hits,
      misses: ranked.misses,
      applied: Boolean(applied[job.id])
    };
  });
  jobs.sort((a, b) => b.score - a.score);
  state.jobs = jobs;
  paint(jobs, profile.minScore ?? 4);
  const good = jobs.filter((job) => job.score >= (profile.minScore ?? 4)).length;
  chrome.runtime.sendMessage({ type: "SET_BADGE", count: good }).catch(() => {});
  return jobs.map(serializeJob);
}

function serializeJob(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    source: job.source,
    score: job.score,
    hits: job.hits,
    misses: job.misses,
    canApply: job.canApply,
    applied: job.applied
  };
}

function paint(jobs, minScore) {
  document.querySelector("[data-mue-job-bot]")?.remove();
  const host = document.createElement("div");
  host.dataset.mueJobBot = "1";
  host.style.cssText = "position:fixed;z-index:2147483646;right:16px;bottom:16px;";
  const shadow = host.attachShadow({ mode: "open" });
  const good = jobs.filter((job) => job.score >= minScore);
  shadow.innerHTML = `
    <style>
      .panel { width: 280px; max-height: 320px; overflow: auto; background: #102027; color: #e7eef0;
        border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.28); font: 12px/1.35 Segoe UI, sans-serif; }
      button { width: 100%; border: 0; background: #0f766e; color: white; padding: 10px 12px;
        border-radius: 12px; font: inherit; font-weight: 700; cursor: pointer; text-align: left; }
      ol { margin: 0; padding: 8px 12px 12px 28px; }
      li { margin: 0 0 8px; }
      small { display: block; color: #9fb0b6; }
      .bad { color: #fda4af; }
    </style>
    <div class="panel">
      <button type="button">${good.length} vagas na sua área, de ${jobs.length}</button>
      <ol>
        ${jobs.slice(0, 8).map((job) => `<li class="${job.score < minScore ? "bad" : ""}">${escapeHtml(job.title)}<small>${job.score} pts · ${escapeHtml(job.company || job.source)}</small></li>`).join("")}
      </ol>
    </div>
  `;
  shadow.querySelector("button").addEventListener("click", () => {
    const list = shadow.querySelector("ol");
    list.hidden = !list.hidden;
  });
  document.documentElement.append(host);
  for (const job of jobs) {
    if (!job.card) continue;
    job.card.style.outline = job.score >= minScore ? "2px solid #0f766e" : "2px solid transparent";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blockerReason() {
  const text = norm(document.body?.innerText?.slice(0, 4000));
  if (/captcha|nao sou um robo|não sou um robô|cloudflare|acesso negado|verifique que voce e humano/.test(text)) {
    return "a página pediu verificação humana";
  }
  return "";
}

async function applySelected(ids, maxApplies) {
  if (state.applying) return { results: [], stopped: true, reason: "já existe uma leva em andamento" };
  state.applying = true;
  const limit = Math.min(Math.max(Number(maxApplies) || 1, 1), 5);
  const chosen = state.jobs.filter((job) => ids.includes(job.id)).slice(0, limit);
  const results = [];
  let stopped = false;
  let reason = "";
  try {
    for (const job of chosen) {
      const blocked = blockerReason();
      if (blocked) {
        stopped = true;
        reason = blocked;
        break;
      }
      const control = job.card ? findApplyControl(job.card) : findApplyControl(document.body);
      if (!control) {
        window.open(job.url, "_blank", "noopener");
        results.push({ id: job.id, ok: false, reason: "sem botão aqui; abri a vaga" });
        continue;
      }
      control.scrollIntoView({ block: "center", behavior: "smooth" });
      await sleep(700 + Math.floor(Math.random() * 900));
      control.click();
      job.applied = true;
      results.push({ id: job.id, ok: true });
      await rememberApplied([job.id]);
      await sleep(4000 + Math.floor(Math.random() * 4000));
      const after = blockerReason();
      if (after) {
        stopped = true;
        reason = after;
        break;
      }
    }
  } finally {
    state.applying = false;
  }
  return { results, stopped, reason };
}

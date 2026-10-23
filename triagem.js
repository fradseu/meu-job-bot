import { loadConfig, saveConfig, getActiveProfile, setActiveProfile } from "./lib/store.js";
import { esc, fmtTime, csvCell } from "./lib/util.js";
import {
  runTriage,
  revaluateStoredJobs,
  acquireLock,
  releaseLock,
  getStoredDigest,
  sendDigestFromHistory,
  ensureOriginPermission
} from "./lib/triage.js";
import { listJobs, clearJobs, getLastRun } from "./lib/seen.js";
import { buildDigest, sendEmail } from "./lib/email.js";
import { aiEvaluate, scoreHeuristic } from "./lib/match.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  config: null,
  running: false,
  controller: null,
  phase: "idle",
  jobs: [],
  digest: null,
  saveTimer: null,
  renderTimer: null,
  autorun: false
};

/* ---------- Helpers para acessar o perfil ativo ---------- */

function activeProfile() {
  return getActiveProfile(state.config);
}

function activeTriage() {
  return activeProfile().triage;
}

function activeCandidate() {
  return activeTriage().candidate;
}

function activeSearches() {
  return activeProfile().searches;
}

function activeEmail() {
  return activeProfile().email;
}

function activeProfileData() {
  return activeProfile().profile;
}

function renderProfileSelector() {
  const selector = $("#profileSelector");
  if (!selector) return;
  const options = state.config.profiles.map((p, i) =>
    `<option value="${p.id}" ${i === state.config.activeProfile ? "selected" : ""}>${p.name}</option>`
  ).join("");
  selector.innerHTML = `<label for="profileSel">Perfil:</label><select id="profileSel">${options}</select>`;
  $("#profileSel").addEventListener("change", (e) => {
    if (setActiveProfile(state.config, e.target.value)) {
      scheduleSave();
      renderGroups();
      renderSearches();
      renderJobs();
      renderDigest(state.digest);
      seedResume(false);
      logLine("info", `Perfil alterado para: ${activeProfile().name}`);
    }
  });
}

/* ------------------------------- definições ------------------------------- */

const CANDIDATE_FIELDS = [
  { key: "targetRoles", label: "Cargos alvo (um por linha)", type: "list", span: true },
  { key: "cities", label: "Cidades / modelo aceitos", type: "list", span: true },
  { key: "seniorities", label: "Senioridades aceitas", type: "list", span: true },
  { key: "salaryFloor", label: "Piso salarial (R$)", type: "number", min: 0, step: 100 },
  { key: "yearsExperience", label: "Anos de experiência", type: "number", min: 0, step: 1 },
  { key: "skills", label: "Stack / competências (uma por linha)", type: "list", span: true },
  { key: "avoid", label: "Evitar quando o título tiver", type: "list", span: true },
  { key: "companiesAvoid", label: "Empresas para ignorar (blacklist)", type: "list", span: true }
];

const SEARCH_FIELDS = [
  { key: "enabled", label: "Triagem diária ligada", type: "bool", span: true },
  { key: "scheduleHour", label: "Hora do dia (0-23)", type: "number", min: 0, max: 23 },
  { key: "maxPagesPerSearch", label: "Páginas por busca", type: "number", min: 1, max: 20 },
  { key: "maxJobsPerRun", label: "Vagas abertas por execução", type: "number", min: 1, max: 300 },
  { key: "maxSearchesPerRun", label: "Buscas por execução (0 = todas)", type: "number", min: 0, max: 100 },
  { key: "delayMinMs", label: "Pausa mínima entre vagas (ms)", type: "number", min: 800, step: 250 },
  { key: "delayMaxMs", label: "Pausa máxima entre vagas (ms)", type: "number", min: 1000, step: 250 },
  { key: "showTab", label: "Trazer a aba de trabalho para a frente", type: "bool", span: true },
  { key: "keepTabOpen", label: "Deixar a aba aberta no fim", type: "bool", span: true }
];

const AI_FIELDS = [
  { key: "enabled", label: "Usar IA na avaliação", type: "bool", span: true },
  { key: "baseUrl", label: "Endpoint compatível com OpenAI", type: "text", span: true, ph: "https://api.openai.com/v1" },
  { key: "model", label: "Modelo", type: "text", ph: "gpt-4o-mini" },
  { key: "apiKey", label: "API key (fica só neste navegador)", type: "password", ph: "sk-..." },
  { key: "minHeuristic", label: "Só manda para a IA a partir de (nota local)", type: "number", min: 0, max: 100 },
  { key: "maxPerRun", label: "Máximo de avaliações de IA por execução", type: "number", min: 1, max: 300 }
];

const EMAIL_FIELDS = [
  { key: "enabled", label: "Enviar o e-mail do dia", type: "bool", span: true },
  {
    key: "provider",
    label: "Provedor",
    type: "select",
    options: [
      ["brevo", "Brevo"],
      ["resend", "Resend"],
      ["web3forms", "Web3Forms"],
      ["custom", "Webhook próprio"]
    ]
  },
  { key: "apiKey", label: "API key / access key", type: "password" },
  { key: "fromName", label: "Nome do remetente", type: "text" },
  { key: "fromEmail", label: "E-mail remetente", type: "text", ph: "voce@dominio.com" },
  { key: "toEmail", label: "E-mail de destino", type: "text", ph: "voce@gmail.com" },
  { key: "webhookUrl", label: "URL do webhook (só no modo webhook)", type: "text", span: true },
  { key: "minScoreToEmail", label: "Nota de corte do e-mail (0 = todas)", type: "number", min: 0, max: 100, target: "triage" },
  { key: "topPerEmail", label: "Máximo de vagas no e-mail", type: "number", min: 1, max: 50, target: "triage" }
];

const SITES = [
  ["catho", "Catho"],
  ["infojobs", "InfoJobs"],
  ["linkedin", "LinkedIn"],
  ["gupy", "Gupy"],
  ["programathor", "Programathor"],
  ["vagas", "Vagas.com"],
  ["indeed", "Indeed"],
  ["outro", "Outro"]
];

const PHASE_TEXT = {
  idle: "ocioso",
  scanning: "varrendo as buscas",
  evaluating: "abrindo e avaliando vagas",
  digest: "montando o e-mail",
  done: "concluído",
  stopped: "parado",
  error: "erro"
};

/* ------------------------------- utilidades ------------------------------- */

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let node = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!node[keys[i]] || typeof node[keys[i]] !== "object") node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function logLine(level, message) {
  const box = $("#log");
  const line = document.createElement("div");
  line.className = `line ${level || "info"}`;
  const stem = document.createElement("span");
  stem.className = "t";
  stem.textContent = `[${fmtTime()}] `;
  line.appendChild(stem);
  const body = document.createElement("span");
  body.className = level || "info";
  body.textContent = message;
  line.appendChild(body);
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function scheduleSave() {
  $("#saveHint").textContent = "salvando…";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    await saveConfig(state.config);
    $("#saveHint").textContent = "salvo";
    setTimeout(() => {
      if ($("#saveHint").textContent === "salvo") $("#saveHint").textContent = "";
    }, 1500);
  }, 400);
}

function localDay(ts = Date.now()) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* ------------------------------- renderização ------------------------------- */

function fieldHtml(spec, value, path) {
  const id = `f_${path.replace(/\./g, "_")}`;
  if (spec.type === "bool") {
    return `<label class="field check ${spec.span ? "span2" : ""}"><input type="checkbox" id="${id}" data-path="${path}" ${value ? "checked" : ""}><span>${esc(spec.label)}</span></label>`;
  }
  if (spec.type === "list") {
    return `<label class="field ${spec.span ? "span2" : ""}"><span>${esc(spec.label)}</span><textarea id="${id}" data-path="${path}" rows="3">${esc((value || []).join("\n"))}</textarea></label>`;
  }
  if (spec.type === "select") {
    const options = (spec.options || [])
      .map(([val, label]) => `<option value="${val}" ${String(value) === val ? "selected" : ""}>${esc(label)}</option>`)
      .join("");
    return `<label class="field ${spec.span ? "span2" : ""}"><span>${esc(spec.label)}</span><select id="${id}" data-path="${path}">${options}</select></label>`;
  }
  const type = spec.type === "number" ? "number" : spec.type === "password" ? "password" : "text";
  const extra = [
    spec.min != null ? `min="${spec.min}"` : "",
    spec.max != null ? `max="${spec.max}"` : "",
    spec.step != null ? `step="${spec.step}"` : "",
    spec.ph ? `placeholder="${esc(spec.ph)}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `<label class="field ${spec.span ? "span2" : ""}"><span>${esc(spec.label)}</span><input id="${id}" type="${type}" data-path="${path}" value="${esc(value ?? "")}" ${extra}></label>`;
}

function renderGroups() {
  const prof = activeProfile();
  $("#candidateGrid").innerHTML = CANDIDATE_FIELDS.map((spec) =>
    fieldHtml(spec, getPath(prof.triage.candidate, spec.key), `profiles.${prof.id}.triage.candidate.${spec.key}`)
  ).join("");
  $("#searchGrid").innerHTML = SEARCH_FIELDS.map((spec) =>
    fieldHtml(spec, getPath(prof.triage, spec.key), `profiles.${prof.id}.triage.${spec.key}`)
  ).join("");
  $("#aiGrid").innerHTML = AI_FIELDS.map((spec) =>
    fieldHtml(spec, getPath(state.config.ai, spec.key), `ai.${spec.key}`)
  ).join("");
  $("#emailGrid").innerHTML = EMAIL_FIELDS.map((spec) => {
    const target = spec.target || "email";
    const val = target === "email" ? getPath(activeEmail(), spec.key) : getPath(state.config[target], spec.key);
    return fieldHtml(spec, val, `profiles.${prof.id}.${target}.${spec.key}`);
  }).join("");
  updateEmailVisibility();
  updateAiVisibility();
  renderProfileSelector();
}

const PROVIDER_HINT = {
  brevo: "Brevo: API key + remetente verificado (o HTML vai completo).",
  resend: "Resend: sem domínio próprio use onboarding@resend.dev e envie para o e-mail da conta.",
  web3forms: "Web3Forms: a access key já está configurada. O digest chega em texto simples no e-mail dono da chave.",
  custom: "Webhook: recebe um POST JSON com to, subject, html, text e from."
};

let lastHintProvider = "";

function updateEmailVisibility() {
  const email = activeEmail();
  const provider = email.provider;
  const webhook = $('[data-path="email.webhookUrl"]');
  if (webhook) webhook.closest(".field").style.display = provider === "custom" ? "" : "none";
  const fromEmail = $('[data-path="email.fromEmail"]');
  if (fromEmail) fromEmail.closest(".field").style.display = provider === "web3forms" ? "none" : "";
  const apiKey = $('[data-path="email.apiKey"]');
  if (apiKey) apiKey.closest(".field").style.display = provider === "custom" ? "none" : "";
  const hint = $("#emailHint");
  if (hint && lastHintProvider !== provider) {
    hint.textContent = PROVIDER_HINT[provider] || "";
    lastHintProvider = provider;
  }
}

function updateAiVisibility() {
  const enabled = Boolean(state.config.ai.enabled);
  for (const key of ["baseUrl", "model", "apiKey", "minHeuristic", "maxPerRun"]) {
    const el = $(`[data-path="ai.${key}"]`);
    if (el) el.closest(".field").style.opacity = enabled ? "1" : ".55";
  }
}

function renderSearches() {
  const prof = activeProfile();
  $("#searchList").innerHTML = prof.searches
    .map((search) => {
      const options = SITES.map(
        ([value, label]) =>
          `<option value="${value}" ${search.site === value ? "selected" : ""}>${label}</option>`
      ).join("");
      return `
        <div class="searchRow" data-id="${esc(search.id)}">
          <label class="enabled" title="ativa"><input type="checkbox" data-sf="enabled" ${search.enabled ? "checked" : ""}></label>
          <select data-sf="site">${options}</select>
          <input data-sf="label" value="${esc(search.label)}" placeholder="apelido">
          <button class="iconBtn" data-act="delSearch" type="button" title="remover">✕</button>
          <input class="wide" data-sf="url" value="${esc(search.url)}" placeholder="https://www.catho.com.br/vagas/desenvolvedor/">
        </div>`;
    })
    .join("");

  const meta = $("#searchMeta");
  if (meta) {
    const active = prof.searches.filter(
      (search) => search.enabled && String(search.url || "").trim()
    ).length;
    const cap = Number(activeTriage().maxSearchesPerRun) || 0;
    meta.textContent = `${active} ativa(s) de ${prof.searches.length}${cap && active > cap ? ` · ${cap} por execução (rodízio)` : ""}`;
  }
}

const ROLE_SITE_URLS = {
  catho: (slug) => `https://www.catho.com.br/vagas/${slug}/`,
  infojobs: (slug) => `https://www.infojobs.com.br/vagas-de-emprego-${slug}.aspx`
};

const SITE_LABEL = { catho: "Catho", infojobs: "InfoJobs" };

function slugifyRole(role) {
  return String(role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateRoleSearches() {
  const prof = activeProfile();
  const roles = (prof.triage.candidate.targetRoles || [])
    .map((role) => String(role || "").trim())
    .filter(Boolean);
  if (!roles.length) {
    logLine("warn", "Preencha os cargos alvo antes de gerar as buscas.");
    return;
  }

  const existing = new Set(
    prof.searches.map((search) => String(search.url || "").trim().replace(/\/+$/, ""))
  );
  let added = 0;

  for (const role of roles) {
    const slug = slugifyRole(role);
    if (!slug) continue;
    for (const [site, build] of Object.entries(ROLE_SITE_URLS)) {
      const url = build(slug);
      const key = url.replace(/\/+$/, "");
      if (existing.has(key)) continue;
      existing.add(key);
      prof.searches.push({
        id: `s_${Date.now()}_${added}`,
        site,
        label: `${SITE_LABEL[site]} — ${role}`,
        url,
        enabled: true
      });
      added += 1;
    }
  }

  renderSearches();
  scheduleSave();
  if (added) logLine("ok", `${added} busca(s) criada(s) para ${roles.length} cargo(s).`);
  else logLine("info", "Todas as buscas desses cargos já existiam.");
}

function renderStatus(kind) {
  const pill = $("#statusPill");
  pill.className = `pill ${kind}`;
  pill.textContent = {
    idle: "parado",
    scanning: "varrendo",
    evaluating: "avaliando",
    digest: "montando e-mail",
    done: "concluído",
    stopped: "parado",
    error: "erro"
  }[kind] || kind;
}

function renderPhase() {
  $("#phase").textContent = PHASE_TEXT[state.phase] || state.phase;
}

function renderStats(summary) {
  if (!summary) {
    $("#stats").textContent = "";
    return;
  }
  $("#stats").textContent = [
    `páginas ${summary.pages || 0}`,
    `links ${summary.linksFound || 0}`,
    `novas ${summary.newCandidates || 0}`,
    `abertas ${summary.visited || 0}`,
    `60+ ${summary.digestCount || 0}`,
    summary.aiUsed ? `ia ${summary.aiUsed}` : "",
    summary.emailSent ? "e-mail enviado" : "",
    summary.emailError ? `erro no e-mail: ${summary.emailError}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderNextRun() {
  const triage = activeTriage();
  if (!triage.enabled) {
    $("#nextRun").textContent = "agendamento desligado";
    return;
  }
  const now = new Date();
  const at = new Date(now);
  at.setHours(Number(triage.scheduleHour) || 0, 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  const label = at.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const ranToday = state.lastRun && localDay(state.lastRun.finishedAt) === localDay();
  $("#nextRun").textContent = ranToday
    ? `já rodou hoje · próxima ${label}`
    : `próxima ${label}`;
}

function statusOf(job) {
  if (job.emailedAt) return { label: "enviada", cls: "enviada" };
  if (job.status === "erro") return { label: "erro", cls: "erro" };
  if (localDay(job.checkedAt) === localDay()) return { label: "nova", cls: "nova" };
  return { label: "avaliada", cls: "avaliada" };
}

function renderJobs() {
  const body = $("#jobsBody");
  const term = ($("#filterText").value || "").toLowerCase().trim();
  const minScore = Number($("#filterScore").value) || 0;
  const onlyNew = $("#filterNew").checked;

  const filtered = state.jobs.filter((job) => {
    if (Number(job.score || 0) < minScore) return false;
    if (onlyNew && job.emailedAt) return false;
    if (!term) return true;
    return `${job.title || ""} ${job.company || ""} ${job.location || ""}`.toLowerCase().includes(term);
  });

  $("#jobsFoot").textContent = `${filtered.length} de ${state.jobs.length} vaga(s) no histórico.`;
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Nenhuma vaga aqui ainda. Clique em "Rodar agora".</td></tr>';
    return;
  }

  body.innerHTML = filtered
    .slice(0, 300)
    .map((job) => {
      const status = statusOf(job);
      const reasons = (job.reasons || []).slice(0, 3).join(" · ");
      const gaps = (job.gaps || []).slice(0, 2).join(" · ");
      return `
        <tr>
          <td><div class="scoreCell ${esc(job.verdict || "fraca")}">${Number(job.score) || 0}</div></td>
          <td>
            <a class="jobTitle" href="${esc(job.url)}" target="_blank" rel="noreferrer">${esc(job.title || "(sem título)")}</a>
            <div class="jobWhy"><span class="siteTag">${esc(job.site || "")}</span> ${esc(reasons)}</div>
            ${gaps ? `<div class="jobGap">atenção: ${esc(gaps)}</div>` : ""}
          </td>
          <td>${esc(job.company || "—")}<div class="muted small">${esc(job.location || "")}</div></td>
          <td><span class="badge ${status.cls}">${status.label}</span>${job.salary ? `<div class="muted small">${esc(job.salary)}</div>` : ""}</td>
          <td><a class="ghost small" href="${esc(job.url)}" target="_blank" rel="noreferrer">abrir</a></td>
        </tr>`;
    })
    .join("");
}

function renderDigest(digest) {
  state.digest = digest;
  if (!digest) {
    $("#digestSubject").textContent = "Nenhum digest gerado ainda.";
    $("#digestMeta").textContent = "";
    $("#digestPreview").srcdoc = "";
    return;
  }
  $("#digestSubject").textContent = digest.subject || "(sem assunto)";
  const bits = [`${digest.total || 0} vaga(s)`];
  if (digest.sentAt) bits.push(`enviado ${new Date(digest.sentAt).toLocaleString("pt-BR")}`);
  else bits.push("não enviado");
  if (digest.error) bits.push(`erro: ${digest.error}`);
  $("#digestMeta").textContent = bits.join(" · ");
  $("#digestPreview").srcdoc = digest.html || "";
}

function renderProgress(done, total) {
  const fill = $("#progressFill");
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  fill.style.width = `${pct}%`;
}

/* ------------------------------- execução ------------------------------- */

function validate() {
  const errors = [];
  const prof = activeProfile();
  const resume = String(prof.triage.candidate.resumeText || "").trim();
  if (resume.length < 120) errors.push("Cole o texto do seu currículo (mínimo ~120 caracteres).");
  if (!prof.searches.some((search) => search.enabled && String(search.url || "").trim())) {
    errors.push("Ative pelo menos uma busca com URL.");
  }
  if (Number(prof.triage.delayMinMs) >= Number(prof.triage.delayMaxMs)) {
    errors.push("A pausa mínima precisa ser menor que a máxima.");
  }
  if (prof.email.enabled && !String(prof.email.toEmail || "").includes("@")) {
    errors.push("Preencha o e-mail de destino para o envio diário.");
  }
  return errors;
}

function toggleRunning(running) {
  state.running = running;
  $("#btnRun").disabled = running;
  $("#btnStop").disabled = !running;
  $("#btnReval").disabled = running;
}

async function start({ auto = false } = {}) {
  if (state.running) return;
  const errors = validate();
  if (errors.length) {
    if (auto) logLine("warn", "Execução automática cancelada: configuração incompleta.");
    for (const message of errors) logLine("warn", message);
    if (auto) return;
    return;
  }

  if (auto) {
    const last = await getLastRun();
    if (last && last.finishedAt && localDay(last.finishedAt) === localDay()) {
      logLine("info", "A triagem já rodou hoje. Não vou repetir.");
      return;
    }
  }

  const lock = await acquireLock("triagem-page");
  if (!lock.ok) {
    logLine("warn", "Já existe uma triagem em andamento em outra aba. Espere ela terminar.");
    return;
  }

  await saveConfig(state.config);
  state.controller = new AbortController();
  toggleRunning(true);
  state.phase = "scanning";
  renderPhase();
  renderStatus("scanning");
  renderProgress(0, 1);
  logLine("info", auto ? "Triagem automática iniciada." : "Triagem iniciada.");

  // Extrai o perfil ativo e cria o formato que runTriage espera
  const prof = activeProfile();
  const runConfig = {
    triage: prof.triage,
    ai: state.config.ai,
    email: prof.email,
    searches: prof.searches,
    profile: prof.profile
  };

  try {
    const { summary, digest } = await runTriage({
      config: runConfig,
      signal: state.controller.signal,
      onEvent: (event) => handleEvent(event)
    });
    state.phase = summary.stoppedBy ? "stopped" : "done";
    renderPhase();
    renderStatus(state.phase);
    renderStats(summary);
    renderProgress(1, 1);
    renderDigest(digest);
    state.lastRun = summary;
    await reloadJobs();
    renderNextRun();
    logLine(
      "ok",
      `Fim: ${summary.visited} vaga(s) aberta(s), ${summary.digestCount} no e-mail, ${summary.failed} falha(s)${summary.stoppedBy ? `, parado por ${summary.stoppedBy}` : ""}.`
    );
  } catch (error) {
    state.phase = "error";
    renderPhase();
    renderStatus("error");
    logLine("error", `Erro: ${error.message}`);
    console.error(error);
  } finally {
    state.controller = null;
    toggleRunning(false);
    await releaseLock();
  }
}

function handleEvent(event) {
  if (!event || !event.type) return;
  if (event.type === "log") {
    logLine(event.level, event.message);
    return;
  }
  if (event.type === "phase") {
    state.phase = event.phase;
    renderPhase();
    renderStatus(event.phase);
    if (event.phase === "evaluating") renderProgress(0, 1);
    return;
  }
  if (event.type === "job") {
    const index = state.jobs.findIndex((job) => job.key === event.job.key);
    if (index >= 0) state.jobs[index] = event.job;
    else state.jobs.unshift(event.job);
    scheduleJobsRender();
    const total = activeTriage().maxJobsPerRun || 1;
    renderProgress(state.jobs.filter((job) => localDay(job.checkedAt) === localDay()).length, total);
    return;
  }
  if (event.type === "digest") {
    renderDigest(event.digest);
    return;
  }
  if (event.type === "blocked") {
    state.phase = "stopped";
    renderPhase();
    renderStatus("stopped");
    return;
  }
  if (event.type === "done") {
    renderStats(event.summary);
    renderDigest(event.digest);
  }
}

function scheduleJobsRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderJobs, 250);
}

async function reloadJobs() {
  state.jobs = await listJobs();
  renderJobs();
}

async function revaluate() {
  if (state.running) return;
  const lock = await acquireLock("triagem-page");
  if (!lock.ok) {
    logLine("warn", "Já existe uma execução em andamento.");
    return;
  }
  toggleRunning(true);
  state.controller = new AbortController();
  logLine("info", "Reavaliando as vagas guardadas (sem reabrir as páginas)...");
  try {
    const prof = activeProfile();
    const revalConfig = {
      triage: prof.triage,
      ai: state.config.ai,
      email: prof.email,
      searches: prof.searches,
      profile: prof.profile
    };
    const result = await revaluateStoredJobs({
      config: revalConfig,
      signal: state.controller.signal,
      onEvent: (event) => {
        if (event.type === "revaluated" && event.done % 20 === 0) {
          logLine("info", `${event.done}/${event.total} reavaliadas...`);
        }
        if (event.type === "log") logLine(event.level, event.message);
      }
    });
    await reloadJobs();
    renderDigest(result.digest);
    logLine("ok", `Reavaliação concluída: ${result.changed} vaga(s)${result.aiUsed ? `, ${result.aiUsed} com IA` : ""}.`);
  } catch (error) {
    logLine("error", `Reavaliação falhou: ${error.message}`);
  } finally {
    state.controller = null;
    toggleRunning(false);
    await releaseLock();
  }
}

/* ------------------------------- ações ------------------------------- */

async function testAi() {
  const hint = $("#aiHint");
  const ai = state.config.ai;
  if (!String(ai.apiKey || "").trim()) {
    hint.textContent = "informe a API key primeiro.";
    return;
  }
  hint.textContent = "testando...";
  const fakeJob = {
    title: "Desenvolvedor Full Stack Júnior",
    company: "Empresa Teste",
    location: "São Paulo - SP (híbrido)",
    salary: "R$ 5.000",
    description:
      "Buscamos pessoa desenvolvedora com Node.js, React, PostgreSQL e APIs REST. Desejável Python e experiência com automação. Modelo híbrido em São Paulo."
  };
  try {
    const { ensureOriginPermission: ask } = await import("./lib/triage.js");
    await ask(ai.baseUrl);
    const prof = activeProfile();
    const result = await aiEvaluate(fakeJob, prof.triage.candidate, ai);
    hint.textContent = `ok: nota ${result.score} (${result.reasons.slice(0, 2).join("; ") || "sem motivos"})`;
    logLine("ok", `IA respondeu: ${JSON.stringify(result)}`);
  } catch (error) {
    const prof = activeProfile();
    const fallback = scoreHeuristic(fakeJob, prof.triage.candidate);
    hint.textContent = `falhou: ${error.message}`;
    logLine("error", `Teste da IA falhou: ${error.message} (nota local seria ${fallback.score})`);
  }
}

async function testEmail() {
  const hint = $("#emailHint");
  const email = activeEmail();
  if (!String(email.toEmail || "").includes("@")) {
    hint.textContent = "informe o e-mail de destino.";
    return;
  }
  hint.textContent = "enviando...";
  const prof = activeProfile();
  const sample = buildDigest({
    jobs: [
      {
        title: "Professor(a) de Inglês",
        company: "Escola de Idiomas Teste",
        location: "São Paulo - SP",
        salary: "R$ 3.500",
        site: "catho",
        score: 85,
        verdict: "forte",
        reasons: ["cargo alvo: professor de inglês", "inglês fluente", "licenciatura"],
        gaps: ["experiência desejada"],
        url: "https://www.catho.com.br/vagas/professor-ingles/00000000"
      }
    ],
    candidate: { fullName: prof.profile.fullName },
    siteCounts: { catho: 1 }
  });
  try {
    await sendEmail({ ...email, enabled: true }, sample);
    hint.textContent = "enviado — confira sua caixa de entrada.";
    logLine("ok", "E-mail de teste enviado.");
  } catch (error) {
    hint.textContent = `falhou: ${error.message}`;
    logLine("error", `E-mail de teste falhou: ${error.message}`);
  }
}

async function sendDigestNow() {
  const hint = $("#emailHint");
  hint.textContent = "enviando...";
  try {
    const prof = activeProfile();
    const digestConfig = {
      triage: prof.triage,
      ai: state.config.ai,
      email: prof.email,
      searches: prof.searches,
      profile: prof.profile
    };
    const digest = await sendDigestFromHistory({ config: digestConfig });
    renderDigest(digest);
    await reloadJobs();
    hint.textContent = `enviado (${digest.total} vaga(s)) — confira a caixa de entrada.`;
    logLine("ok", `E-mail com ${digest.total} vaga(s) enviado a partir do painel.`);
  } catch (error) {
    hint.textContent = `falhou: ${error.message}`;
    logLine("error", `Envio do digest falhou: ${error.message}`);
  }
}

function exportCsv() {
  const rows = [["nota", "veredito", "vaga", "empresa", "local", "salario", "site", "status", "motivos", "atencao", "url"]];
  for (const job of state.jobs) {
    const status = statusOf(job);
    rows.push([
      job.score,
      job.verdict,
      job.title,
      job.company,
      job.location,
      job.salary,
      job.site,
      status.label,
      (job.reasons || []).join("; "),
      (job.gaps || []).join("; "),
      job.url
    ]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `triagem-vagas-${localDay()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

function downloadDigest() {
  if (!state.digest || !state.digest.html) {
    logLine("warn", "Nenhum digest para baixar ainda.");
    return;
  }
  const blob = new Blob([state.digest.html], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `triagem-${localDay()}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

async function copyDigestList() {
  if (!state.digest || !state.digest.text) {
    logLine("warn", "Nenhuma lista para copiar.");
    return;
  }
  try {
    await navigator.clipboard.writeText(state.digest.text);
    logLine("ok", "Lista copiada para a área de transferência.");
  } catch {
    logLine("warn", "O navegador não liberou a área de transferência.");
  }
}

async function seedResume(force = false) {
  const prof = activeProfile();
  const current = String(prof.resumeText || "").trim();
  if (current && !force) return;
  const resumeFile = prof.id === "luciana" ? "data/curriculo-luciana.txt" : "data/curriculo.txt";
  try {
    const response = await fetch(chrome.runtime.getURL(resumeFile));
    if (!response.ok) throw new Error(String(response.status));
    const text = (await response.text()).trim();
    if (!text) throw new Error("arquivo vazio");
    prof.resumeText = text;
    prof.triage.candidate.resumeText = text;
    $("#resumeText").value = text;
    updateResumeMeta();
    scheduleSave();
    logLine("info", `Currículo carregado de ${resumeFile}.`);
  } catch (error) {
    logLine("warn", `Não achei ${resumeFile} (${error.message}). Cole o texto à mão.`);
  }
}

function updateResumeMeta() {
  const prof = activeProfile();
  const text = String(prof.resumeText || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  $("#resumeMeta").textContent = text ? `${text.length} caracteres · ${words} palavras` : "sem currículo";
}

async function authorizeSites() {
  const prof = activeProfile();
  const urls = [...new Set(prof.searches.map((search) => search.url).filter(Boolean))];
  const extra = [activeEmail().webhookUrl, state.config.ai?.baseUrl].filter((url) =>
    url && !/api\.openai\.com/.test(url)
  );
  let granted = 0;
  for (const url of urls) {
    if (await ensureOriginPermission(url)) granted += 1;
  }
  let extraGranted = 0;
  for (const url of extra) {
    if (await ensureOriginPermission(url)) extraGranted += 1;
  }
  logLine(granted ? "ok" : "warn", `${granted}/${urls.length} site(s) autorizado(s).`);
  if (extra.length) logLine("info", `${extraGranted}/${extra.length} endpoint(s) extra(s) autorizado(s).`);
}

/* ------------------------------- eventos ------------------------------- */

function bindFields(selector) {
  $(selector).addEventListener("input", (event) => {
    const path = event.target.dataset.path;
    if (!path) return;
    const spec = [...CANDIDATE_FIELDS, ...SEARCH_FIELDS, ...AI_FIELDS, ...EMAIL_FIELDS].find(
      (item) => item.key === path.split(".").pop()
    );
    let value = event.target.value;
    if (event.target.type === "checkbox") value = event.target.checked;
    else if (spec?.type === "list") value = lines(value);
    else if (spec?.type === "number") value = Number(value) || 0;
    setPath(state.config, path, value);
    scheduleSave();
    if (path.includes("triage.scheduleHour") || path.includes("triage.enabled")) renderNextRun();
  });
}

function bindEvents() {
  bindFields("#candidateGrid");
  bindFields("#searchGrid");
  bindFields("#aiGrid");
  bindFields("#emailGrid");

  // "input" já salva (bindFields); aqui só ajustamos a visibilidade condicional.
  $("#emailGrid").addEventListener("change", (event) => {
    if (event.target.dataset.path?.includes("email.provider")) updateEmailVisibility();
  });
  $("#aiGrid").addEventListener("change", (event) => {
    if (event.target.dataset.path === "ai.enabled") updateAiVisibility();
  });
  $("#searchGrid").addEventListener("change", (event) => {
    if (event.target.dataset.path === "triage.enabled") renderNextRun();
    if (event.target.dataset.path === "triage.maxSearchesPerRun") renderSearches();
  });

  $("#resumeText").addEventListener("input", (event) => {
    const prof = activeProfile();
    prof.triage.candidate.resumeText = event.target.value;
    prof.resumeText = event.target.value;
    updateResumeMeta();
    scheduleSave();
  });

  $("#resumeFile").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const prof = activeProfile();
    prof.triage.candidate.resumeText = text;
    prof.resumeText = text;
    $("#resumeText").value = text;
    updateResumeMeta();
    scheduleSave();
    logLine("ok", `Currículo importado: ${file.name}`);
  });

  $("#btnResumeSeed").addEventListener("click", () => seedResume(true));

  $("#searchList").addEventListener("input", (event) => {
    const field = event.target.dataset.sf;
    if (!field) return;
    const row = event.target.closest(".searchRow");
    const prof = activeProfile();
    const search = prof.searches.find((entry) => entry.id === row.dataset.id);
    if (!search) return;
    search[field] = field === "enabled" ? event.target.checked : event.target.value;
    scheduleSave();
  });
  $("#searchList").addEventListener("change", (event) => {
    const field = event.target.dataset.sf;
    if (!field) return;
    const row = event.target.closest(".searchRow");
    const prof = activeProfile();
    const search = prof.searches.find((entry) => entry.id === row.dataset.id);
    if (!search) return;
    search[field] = field === "enabled" ? event.target.checked : event.target.value;
    scheduleSave();
  });
  $("#searchList").addEventListener("click", (event) => {
    const button = event.target.closest('[data-act="delSearch"]');
    if (!button) return;
    const row = button.closest(".searchRow");
    const prof = activeProfile();
    prof.searches = prof.searches.filter((entry) => entry.id !== row.dataset.id);
    renderSearches();
    scheduleSave();
  });

  $("#btnAddSearch").addEventListener("click", () => {
    const prof = activeProfile();
    prof.searches.push({
      id: `s_${Date.now()}`,
      site: "outro",
      label: "Nova busca",
      url: "",
      enabled: true
    });
    renderSearches();
    scheduleSave();
  });

  $("#btnGenSearches").addEventListener("click", () => generateRoleSearches());

  $("#btnRun").addEventListener("click", () => start());
  $("#btnStop").addEventListener("click", () => {
    if (state.controller) {
      state.controller.abort();
      logLine("warn", "Parada solicitada — encerro depois da vaga atual.");
    }
  });
  $("#btnReval").addEventListener("click", revaluate);
  $("#btnAuth").addEventListener("click", authorizeSites);
  $("#btnTestAi").addEventListener("click", testAi);
  $("#btnEmailTest").addEventListener("click", testEmail);
  $("#btnEmailDigest").addEventListener("click", sendDigestNow);
  $("#btnCsv").addEventListener("click", exportCsv);
  $("#btnDigestHtml").addEventListener("click", downloadDigest);
  $("#btnDigestCopy").addEventListener("click", copyDigestList);

  $("#btnClearJobs").addEventListener("click", async () => {
    if (!confirm("Apagar o histórico de vagas já vistas? A próxima triagem vai reavaliar tudo de novo.")) return;
    await clearJobs();
    state.jobs = [];
    renderJobs();
    logLine("warn", "Histórico de vagas zerado.");
  });

  $("#filterText").addEventListener("input", renderJobs);
  $("#filterScore").addEventListener("change", renderJobs);
  $("#filterNew").addEventListener("change", renderJobs);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "MJB_TRIAGE_RUN") start({ auto: true });
  });
}

/* ------------------------------- init ------------------------------- */

async function init() {
  state.config = await loadConfig();
  state.lastRun = await getLastRun();

  renderGroups();
  renderSearches();
  renderStatus("idle");
  renderPhase();
  renderNextRun();
  toggleRunning(false);

  const prof = activeProfile();
  $("#resumeText").value = prof.resumeText || prof.triage.candidate.resumeText || "";
  updateResumeMeta();
  if (!String(prof.resumeText || prof.triage.candidate.resumeText || "").trim()) await seedResume();

  state.jobs = await listJobs();
  renderJobs();
  renderDigest(await getStoredDigest());
  if (state.lastRun) renderStats(state.lastRun);

  const tab = await chrome.tabs.getCurrent();
  if (tab?.id != null) chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});

  bindEvents();
  await saveConfig(state.config);

  const params = new URLSearchParams(location.search);
  if (params.get("autorun") === "1") {
    state.autorun = true;
    logLine("info", "Execução automática agendada pelo alarme diário.");
    setTimeout(() => start({ auto: true }), 1200);
  } else {
    logLine("info", "Pronto. A triagem abre cada vaga, compara com o currículo e guarda o link.");
  }
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<pre style="color:#f87171;padding:16px">Falha ao iniciar a triagem: ${esc(error.message)}</pre>`
  );
});

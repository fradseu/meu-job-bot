import {
  loadConfig,
  saveConfig,
  getRun,
  setRun,
  getHistory,
  recordHistory,
  getDaily,
  bumpDaily,
  getLogs,
  pushLog,
  clearLogs,
  clearHistory
} from "./lib/store.js";
import { sleep, esc, fmtTime, csvCell, uid, readFileAsDataUrl } from "./lib/util.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PROFILE_FIELDS = [
  { key: "fullName", label: "Nome completo", type: "text", ph: "Maria Silva" },
  { key: "email", label: "E-mail", type: "email", ph: "maria@exemplo.com" },
  { key: "phone", label: "Telefone / WhatsApp", type: "tel", ph: "(11) 99999-0000" },
  { key: "city", label: "Cidade", type: "text", ph: "São Paulo" },
  { key: "state", label: "UF", type: "text", ph: "SP" },
  { key: "salaryExpectation", label: "Pretensão salarial", type: "text", ph: "R$ 5.000" },
  { key: "linkedin", label: "LinkedIn", type: "url", ph: "https://linkedin.com/in/..." },
  { key: "github", label: "GitHub", type: "url", ph: "https://github.com/..." },
  { key: "portfolio", label: "Portfólio / site", type: "url", ph: "https://..." },
  { key: "yearsExperience", label: "Anos de experiência", type: "text", ph: "3" },
  { key: "education", label: "Escolaridade", type: "text", ph: "Superior cursando" },
  { key: "english", label: "Inglês", type: "text", ph: "Intermediário" },
  { key: "availability", label: "Disponibilidade", type: "text", ph: "Imediata" },
  { key: "pcd", label: "PCD", type: "text", ph: "Não" },
  {
    key: "summary",
    label: "Resumo / mensagem padrão",
    type: "textarea",
    ph: "Desenvolvedor focado em...",
    span: true
  }
];

const RULES_META = [
  { key: "includeKeywords", label: "Incluir títulos com (uma por linha)", type: "list" },
  { key: "excludeKeywords", label: "Excluir títulos com (uma por linha)", type: "list" },
  { key: "minDelayMs", label: "Atraso mínimo (ms)", type: "number", min: 1000, step: 500 },
  { key: "maxDelayMs", label: "Atraso máximo (ms)", type: "number", min: 1500, step: 500 },
  { key: "maxPerRun", label: "Máximo por execução", type: "number", min: 1 },
  { key: "maxPerDay", label: "Máximo por dia", type: "number", min: 1 },
  { key: "autoSubmit", label: "Enviar sem confirmação (só depois de testar)", type: "bool" },
  { key: "dryRun", label: "Modo teste: preenche e nunca envia", type: "bool" },
  { key: "skipAlreadyApplied", label: "Pular vagas já registradas", type: "bool" },
  { key: "keepTabActive", label: "Manter a aba da vaga em primeiro plano", type: "bool" }
];

const SITES = [
  ["catho", "Catho"],
  ["infojobs", "InfoJobs"],
  ["linkedin", "LinkedIn"],
  ["gupy", "Gupy"],
  ["programathor", "Programathor"],
  ["vagas", "Vagas.com"],
  ["indeed", "Indeed"],
  ["outro", "Outro site"]
];

const STATUS_TEXT = {
  pending: "na fila",
  open: "abrindo",
  applied: "candidatado",
  skipped: "pulado",
  failed: "falhou",
  needs_review: "revisar",
  dry_run: "teste",
  stopped: "parado"
};

const PILL_TEXT = {
  idle: "parado",
  scanning: "escaneando",
  applying: "candidatando",
  review: "aguardando você",
  done: "concluído",
  stopped: "parado",
  interrupted: "interrompido",
  error: "erro"
};

const state = {
  config: null,
  run: null,
  running: false,
  stopRequested: false,
  workTabId: null,
  decision: null,
  saveTimer: null
};

/* ---------- log ---------- */

function renderLogEntry(entry) {
  const box = $("#log");
  const line = document.createElement("div");
  line.className = `line ${entry.level || "info"}`;
  const stem = document.createElement("span");
  stem.className = "t";
  stem.textContent = `[${fmtTime(entry.ts)}] `;
  line.appendChild(stem);
  line.appendChild(document.createTextNode(entry.message));
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

async function log(level, message) {
  const entry = { ts: Date.now(), level, message: String(message) };
  renderLogEntry(entry);
  try {
    await pushLog(entry);
  } catch {
    /* log é melhor-esforço */
  }
}

/* ---------- persistência ---------- */

function scheduleSave() {
  const hint = $("#saveHint");
  hint.textContent = "salvando…";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    await saveConfig(state.config);
    hint.textContent = "salvo";
    setTimeout(() => {
      if (hint.textContent === "salvo") hint.textContent = "";
    }, 1600);
  }, 350);
}

/* ---------- render ---------- */

function renderProfile() {
  const grid = $("#profileGrid");
  grid.innerHTML = PROFILE_FIELDS.map((field) => {
    const value = esc(state.config.profile[field.key] || "");
    const control =
      field.type === "textarea"
        ? `<textarea data-profile="${field.key}" rows="4" placeholder="${esc(field.ph)}">${value}</textarea>`
        : `<input data-profile="${field.key}" type="${field.type}" value="${value}" placeholder="${esc(field.ph)}">`;
    return `<label class="field ${field.span ? "span2" : ""}"><span>${esc(field.label)}</span>${control}</label>`;
  }).join("");
}

function renderResume() {
  const resume = state.config.resume;
  $("#resumeInfo").textContent = resume
    ? `${resume.name} · ${Math.round((resume.size || 0) / 1024)} KB`
    : "nenhum arquivo (o formulário fica sem anexo)";
  $("#resumeClear").classList.toggle("hidden", !resume);
}

function renderSearches() {
  const list = $("#searchList");
  list.innerHTML = state.config.searches
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
}

function renderRules() {
  const grid = $("#rulesGrid");
  grid.innerHTML = RULES_META.map((meta) => {
    const value = state.config.rules[meta.key];
    if (meta.type === "bool") {
      return `<label class="field check span2"><input type="checkbox" data-rule="${meta.key}" ${value ? "checked" : ""}><span>${esc(meta.label)}</span></label>`;
    }
    if (meta.type === "number") {
      return `<label class="field"><span>${esc(meta.label)}</span><input type="number" data-rule="${meta.key}" value="${esc(value)}" min="${meta.min || 0}" step="${meta.step || 1}"></label>`;
    }
    return `<label class="field span2"><span>${esc(meta.label)}</span><textarea data-rule="${meta.key}" rows="4">${esc(
      (value || []).join("\n")
    )}</textarea></label>`;
  }).join("");
}

function renderStatus(status) {
  const pill = $("#statusPill");
  pill.className = `pill ${status}`;
  pill.textContent = PILL_TEXT[status] || status;
}

function renderStats() {
  const run = state.run;
  if (!run) {
    $("#stats").textContent = "";
    return;
  }
  const stats = run.stats || {};
  $("#stats").textContent = [
    `fila ${run.queue.length}`,
    `candidaturas ${stats.applied || 0}`,
    `puladas ${stats.skipped || 0}`,
    `revisão ${stats.review || 0}`,
    `falhas ${stats.failed || 0}`,
    `teste ${stats.dry || 0}`
  ].join(" · ");
}

function renderQueue() {
  const body = $("#queueBody");
  const run = state.run;
  if (!run || !run.queue.length) {
    body.innerHTML =
      '<tr><td colspan="5" class="empty">Nenhuma vaga na fila. Ative uma busca e clique em Iniciar.</td></tr>';
    return;
  }
  body.innerHTML = run.queue
    .map((item, index) => {
      const label = STATUS_TEXT[item.state] || item.state;
      const actions = [];
      if (item.url) {
        actions.push(
          `<a class="ghost small" href="${esc(item.url)}" target="_blank" rel="noreferrer" style="padding:4px 8px;border:1px solid var(--line);border-radius:8px;text-decoration:none">abrir</a>`
        );
      }
      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.title || item.url)}</a>
            ${item.note ? `<div class="note">${esc(item.note)}</div>` : ""}
          </td>
          <td>${esc(item.site || "")}</td>
          <td><span class="badge ${esc(item.state)}">${esc(label)}</span></td>
          <td>${actions.join("")}</td>
        </tr>`;
    })
    .join("");
}

/* ---------- revisão ---------- */

function showReview(item) {
  $("#reviewTitle").textContent = item.title || item.url;
  $("#reviewLink").href = item.url;
  $("#reviewBanner").classList.remove("hidden");
}

function hideReview() {
  $("#reviewBanner").classList.add("hidden");
}

function askReview(item) {
  showReview(item);
  renderStatus("review");
  return new Promise((resolve) => {
    state.decision = { url: item.url, resolve };
  });
}

function decide(kind) {
  if (!state.decision) return;
  const { resolve } = state.decision;
  state.decision = null;
  hideReview();
  resolve(kind);
}

/* ---------- abas ---------- */

async function ensureWorkTab() {
  if (state.workTabId != null) {
    try {
      await chrome.tabs.get(state.workTabId);
      return state.workTabId;
    } catch {
      state.workTabId = null;
    }
  }
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  state.workTabId = tab.id;
  return state.workTabId;
}

function waitForLoad(tabId, timeout = 60000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve(ok);
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    const onRemoved = (id) => {
      if (id === tabId) finish(false);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    setTimeout(() => finish(false), timeout);
  });
}

async function navigate(tabId, url) {
  const loaded = waitForLoad(tabId);
  await chrome.tabs.update(tabId, { url });
  const ok = await loaded;
  if (!ok) throw new Error("a página não carregou a tempo");
}

async function inject(tabId, files) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  } catch (error) {
    throw new Error(
      `não consegui rodar nesta página (${error.message}). Se for outro site, use "autorizar sites".`
    );
  }
}

async function send(tabId, message, { retries = 3, delay = 700 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response !== undefined && response !== null) return response;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries - 1) await sleep(delay);
  }
  throw lastError || new Error("a página não respondeu");
}

/* ---------- varredura e fila ---------- */

async function scanSearch(search) {
  const tabId = await ensureWorkTab();
  if (state.config.rules.keepTabActive) await chrome.tabs.update(tabId, { active: true });
  await navigate(tabId, search.url);
  await inject(tabId, ["runner/util.js", "runner/adapters.js", "runner/scan.js"]);
  const response = await send(tabId, { type: "MJB_SCAN" }, { retries: 3, delay: 800 });
  const jobs = Array.isArray(response && response.jobs) ? response.jobs : [];
  return jobs
    .filter((job) => job && job.url)
    .map((job) => ({ ...job, site: job.site || search.site, searchId: search.id }));
}

async function mergeJobs(jobs, run) {
  const cfg = state.config;
  const history = await getHistory();
  const seen = new Set(run.queue.map((item) => item.url));
  const include = cfg.rules.includeKeywords.map((term) => term.toLowerCase()).filter(Boolean);
  const exclude = cfg.rules.excludeKeywords.map((term) => term.toLowerCase()).filter(Boolean);
  let added = 0;

  for (const job of jobs) {
    if (run.queue.length >= cfg.rules.maxPerRun) break;
    if (seen.has(job.url)) continue;
    const title = String(job.title || "").toLowerCase();
    if (title && exclude.some((term) => title.includes(term))) continue;
    if (title && include.length && !include.some((term) => title.includes(term))) continue;
    if (cfg.rules.skipAlreadyApplied && history[job.url] && history[job.url].state) continue;

    seen.add(job.url);
    run.queue.push({
      url: job.url,
      title: job.title || "",
      site: job.site || "",
      state: "pending",
      note: title ? "" : "título não lido"
    });
    run.stats.found += 1;
    added += 1;
  }
  return added;
}

/* ---------- execução ---------- */

function validate(cfg) {
  const errors = [];
  if (!String(cfg.profile.fullName || "").trim()) errors.push("Preencha seu nome completo no perfil.");
  if (!String(cfg.profile.email || "").trim()) errors.push("Preencha seu e-mail no perfil.");
  if (!cfg.searches.some((search) => search.enabled && search.url.trim())) {
    errors.push("Ative pelo menos uma busca com URL.");
  }
  if (Number(cfg.rules.minDelayMs) >= Number(cfg.rules.maxDelayMs)) {
    errors.push("O atraso mínimo precisa ser menor que o máximo.");
  }
  const invalid = cfg.searches.filter(
    (search) => search.enabled && search.url.trim() && !/^https?:\/\//i.test(search.url.trim())
  );
  if (invalid.length) errors.push("Tem busca com URL inválida (precisa começar com http).");
  return errors;
}

function toggleControls() {
  $("#btnStart").disabled = state.running;
  $("#btnStop").disabled = !state.running;
  $("#btnTest").disabled = state.running;
}

async function start() {
  if (state.running) return;
  const errors = validate(state.config);
  if (errors.length) {
    for (const message of errors) await log("warn", message);
    return;
  }

  state.running = true;
  state.stopRequested = false;
  toggleControls();

  const run = {
    id: uid(),
    startedAt: Date.now(),
    finishedAt: null,
    status: "scanning",
    queue: [],
    cursor: -1,
    stats: { found: 0, applied: 0, skipped: 0, failed: 0, review: 0, dry: 0 }
  };
  state.run = run;
  await setRun(run);
  renderQueue();
  renderStats();
  renderStatus("scanning");
  await log("info", "Execução iniciada.");

  try {
    const searches = state.config.searches.filter((search) => search.enabled && search.url.trim());
    for (const search of searches) {
      if (state.stopRequested) break;
      await log("info", `Escaneando: ${search.label || search.url}`);
      let jobs = [];
      try {
        jobs = await scanSearch(search);
      } catch (error) {
        await log("error", `Falha ao escanear ${search.site}: ${error.message}`);
        continue;
      }
      await log("info", `${jobs.length} link(s) de vaga encontrados.`);
      const added = await mergeJobs(jobs, run);
      await log("info", `${added} vaga(s) nova(s) entraram na fila.`);
      await setRun(run);
      renderQueue();
      renderStats();
      if (run.queue.length >= state.config.rules.maxPerRun) {
        await log("info", `Limite de ${state.config.rules.maxPerRun} vaga(s) por execução atingido.`);
        break;
      }
    }

    if (!run.queue.length) {
      await log("warn", "Nenhuma vaga nova. Ajuste buscas/palavras-chave ou zere o histórico.");
    } else {
      run.status = "applying";
      await setRun(run);
      renderStatus("applying");
      await processQueue(run);
    }
  } catch (error) {
    await log("error", `Erro inesperado: ${error.message}`);
    run.status = "error";
  } finally {
    if (run.status === "applying" || run.status === "scanning") {
      run.status = state.stopRequested ? "stopped" : "done";
    }
    run.finishedAt = Date.now();
    state.running = false;
    state.decision = null;
    hideReview();
    toggleControls();
    await setRun(run);
    renderQueue();
    renderStats();
    renderStatus(run.status);
    await log(
      "info",
      `Fim: ${run.stats.applied} candidatura(s), ${run.stats.skipped} pulada(s), ${run.stats.failed} falha(s), ${run.stats.dry} teste(s).`
    );
  }
}

async function processQueue(run) {
  const cfg = state.config;

  for (let index = 0; index < run.queue.length; index += 1) {
    if (state.stopRequested) break;
    const item = run.queue[index];
    if (item.state !== "pending") continue;

    const daily = await getDaily();
    if (daily.count >= cfg.rules.maxPerDay) {
      await log("warn", `Limite diário atingido (${daily.count}/${cfg.rules.maxPerDay}).`);
      break;
    }

    item.state = "open";
    item.startedAt = Date.now();
    run.cursor = index;
    await setRun(run);
    renderQueue();
    renderStats();

    try {
      const tabId = await ensureWorkTab();
      if (cfg.rules.keepTabActive) await chrome.tabs.update(tabId, { active: true });
      await log("info", `Abrindo (${index + 1}/${run.queue.length}): ${item.title || item.url}`);
      await navigate(tabId, item.url);
      await inject(tabId, ["runner/util.js", "runner/adapters.js", "runner/apply.js"]);

      const result = await send(
        tabId,
        {
          type: "MJB_APPLY",
          payload: { profile: cfg.profile, resume: cfg.resume, rules: cfg.rules, job: item }
        },
        { retries: 4, delay: 900 }
      );

      await log("info", `Resultado (${item.site}): ${result.state}${result.reason ? ` — ${result.reason}` : ""}`);
      await handleResult(item, result, run, cfg, tabId);
    } catch (error) {
      item.state = "failed";
      item.note = error.message;
      run.stats.failed += 1;
      await log("error", `Falha em ${item.url}: ${error.message}`);
    }

    await setRun(run);
    renderQueue();
    renderStats();
  }
}

async function handleResult(item, result, run, cfg, tabId) {
  switch (result.state) {
    case "applied": {
      item.state = "applied";
      item.note = result.detail && result.detail.steps ? `${result.detail.steps} etapa(s)` : "";
      run.stats.applied += 1;
      await recordHistory(item.url, { state: "applied", title: item.title, site: item.site });
      await bumpDaily(1);
      break;
    }

    case "already": {
      item.state = "skipped";
      item.note = "já candidatado";
      run.stats.skipped += 1;
      await recordHistory(item.url, { state: "already", title: item.title, site: item.site });
      break;
    }

    case "no_button": {
      item.state = "skipped";
      item.note = result.reason || "sem botão de candidatura";
      run.stats.skipped += 1;
      break;
    }

    case "dry_run": {
      item.state = "dry_run";
      item.note = result.reason || "modo teste";
      run.stats.dry += 1;
      break;
    }

    case "blocked": {
      item.state = "failed";
      item.note = result.reason === "captcha" ? "captcha / verificação humana" : "login necessário";
      run.stats.failed += 1;
      if (cfg.rules.keepTabActive) await chrome.tabs.update(tabId, { active: true });
      await log(
        "warn",
        result.reason === "captcha"
          ? "A página pediu verificação humana. Parei para não piorar a situação da conta."
          : "O site pediu login. Entre na sua conta nessa aba e rode de novo."
      );
      if (result.reason === "captcha") state.stopRequested = true;
      break;
    }

    case "needs_review":
    case "uncertain": {
      item.state = "needs_review";
      item.note = result.reason || "";
      run.stats.review += 1;
      await setRun(run);
      renderQueue();
      await chrome.tabs.update(tabId, { active: true });
      const decision = await askReview(item);

      if (decision === "submit") {
        renderStatus("applying");
        const confirmation = await send(
          tabId,
          { type: "MJB_SUBMIT", payload: { profile: cfg.profile, resume: cfg.resume, rules: cfg.rules } },
          { retries: 2, delay: 800 }
        ).catch((error) => ({ state: "error", reason: error.message }));

        await log(
          "info",
          `Confirmação manual: ${confirmation.state}${confirmation.reason ? ` — ${confirmation.reason}` : ""}`
        );

        run.stats.review = Math.max(0, run.stats.review - 1);
        if (confirmation.state === "applied") {
          item.state = "applied";
          item.note = "confirmado por você";
          run.stats.applied += 1;
          await recordHistory(item.url, { state: "applied", title: item.title, site: item.site });
          await bumpDaily(1);
        } else {
          item.state = "failed";
          item.note = confirmation.reason || confirmation.state;
          run.stats.failed += 1;
        }
      } else if (decision === "skip") {
        item.state = "skipped";
        item.note = "pulado por você";
        run.stats.skipped += 1;
        run.stats.review = Math.max(0, run.stats.review - 1);
      } else {
        item.state = "stopped";
        state.stopRequested = true;
      }
      if (!state.stopRequested) renderStatus("applying");
      break;
    }

    default: {
      item.state = "failed";
      item.note = result.reason || result.state;
      run.stats.failed += 1;
    }
  }
}

/* ---------- ações do painel ---------- */

async function probeCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await inject(tab.id, ["runner/util.js", "runner/adapters.js", "runner/probe.js"]);
    const report = await send(tab.id, { type: "MJB_PROBE" }, { retries: 2, delay: 600 });
    await log("info", "Diagnóstico da aba atual:");
    await log("raw", JSON.stringify(report, null, 2));
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      await log("info", "Relatório copiado para a área de transferência.");
    } catch {
      /* sem clipboard */
    }
  } catch (error) {
    await log("error", `Diagnóstico falhou: ${error.message}`);
  }
}

async function testCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await inject(tab.id, ["runner/util.js", "runner/adapters.js", "runner/apply.js"]);
    const result = await send(
      tab.id,
      {
        type: "MJB_APPLY",
        payload: {
          profile: state.config.profile,
          resume: state.config.resume,
          rules: { ...state.config.rules, dryRun: true, autoSubmit: false },
          job: { url: tab.url, title: tab.title, site: "teste" }
        }
      },
      { retries: 2, delay: 700 }
    );
    await log("info", `Teste na aba atual: ${JSON.stringify(result)}`);
  } catch (error) {
    await log("error", `Teste falhou: ${error.message}`);
  }
}

async function authorizeOrigins() {
  const origins = [
    ...new Set(
      state.config.searches
        .map((search) => search.url)
        .filter(Boolean)
        .map((url) => {
          try {
            const parsed = new URL(url);
            return `${parsed.protocol}//${parsed.hostname}/*`;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    )
  ];
  if (!origins.length) {
    await log("warn", "Configure pelo menos uma busca com URL antes de autorizar.");
    return;
  }
  const granted = await chrome.permissions.request({ origins });
  await log(granted ? "info" : "warn", granted ? "Acesso concedido aos sites das buscas." : "Acesso não concedido.");
}

function exportCsv() {
  if (!state.run || !state.run.queue.length) {
    log("warn", "Nada para exportar ainda.");
    return;
  }
  const rows = [["#", "vaga", "site", "status", "observacao", "url"]];
  state.run.queue.forEach((item, index) => {
    rows.push([index + 1, item.title, item.site, item.state, item.note || "", item.url]);
  });
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `job-bot-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

/* ---------- eventos ---------- */

function bindEvents() {
  $("#profileGrid").addEventListener("input", (event) => {
    const key = event.target.dataset.profile;
    if (!key) return;
    state.config.profile[key] = event.target.value;
    scheduleSave();
  });

  $("#rulesGrid").addEventListener("change", (event) => {
    const key = event.target.dataset.rule;
    if (!key) return;
    const meta = RULES_META.find((entry) => entry.key === key);
    let value;
    if (meta.type === "bool") value = event.target.checked;
    else if (meta.type === "number") value = Math.max(meta.min || 0, Number(event.target.value) || 0);
    else value = event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    state.config.rules[key] = value;
    scheduleSave();
  });

  $("#searchList").addEventListener("input", (event) => {
    const field = event.target.dataset.sf;
    if (!field) return;
    const row = event.target.closest(".searchRow");
    if (!row) return;
    const search = state.config.searches.find((entry) => entry.id === row.dataset.id);
    if (!search) return;
    search[field] = field === "enabled" ? event.target.checked : event.target.value;
    scheduleSave();
  });

  $("#searchList").addEventListener("change", (event) => {
    const field = event.target.dataset.sf;
    if (!field) return;
    const row = event.target.closest(".searchRow");
    if (!row) return;
    const search = state.config.searches.find((entry) => entry.id === row.dataset.id);
    if (!search) return;
    if (field === "enabled") search.enabled = event.target.checked;
    else search[field] = event.target.value;
    scheduleSave();
  });

  $("#searchList").addEventListener("click", (event) => {
    const button = event.target.closest('[data-act="delSearch"]');
    if (!button) return;
    const row = button.closest(".searchRow");
    state.config.searches = state.config.searches.filter((entry) => entry.id !== row.dataset.id);
    renderSearches();
    scheduleSave();
  });

  $("#btnAddSearch").addEventListener("click", () => {
    state.config.searches.push({
      id: uid(),
      site: "outro",
      label: "Nova busca",
      url: "",
      enabled: true
    });
    renderSearches();
    scheduleSave();
  });

  $("#resumeInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      await log("warn", "Currículo maior que 4,5 MB. Use um PDF menor para o anexo funcionar.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      state.config.resume = { name: file.name, type: file.type, size: file.size, dataUrl };
      await saveConfig(state.config);
      renderResume();
      await log("info", `Currículo salvo: ${file.name}`);
    } catch (error) {
      await log("error", `Não consegui ler o arquivo: ${error.message}`);
    }
  });

  $("#resumeClear").addEventListener("click", async () => {
    state.config.resume = null;
    await saveConfig(state.config);
    renderResume();
  });

  $("#btnStart").addEventListener("click", start);
  $("#btnStop").addEventListener("click", () => {
    state.stopRequested = true;
    if (state.decision) decide("stop");
    log("warn", "Parada solicitada — encerro depois da vaga atual.");
  });
  $("#btnTest").addEventListener("click", testCurrentTab);
  $("#btnProbe").addEventListener("click", probeCurrentTab);
  $("#btnAuth").addEventListener("click", authorizeOrigins);
  $("#btnCsv").addEventListener("click", exportCsv);
  $("#btnClearLog").addEventListener("click", async () => {
    await clearLogs();
    $("#log").textContent = "";
  });
  $("#btnClearHistory").addEventListener("click", async () => {
    await clearHistory();
    await log("info", "Histórico de candidaturas zerado.");
  });

  $("#reviewSubmit").addEventListener("click", () => decide("submit"));
  $("#reviewSkip").addEventListener("click", () => decide("skip"));
  $("#reviewStop").addEventListener("click", () => decide("stop"));
}

/* ---------- init ---------- */

async function init() {
  state.config = await loadConfig();
  state.run = await getRun();

  if (state.run && (state.run.status === "applying" || state.run.status === "scanning")) {
    state.run.status = "interrupted";
    await setRun(state.run);
  }

  renderProfile();
  renderResume();
  renderSearches();
  renderRules();
  renderQueue();
  renderStats();
  renderStatus((state.run && state.run.status) || "idle");
  toggleControls();

  const logs = await getLogs();
  for (const entry of logs) renderLogEntry(entry);

  const daily = await getDaily();
  if (daily.count) await log("info", `Hoje: ${daily.count} candidatura(s) registradas.`);

  bindEvents();
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<pre style="color:#f87171;padding:16px">Falha ao iniciar o painel: ${esc(error.message)}</pre>`
  );
});

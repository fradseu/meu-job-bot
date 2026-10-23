import {
  jobKey,
  jobFingerprint,
  normalizeJobUrl,
  loadJobs,
  upsertJob,
  saveJobs,
  pushRun
} from "./seen.js";
import { scoreHeuristic, aiEvaluate, verdictFor } from "./match.js";
import { buildDigest, sendEmail } from "./email.js";

const TAB_KEY = "mjb.triageTabId";
const DIGEST_KEY = "mjb.digest";
const LOCK_KEY = "mjb.triageLock";
const CURSOR_KEY = "mjb.searchCursor";
const LOCK_TTL = 90 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.floor(min + Math.random() * Math.max(1, max - min + 1));

export function acquireLock(owner = "triagem") {
  return chrome.storage.local.get(LOCK_KEY).then(({ [LOCK_KEY]: lock }) => {
    if (lock && Date.now() - (lock.startedAt || 0) < LOCK_TTL && lock.owner !== owner) {
      return { ok: false, lock };
    }
    const next = { owner, startedAt: Date.now() };
    return chrome.storage.local.set({ [LOCK_KEY]: next }).then(() => ({ ok: true, lock: next }));
  });
}

export async function releaseLock() {
  await chrome.storage.local.remove(LOCK_KEY);
}

async function getLock() {
  const stored = await chrome.storage.local.get(LOCK_KEY);
  return stored[LOCK_KEY] || null;
}

export async function ensureOriginPermission(url) {
  let origin;
  try {
    origin = `${new URL(url).origin}/*`;
  } catch {
    return false;
  }
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

/* ----------------------------- aba de trabalho ----------------------------- */

async function ensureTab(showTab) {
  const stored = await chrome.storage.local.get(TAB_KEY);
  let id = stored[TAB_KEY];
  if (id != null) {
    try {
      await chrome.tabs.get(id);
    } catch {
      id = null;
    }
  }
  if (id == null) {
    const tab = await chrome.tabs.create({ url: "about:blank", active: Boolean(showTab) });
    id = tab.id;
    await chrome.storage.local.set({ [TAB_KEY]: id });
  }
  if (showTab) {
    await chrome.tabs.update(id, { active: true }).catch(() => {});
  }
  return id;
}

function waitForLoad(tabId, timeout = 25000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
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
    const timer = setTimeout(() => finish(false), timeout);
  });
}

async function navigate(tabId, url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const loaded = waitForLoad(tabId);
    await chrome.tabs.update(tabId, { url });
    const ok = await loaded;
    if (ok) {
      await sleep(500 + rand(0, 400));
      return true;
    }
  }
  throw new Error("a página não carregou a tempo");
}

async function inject(tabId, files) {
  await chrome.scripting.executeScript({ target: { tabId }, files });
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

async function closeTab() {
  const stored = await chrome.storage.local.get(TAB_KEY);
  const id = stored[TAB_KEY];
  if (id == null) return;
  await chrome.tabs.remove(id).catch(() => {});
  await chrome.storage.local.remove(TAB_KEY);
}

async function recoverTab(tabRef, triage) {
  await closeTab();
  tabRef.id = await ensureTab(triage && triage.showTab);
  return tabRef.id;
}

async function readDetail(tabRef, url, triage) {
  try {
    await navigate(tabRef.id, url);
    await inject(tabRef.id, ["runner/util.js", "runner/adapters.js", "runner/extract.js"]);
    return await send(tabRef.id, { type: "MJB_EXTRACT" }, { retries: 3, delay: 800 });
  } catch (error) {
    await recoverTab(tabRef, triage);
    await navigate(tabRef.id, url);
    await inject(tabRef.id, ["runner/util.js", "runner/adapters.js", "runner/extract.js"]);
    return await send(tabRef.id, { type: "MJB_EXTRACT" }, { retries: 3, delay: 800 });
  }
}

/* ------------------------------- orquestração ------------------------------- */

/**
 * Com muitas buscas ativas, rodar todas em um dia fica lento. `maxSearchesPerRun`
 * limita quantas entram na execução e um cursor persistente garante rodízio:
 * amanhã começa de onde parou hoje.
 */
export async function pickSearches(all, triage, log = () => {}) {
  const cap = Math.max(0, Number(triage.maxSearchesPerRun) || 0);
  if (!cap || all.length <= cap) return all;

  const stored = await chrome.storage.local.get(CURSOR_KEY);
  let cursor = Number(stored[CURSOR_KEY]) || 0;
  cursor = ((cursor % all.length) + all.length) % all.length;

  const picked = [];
  for (let i = 0; i < cap; i += 1) picked.push(all[(cursor + i) % all.length]);

  const next = (cursor + cap) % all.length;
  await chrome.storage.local.set({ [CURSOR_KEY]: next });
  const nextLabel = all[next]?.label || all[next]?.url || "";
  log("info", `Rodízio: ${cap} de ${all.length} buscas nesta execução. A próxima começa em "${nextLabel}".`);
  return picked;
}

/**
 * Roda a triagem completa: pagina as buscas, abre cada vaga nova, avalia e
 * monta o digest. Nunca faz candidatura.
 *
 * @param {object} options
 * @param {object} options.config  configuração completa (inclui triage/ai/email)
 * @param {function} options.onEvent  callback de progresso
 * @param {AbortSignal} options.signal
 */
export async function runTriage({ config, onEvent = () => {}, signal } = {}) {
  const triage = config.triage || {};
  const ai = config.ai || {};
  const candidate = { ...(triage.candidate || {}), resumeText: triage.candidate?.resumeText || "" };
  const rules = triage;
  const emit = (event) => {
    try {
      onEvent(event);
    } catch {
      /* painel pode ter fechado */
    }
  };
  const log = (level, message) => emit({ type: "log", level, message });
  const aborted = () => Boolean(signal && signal.aborted);

  const startedAt = Date.now();
  const allSearches = (config.searches || []).filter((search) => search.enabled && String(search.url || "").trim());
  if (!allSearches.length) throw new Error("nenhuma busca ativa com URL");
  const searches = await pickSearches(allSearches, triage, log);

  const store = await loadJobs();
  // Vagas que falharam ao abrir não contam como "vistas": tentamos de novo.
  const knownKeys = new Set(
    Object.entries(store)
      .filter(([, job]) => job.status !== "erro")
      .map(([key]) => key)
  );
  const knownFingerprints = new Set(
    Object.values(store)
      .filter((job) => job.status !== "erro")
      .map((job) => jobFingerprint(job))
      .filter(Boolean)
  );

  const summary = {
    startedAt,
    finishedAt: 0,
    searches: searches.length,
    pages: 0,
    linksFound: 0,
    newCandidates: 0,
    visited: 0,
    skippedSeen: 0,
    failed: 0,
    highScore: 0,
    aiUsed: 0,
    stoppedBy: "",
    digestCount: 0,
    emailSent: false,
    emailError: ""
  };

  const tabRef = { id: await ensureTab(rules.showTab) };
  emit({ type: "phase", phase: "scanning" });

  let candidates = [];
  try {
    for (const search of searches) {
      if (aborted()) break;
      const found = await scanSearch({ tabRef, search, triage, signal, emit, summary, knownKeys, knownFingerprints });
      candidates = candidates.concat(found);
    }

    // Ordena pelo potencial do título antes de gastar navegação.
    const ranked = dedupeCandidates(candidates)
      .filter((job) => !knownKeys.has(jobKey(job.url)))
      .map((job) => ({
        ...job,
        _preliminary: scoreHeuristic({ ...job, description: "" }, candidate).score
      }))
      .sort((a, b) => b._preliminary - a._preliminary);

    summary.newCandidates = ranked.length;
    const limit = Math.max(1, Number(triage.maxJobsPerRun) || 50);
    const queue = ranked.slice(0, limit);
    if (ranked.length > queue.length) {
      log("warn", `${ranked.length} vagas novas, mas o limite da execução é ${limit}. As restantes ficam para a próxima.`);
    }
    if (!queue.length) {
      log("info", "Nenhuma vaga nova: tudo que apareceu já foi avaliado antes.");
    }

    emit({ type: "phase", phase: "evaluating" });
    for (const candidateJob of queue) {
      if (aborted()) {
        summary.stoppedBy = "você parou";
        break;
      }
      const result = await evaluateOne({ tabRef, candidateJob, triage, ai, candidate, signal, emit, summary });
      if (result === "blocked") {
        summary.stoppedBy = "captcha/login";
        break;
      }
      if (result === "saved") summary.visited += 1;
      if (result === "failed") summary.failed += 1;
      await sleep(rand(Number(triage.delayMinMs) || 2500, Number(triage.delayMaxMs) || 6000));
    }
  } finally {
    summary.finishedAt = Date.now();
    if (!rules.keepTabOpen) await closeTab();
  }

  // Digest do dia
  emit({ type: "phase", phase: "digest" });
  const digest = await buildRunDigest({ config, summary });
  emit({ type: "digest", digest });

  if (config.email?.enabled && digest.total > 0) {
    try {
      await sendEmail(config.email, digest);
      await markEmailed(digest.jobKeys);
      digest.sentAt = Date.now();
      summary.emailSent = true;
      await chrome.storage.local.set({ [DIGEST_KEY]: digest });
      log("info", `E-mail enviado para ${config.email.toEmail} com ${digest.total} vaga(s).`);
    } catch (error) {
      digest.error = error.message;
      summary.emailError = error.message;
      await chrome.storage.local.set({ [DIGEST_KEY]: digest });
      log("error", `Falha no e-mail: ${error.message}`);
    }
  } else if (config.email?.enabled && digest.total === 0) {
    log("info", "Nenhuma vaga nova avaliada nesta execução: e-mail do dia não enviado.");
  } else {
    log("info", "E-mail desligado: o digest está salvo no painel para você revisar.");
  }

  summary.highScore = digest.total;
  summary.digestCount = digest.total;
  await pushRun(summary);
  emit({ type: "done", summary, digest });
  return { summary, digest };
}

async function scanSearch({ tabRef, search, triage, signal, emit, summary, knownKeys, knownFingerprints }) {
  const log = (level, message) => emit({ type: "log", level, message });
  const maxPages = Math.max(1, Number(triage.maxPagesPerSearch) || 3);
  const delay = () => sleep(rand(Number(triage.delayMinMs) || 2500, Number(triage.delayMaxMs) || 6000));

  const found = new Map();
  const visitedPages = new Set();
  let url = search.url;

  for (let page = 1; page <= maxPages; page += 1) {
    if (signal && signal.aborted) break;
    if (!url || visitedPages.has(url)) break;
    visitedPages.add(url);

    let response;
    try {
      await navigate(tabRef.id, url);
      await inject(tabRef.id, ["runner/util.js", "runner/adapters.js", "runner/scan.js"]);
      response = await send(tabRef.id, { type: "MJB_SCAN" }, { retries: 3, delay: 800 });
    } catch (error) {
      // A aba pode ter sido fechada/descartada: recria uma vez.
      try {
        await recoverTab(tabRef, triage);
        await navigate(tabRef.id, url);
        await inject(tabRef.id, ["runner/util.js", "runner/adapters.js", "runner/scan.js"]);
        response = await send(tabRef.id, { type: "MJB_SCAN" }, { retries: 3, delay: 800 });
      } catch (secondError) {
        log("warn", `Não consegui ler a página ${page} de ${search.label || search.url}: ${secondError.message}`);
        break;
      }
    }

    if (!response || !response.ok) {
      log("warn", `Página ${page} sem resposta válida (${response?.error || "motivo desconhecido"}).`);
      break;
    }

    summary.pages += 1;
    const jobs = Array.isArray(response.jobs) ? response.jobs : [];
    summary.linksFound += jobs.length;

    let addedOnPage = 0;
    for (const job of jobs) {
      if (!job || !job.url) continue;
      const normalized = normalizeJobUrl(job.url);
      const key = jobKey(normalized);
      if (!key || found.has(key)) continue;
      if (knownKeys.has(key)) {
        summary.skippedSeen += 1;
        continue;
      }
      const fingerprint = jobFingerprint(job);
      if (fingerprint && knownFingerprints.has(fingerprint)) continue;
      found.set(key, {
        key,
        url: normalized,
        title: String(job.title || "").slice(0, 200),
        site: job.site || search.site,
        searchId: search.id,
        searchLabel: search.label || ""
      });
      addedOnPage += 1;
    }

    log(
      "info",
      `${search.label || search.url} · página ${page}: ${jobs.length} link(s), ${addedOnPage} novo(s).`
    );

    if (!jobs.length) {
      log("warn", "Página sem vagas lidas — encerro essa busca aqui.");
      break;
    }
    if (!response.nextUrl || response.nextUrl === url) break;
    url = response.nextUrl;
    await delay();
  }

  return [...found.values()];
}

function dedupeCandidates(list) {
  const byKey = new Map();
  const fingerprints = new Set();
  for (const job of list) {
    if (!job || !job.key || byKey.has(job.key)) continue;
    const fingerprint = jobFingerprint(job);
    if (fingerprint && fingerprints.has(fingerprint)) continue;
    if (fingerprint) fingerprints.add(fingerprint);
    byKey.set(job.key, job);
  }
  return [...byKey.values()];
}

async function evaluateOne({ tabRef, candidateJob, triage, ai, candidate, signal, emit, summary }) {
  const log = (level, message) => emit({ type: "log", level, message });
  emit({ type: "job-status", key: candidateJob.key, status: "abrindo" });

  let data;
  try {
    data = await readDetail(tabRef, candidateJob.url, triage);
  } catch (error) {
    log("warn", `Não consegui abrir ${candidateJob.url}: ${error.message}`);
    await upsertJob({
      key: candidateJob.key,
      url: candidateJob.url,
      title: candidateJob.title,
      site: candidateJob.site,
      searchId: candidateJob.searchId,
      status: "erro",
      note: String(error.message).slice(0, 200),
      score: 0,
      verdict: "fraca"
    });
    return "failed";
  }

  if (data && data.blocked) {
    log(
      "warn",
      data.blocked === "captcha"
        ? "O site pediu verificação humana (captcha). Parei a execução para não piorar sua conta."
        : "O site pediu login. Entre na sua conta nessa aba e rode de novo."
    );
    emit({ type: "blocked", reason: data.blocked });
    return "blocked";
  }

  const job = {
    key: candidateJob.key,
    url: normalizeJobUrl(data.url || candidateJob.url),
    title: data.title || candidateJob.title,
    company: data.company || "",
    location: data.location || "",
    salary: data.salary || "",
    site: candidateJob.site || data.site || "",
    searchId: candidateJob.searchId,
    searchLabel: candidateJob.searchLabel,
    postedAt: data.postedAt || "",
    validThrough: data.validThrough || "",
    employmentType: data.employmentType || "",
    expired: Boolean(data.expired),
    hasJsonLd: Boolean(data.hasJsonLd),
    descriptionSnippet: String(data.description || "").slice(0, 1500),
    status: "avaliada"
  };

  let evaluation = scoreHeuristic({ ...job, description: data.description || "" }, candidate);
  const aiEnabled = Boolean(ai.enabled && String(ai.apiKey || "").trim());
  if (aiEnabled && evaluation.score >= (Number(ai.minHeuristic) || 45) && summary.aiUsed < (Number(ai.maxPerRun) || 40)) {
    try {
      const aiResult = await aiEvaluate(
        { ...job, description: data.description || "" },
        candidate,
        ai,
        { signal }
      );
      evaluation = {
        ...aiResult,
        reasons: [...new Set([...(aiResult.reasons || []), ...evaluation.reasons])].slice(0, 4),
        gaps: [...new Set([...(aiResult.gaps || []), ...evaluation.gaps])].slice(0, 4)
      };
      summary.aiUsed += 1;
    } catch (error) {
      log("warn", `IA falhou em "${job.title}": ${error.message}. Fiquei na nota local.`);
    }
  }

  const saved = await upsertJob({
    ...job,
    score: evaluation.score,
    verdict: evaluation.verdict || verdictFor(evaluation.score),
    reasons: evaluation.reasons || [],
    gaps: evaluation.gaps || [],
    skillHits: evaluation.skillHits || [],
    method: evaluation.method || "heuristic",
    seniority: evaluation.seniority || "",
    status: "avaliada"
  });

  log(
    "info",
    `[${saved.score}] ${saved.title}${saved.company ? ` — ${saved.company}` : ""} (${saved.method})`
  );
  emit({ type: "job", job: saved });
  return "saved";
}

/* ------------------------------- digest ------------------------------- */

export async function buildRunDigest({ config, summary, since = 0, includeEmailed = false }) {
  const triage = config.triage || {};
  const minScore = Number(triage.minScoreToEmail) || 0;
  const top = Math.max(1, Number(triage.topPerEmail) || 15);
  const jobs = await loadJobs();
  const cutoff = since || (summary && summary.startedAt) || 0;

  // Tudo que foi aberto e avaliado nesta execução entra no e-mail, com a nota.
  // `minScoreToEmail` só serve para destacar no assunto (0 = sem corte).
  const evaluated = Object.values(jobs)
    .filter((job) => (job.checkedAt || 0) >= cutoff)
    .filter((job) => job.status !== "erro")
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const eligible = evaluated
    .filter((job) => includeEmailed || !job.emailedAt)
    .filter((job) => Number(job.score || 0) >= minScore)
    .slice(0, top);

  const siteCounts = {};
  for (const job of eligible) {
    const site = job.site || "site";
    siteCounts[site] = (siteCounts[site] || 0) + 1;
  }

  const digest = buildDigest({
    jobs: eligible,
    candidate: { ...(triage.candidate || {}), fullName: config.profile?.fullName || "" },
    siteCounts,
    stats: { evaluated: evaluated.length, minScore }
  });

  const payload = {
    ...digest,
    createdAt: Date.now(),
    jobKeys: eligible.map((job) => job.key),
    sentAt: 0,
    error: ""
  };
  await chrome.storage.local.set({ [DIGEST_KEY]: payload });
  return payload;
}

async function markEmailed(keys) {
  if (!keys || !keys.length) return;
  const jobs = await loadJobs();
  const ts = Date.now();
  for (const key of keys) {
    if (jobs[key]) {
      jobs[key].emailedAt = ts;
      jobs[key].status = "enviada";
    }
  }
  await saveJobs(jobs);
}

export async function getStoredDigest() {
  const stored = await chrome.storage.local.get(DIGEST_KEY);
  return stored[DIGEST_KEY] || null;
}

export async function sendStoredDigest(config) {
  const stored = await chrome.storage.local.get(DIGEST_KEY);
  const digest = stored[DIGEST_KEY];
  if (!digest) throw new Error("não há digest gerado ainda");
  if (!digest.total) throw new Error("o último digest está vazio");
  await sendEmail(config.email, digest);
  await markEmailed(digest.jobKeys);
  digest.sentAt = Date.now();
  digest.error = "";
  await chrome.storage.local.set({ [DIGEST_KEY]: digest });
  return digest;
}

/**
 * Monta e envia o e-mail a partir de tudo que está no painel, com as notas,
 * mesmo que já tenha sido enviado antes. É o botão "enviar vagas do painel".
 */
export async function sendDigestFromHistory({ config, since = 0 } = {}) {
  if (!config.email?.enabled) throw new Error("ligue o envio de e-mail primeiro");
  const digest = await buildRunDigest({ config, summary: { startedAt: 0 }, since, includeEmailed: true });
  if (!digest.total) throw new Error("não há vagas avaliadas para enviar");
  await sendEmail(config.email, digest);
  await markEmailed(digest.jobKeys);
  digest.sentAt = Date.now();
  digest.error = "";
  await chrome.storage.local.set({ [DIGEST_KEY]: digest });
  return digest;
}

/** Reavalia o que já está guardado, sem reabrir as páginas. */
export async function revaluateStoredJobs({ config, onEvent = () => {}, signal } = {}) {
  const triage = config.triage || {};
  const ai = config.ai || {};
  const jobs = await loadJobs();
  const keys = Object.keys(jobs);
  let changed = 0;
  let aiUsed = 0;

  for (const key of keys) {
    if (signal && signal.aborted) break;
    const job = jobs[key];
    const heuristic = scoreHeuristic(
      { ...job, description: job.descriptionSnippet || "" },
      triage.candidate || {}
    );
    let evaluation = heuristic;
    if (ai.enabled && String(ai.apiKey || "").trim() && heuristic.score >= (Number(ai.minHeuristic) || 45)) {
      try {
        evaluation = await aiEvaluate(
          { ...job, description: job.descriptionSnippet || "" },
          triage.candidate || {},
          ai,
          { signal }
        );
        aiUsed += 1;
      } catch (error) {
        onEvent({ type: "log", level: "warn", message: `IA falhou em "${job.title}": ${error.message}` });
      }
    }
    jobs[key] = {
      ...job,
      score: evaluation.score,
      verdict: evaluation.verdict || verdictFor(evaluation.score),
      reasons: evaluation.reasons || [],
      gaps: evaluation.gaps || [],
      method: evaluation.method || "heuristic",
      revaluatedAt: Date.now()
    };
    changed += 1;
    onEvent({ type: "revaluated", done: changed, total: keys.length, job: jobs[key] });
  }

  await saveJobs(jobs);
  const digest = await buildRunDigest({ config, summary: { startedAt: 0 }, since: 0 });
  return { changed, aiUsed, digest };
}

export async function getCurrentLock() {
  return getLock();
}

const JOBS_KEY = "mjb.jobs";
const RUNS_KEY = "mjb.runs";
const MAX_JOBS = 4000;
const MAX_RUNS = 60;

const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^ref$/i,
  /^src$/i,
  /^origin$/i,
  /^source$/i,
  /^campaign$/i,
  /^tracking/i
];

/** Chave estável da vaga: o que identifica o anúncio, não a URL bonita. */
export function jobKey(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host.endsWith("catho.com.br")) {
    const match = url.pathname.match(/\/vagas\/[^/?#]+\/(\d+)/i);
    if (match) return `catho:${match[1]}`;
  }
  if (host.endsWith("infojobs.com.br")) {
    const match = url.pathname.match(/__(\d+)\.aspx/i) || url.pathname.match(/(\d{5,})/);
    if (match) return `infojobs:${match[1]}`;
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${host}${path}`;
}

export function normalizeJobUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    return "";
  }
  url.hash = "";
  const keep = [...url.searchParams.entries()].filter(
    ([key]) => !TRACKING_PARAMS.some((re) => re.test(key))
  );
  url.search = "";
  for (const [key, value] of keep.sort(([a], [b]) => a.localeCompare(b))) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

export function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function jobFingerprint(job) {
  const title = norm(job.title).replace(/[^a-z0-9 ]/g, "");
  const company = norm(job.company).replace(/[^a-z0-9 ]/g, "");
  if (!title) return "";
  return `${title}|${company}`;
}

export async function loadJobs() {
  const stored = await chrome.storage.local.get(JOBS_KEY);
  const jobs = stored[JOBS_KEY];
  return jobs && typeof jobs === "object" ? jobs : {};
}

export async function saveJobs(jobs) {
  const entries = Object.entries(jobs);
  if (entries.length > MAX_JOBS) {
    entries.sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0));
    jobs = Object.fromEntries(entries.slice(0, MAX_JOBS));
  }
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
}

export async function upsertJob(job) {
  const key = job.key || jobKey(job.url);
  if (!key) throw new Error("vaga sem chave de URL");
  const jobs = await loadJobs();
  const previous = jobs[key] || {};
  jobs[key] = {
    ...previous,
    ...job,
    key,
    url: job.url || previous.url,
    firstSeenAt: previous.firstSeenAt || Date.now(),
    checkedAt: Date.now()
  };
  await saveJobs(jobs);
  return jobs[key];
}

export async function clearJobs() {
  await chrome.storage.local.remove(JOBS_KEY);
}

export async function getRunHistory() {
  const stored = await chrome.storage.local.get(RUNS_KEY);
  return Array.isArray(stored[RUNS_KEY]) ? stored[RUNS_KEY] : [];
}

export async function pushRun(entry) {
  const runs = await getRunHistory();
  runs.unshift(entry);
  await chrome.storage.local.set({ [RUNS_KEY]: runs.slice(0, MAX_RUNS) });
}

export async function getLastRun() {
  const runs = await getRunHistory();
  return runs[0] || null;
}

export async function lastRunDate() {
  const run = await getLastRun();
  return run && run.finishedAt ? new Date(run.finishedAt).toISOString().slice(0, 10) : "";
}

/** Lista pronta para a tabela e para o digest: mais novos e melhores primeiro. */
export async function listJobs({ since = 0, minScore = 0, onlyNew = false } = {}) {
  const jobs = await loadJobs();
  return Object.values(jobs)
    .filter((job) => (job.checkedAt || 0) >= since)
    .filter((job) => Number(job.score || 0) >= minScore)
    .filter((job) => !onlyNew || !job.emailedAt)
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.checkedAt || 0) - (a.checkedAt || 0));
}

const ALARM = "mjb-triagem-diaria";
const CONFIG_KEY = "mjb.config";
const LOCK_KEY = "mjb.triageLock";
const LOCK_TTL = 90 * 60 * 1000;
const TRIAGE_PAGE = "triagem.html";

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  tickSoon(8000);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  tickSoon(15000);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM) return;
  tick();
});

// Ao instalar/atualizar a extensão também tenta recuperar o dia perdido.
ensureAlarm();

function ensureAlarm() {
  chrome.alarms.get(ALARM, (existing) => {
    if (existing) return;
    chrome.alarms.create(ALARM, { delayInMinutes: 2, periodInMinutes: 60 });
  });
}

function tickSoon(ms) {
  setTimeout(tick, ms);
}

function dayOf(ts) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function tick() {
  try {
    const stored = await chrome.storage.local.get([CONFIG_KEY, LOCK_KEY, "mjb.runs"]);
    const config = stored[CONFIG_KEY] || {};
    const triage = config.triage;
    // Sem config salva (extensão recém-instalada) não faz nada.
    if (!triage || triage.enabled === false) return;
    if (!String(triage.candidate?.resumeText || "").trim()) return;

    const hour = Number.isFinite(Number(triage.scheduleHour)) ? Number(triage.scheduleHour) : 8;
    const now = new Date();
    if (now.getHours() < hour) return;

    const runs = Array.isArray(stored["mjb.runs"]) ? stored["mjb.runs"] : [];
    const last = runs[0];
    const lastDay = last && last.finishedAt ? dayOf(last.finishedAt) : "";
    if (lastDay === dayOf(Date.now())) return;

    const lock = stored[LOCK_KEY];
    if (lock && Date.now() - (lock.startedAt || 0) < LOCK_TTL) return;
    if (lock) await chrome.storage.local.remove(LOCK_KEY);

    await openTriage();
  } catch (error) {
    console.warn("[MEU Job Bot] falha no alarme da triagem:", error);
  }
}

async function openTriage() {
  const url = chrome.runtime.getURL(TRIAGE_PAGE);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url && tab.url.startsWith(url));

  if (existing && existing.id != null) {
    try {
      await chrome.tabs.sendMessage(existing.id, { type: "MJB_TRIAGE_RUN", source: "alarm" });
      return;
    } catch {
      await chrome.tabs.update(existing.id, { url: `${url}?autorun=1`, active: false });
      return;
    }
  }

  await chrome.tabs.create({ url: `${url}?autorun=1`, active: false });
}

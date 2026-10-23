const includeEl = document.querySelector("#include");
const excludeEl = document.querySelector("#exclude");
const citiesEl = document.querySelector("#cities");
const minScoreEl = document.querySelector("#minScore");
const maxAppliesEl = document.querySelector("#maxApplies");
const jobsEl = document.querySelector("#jobs");
const statusEl = document.querySelector("#status");
const siteEl = document.querySelector("#site");
const applyBtn = document.querySelector("#apply");
const onlyGoodEl = document.querySelector("#onlyGood");

let lastJobs = [];

function lines(value) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function fillForm(profile) {
  includeEl.value = profile.include.join("\n");
  excludeEl.value = profile.exclude.join("\n");
  citiesEl.value = profile.cities.join("\n");
  minScoreEl.value = profile.minScore;
  maxAppliesEl.value = profile.maxApplies;
}

function readForm() {
  return {
    include: lines(includeEl.value),
    exclude: lines(excludeEl.value),
    cities: lines(citiesEl.value),
    minScore: clamp(Number(minScoreEl.value) || 0, 0, 30),
    maxApplies: clamp(Number(maxAppliesEl.value) || 1, 1, 5)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function scoreClass(score, minScore) {
  if (score < minScore) return "low";
  if (score < minScore + 3) return "mid";
  return "";
}

function renderJobs() {
  const minScore = Number(minScoreEl.value) || 0;
  const visible = lastJobs.filter((job) => !onlyGoodEl.checked || job.score >= minScore);
  jobsEl.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = lastJobs.length
      ? "Nenhuma vaga passou na nota mínima."
      : "Nenhuma vaga varrida ainda.";
    jobsEl.append(empty);
    applyBtn.disabled = true;
    return;
  }

  for (const job of visible) {
    const item = document.createElement("li");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = job.score >= minScore && !job.applied;
    box.dataset.id = job.id;
    box.disabled = !job.canApply;

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = job.title;
    const meta = document.createElement("span");
    meta.textContent = [job.company, job.location, job.source].filter(Boolean).join(" · ");
    const why = document.createElement("em");
    why.textContent = job.canApply
      ? "botão de candidatura nesta página"
      : "abre a vaga para candidatar lá";
    body.append(title, meta, why);

    const score = document.createElement("span");
    score.className = `score ${scoreClass(job.score, minScore)}`;
    score.textContent = String(job.score);

    item.append(box, body, score);
    jobsEl.append(item);
  }
  applyBtn.disabled = false;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["profile.js", "content.js"]
    });
  }
}

async function send(message) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("Nenhuma aba ativa.");
  siteEl.textContent = siteName(tab.url);
  await ensureContentScript(tab.id);
  return chrome.tabs.sendMessage(tab.id, message);
}

function siteName(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "aba atual";
  }
}

function selectedIds() {
  return [...jobsEl.querySelectorAll("input[type=checkbox]:checked")].map((box) => box.dataset.id);
}

document.querySelector("#searches").append(...SEARCHES.map((search) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip";
  button.innerHTML = `${search.site}<small>${search.label}</small>`;
  button.addEventListener("click", () => chrome.tabs.create({ url: search.url }));
  return button;
}));

document.querySelector("#save").addEventListener("click", async () => {
  const profile = readForm();
  await chrome.storage.local.set({ profile });
  setStatus("Perfil salvo neste navegador.");
});

document.querySelector("#scan").addEventListener("click", async () => {
  applyBtn.disabled = true;
  setStatus("Varrendo a página...");
  try {
    const profile = readForm();
    await chrome.storage.local.set({ profile });
    const response = await send({ type: "SCAN" });
    lastJobs = response?.jobs || [];
    renderJobs();
    const good = lastJobs.filter((job) => job.score >= profile.minScore).length;
    setStatus(`${lastJobs.length} vagas lidas, ${good} na sua área.`);
  } catch (error) {
    setStatus("Não consegui ler esta aba. Abra a lista de vagas e tente de novo.");
    console.error(error);
  }
});

document.querySelector("#apply").addEventListener("click", async () => {
  const ids = selectedIds();
  if (!ids.length) {
    setStatus("Marque ao menos uma vaga.");
    return;
  }
  const profile = readForm();
  applyBtn.disabled = true;
  setStatus(`Candidatando em até ${profile.maxApplies}. A página vai pausar entre os cliques.`);
  try {
    const response = await send({ type: "APPLY", ids, maxApplies: profile.maxApplies });
    const done = response?.results || [];
    const ok = done.filter((item) => item.ok).length;
    setStatus(response?.stopped
      ? `Parei em ${ok} candidatura(s): ${response.reason}`
      : `${ok} candidatura(s) disparada(s). Confira a página se abriu algum formulário.`);
  } catch (error) {
    setStatus("A candidatura não rodou. Recarregue a busca e varra de novo.");
    console.error(error);
  } finally {
    applyBtn.disabled = false;
  }
});

onlyGoodEl.addEventListener("change", renderJobs);

document.querySelector("#openPanel").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("panel.html") });
});

document.querySelector("#openTriage").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("triagem.html") });
});

chrome.storage.local.get("profile").then(({ profile }) => {
  fillForm({ ...DEFAULT_PROFILE, ...profile });
});

activeTab().then((tab) => {
  siteEl.textContent = siteName(tab?.url);
}).catch(() => {});

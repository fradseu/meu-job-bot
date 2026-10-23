(() => {
  if (window.__MJB_ADAPTERS_READY) return;
  window.__MJB_ADAPTERS_READY = true;

  // Cada adapter é só dado. Regex em string para poder ser injetado em qualquer página.
  const ADAPTERS = {
    catho: {
      key: "catho",
      name: "Catho",
      match: "catho\\.com\\.br",
      isJobDetail: "catho\\.com\\.br\\/vagas\\/[^/?#]+\\/\\d+",
      excludeUrl: "(candidaturas|curriculo|busca)",
      pagination: { param: "page" },
      applyTexts: ["quero me candidatar", "candidatar", "candidatura"],
      appliedTexts: ["candidatura enviada", "curriculo enviado", "ja se candidatou"],
      titleSelectors: ["h1", "[data-testid*='title']", ".job-title"],
      companySelectors: ["[data-testid*='company']", ".company-name"]
    },
    infojobs: {
      key: "infojobs",
      name: "InfoJobs",
      match: "infojobs\\.com\\.br",
      isJobDetail: "__\\d+\\.aspx",
      excludeUrl: "(candidaturas|curriculo|vagas-de-emprego)",
      pagination: { param: "Page" },
      applyTexts: ["candidatar", "candidatura", "enviar curriculo", "inscrever"],
      appliedTexts: ["candidatura enviada", "curriculo enviado", "ja se candidatou"],
      titleSelectors: ["h1", ".job-title", "[class*='title']"],
      companySelectors: ["[class*='company']", ".company-name"]
    },
    linkedin: {
      key: "linkedin",
      name: "LinkedIn",
      match: "linkedin\\.com",
      isJobDetail: "linkedin\\.com\\/jobs\\/view\\/\\d+",
      excludeUrl: "(\\/jobs\\/search|\\/jobs\\/collections)",
      applyTexts: ["candidatura simplificada", "easy apply", "candidatar"],
      appliedTexts: ["candidatura enviada", "candidatura ja enviada", "already applied"],
      titleSelectors: ["h1", ".job-details-jobs-unified-top-card__job-title"],
      companySelectors: [".job-details-jobs-unified-top-card__company-name"]
    },
    gupy: {
      key: "gupy",
      name: "Gupy",
      match: "gupy\\.io",
      isJobDetail: "\\/jobs?\\/\\d+",
      excludeUrl: "(job-search|\\/portal)",
      applyTexts: ["candidatar", "candidatura", "aplicar"],
      appliedTexts: ["candidatura enviada", "inscricao realizada", "ja se candidatou"],
      titleSelectors: ["h1", "[data-testid*='job-title']"],
      companySelectors: []
    },
    programathor: {
      key: "programathor",
      name: "Programathor",
      match: "programathor\\.com\\.br",
      isJobDetail: "\\/jobs\\/[^/?#]+",
      excludeUrl: "(\\/jobs$|\\/jobs\\?)",
      applyTexts: ["candidatar", "aplicar", "candidatura"],
      appliedTexts: ["candidatura enviada", "ja se candidatou"],
      titleSelectors: ["h1"],
      companySelectors: []
    },
    local: {
      key: "local",
      name: "Teste local",
      match: "^file:",
      isJobDetail: "vaga\\.html",
      excludeUrl: "listagem",
      applyTexts: ["candidatar", "candidatura", "enviar"],
      appliedTexts: ["candidatura enviada"],
      titleSelectors: ["h1"],
      companySelectors: []
    },
    generic: {
      key: "generic",
      name: "Site genérico",
      match: ".*",
      isJobDetail: "(vaga|vagas|job|jobs|emprego|carreira|career|oportunidade)",
      excludeUrl: "(\\/vagas?\\/?$|\\/jobs?\\/?$)",
      applyTexts: ["candidatar", "candidatura", "apply", "inscrever", "enviar curriculo", "aplicar"],
      appliedTexts: ["candidatura enviada", "application submitted", "already applied"],
      titleSelectors: ["h1"],
      companySelectors: []
    }
  };

  function adapterFor(href) {
    for (const key of Object.keys(ADAPTERS)) {
      if (key === "generic") continue;
      const adapter = ADAPTERS[key];
      try {
        if (adapter.match && new RegExp(adapter.match, "i").test(href)) return adapter;
      } catch {
        /* regex inválida no adapter */
      }
    }
    return ADAPTERS.generic;
  }

  window.__MJB_ADAPTERS = ADAPTERS;
  window.__MJB_adapterFor = adapterFor;
})();

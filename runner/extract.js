(() => {
  if (window.__MJB_EXTRACT_READY) return;
  window.__MJB_EXTRACT_READY = true;

  const NS = window.__MJB;
  if (!NS) {
    console.warn("[JobBot] runner/util.js precisa ser injetado antes de extract.js");
    return;
  }

  const MAX_DESCRIPTION = 12000;

  function htmlToText(html) {
    const raw = String(html || "");
    if (!raw) return "";
    const withBreaks = raw
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "- ");
    const holder = document.createElement("div");
    holder.innerHTML = withBreaks;
    return String(holder.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function walk(value, visit) {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit);
      return;
    }
    if (typeof value !== "object") return;
    visit(value);
    if (value["@graph"]) walk(value["@graph"], visit);
  }

  function findPosting() {
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')];
    let best = null;
    for (const block of blocks) {
      let data;
      try {
        data = JSON.parse(block.textContent || "");
      } catch {
        continue;
      }
      walk(data, (node) => {
        const type = node["@type"];
        const isPosting = Array.isArray(type)
          ? type.some((item) => /JobPosting/i.test(String(item)))
          : /JobPosting/i.test(String(type || ""));
        if (!isPosting) return;
        const size = String(node.description || "").length;
        if (!best || size > best.size) best = { node, size };
      });
    }
    return best ? best.node : null;
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      let el;
      try {
        el = document.querySelector(selector);
      } catch {
        continue;
      }
      const text = NS.text(el);
      if (text && text.length > 1) return text;
    }
    return "";
  }

  function fromAddress(node) {
    const location = node && node.jobLocation;
    if (!location) return "";
    const list = Array.isArray(location) ? location : [location];
    const parts = [];
    for (const entry of list) {
      const address = (entry && entry.address) || {};
      const city = address.addressLocality || "";
      const region = address.addressRegion || "";
      const country = address.addressCountry || "";
      const remote = entry && (entry.jobLocationType || "");
      const chunk = [city, region].filter(Boolean).join(" - ");
      if (chunk) parts.push(chunk);
      else if (country) parts.push(String(country));
      if (/TELECOMMUTE/i.test(String(remote))) parts.push("remoto");
    }
    return [...new Set(parts)].join(" / ");
  }

  function salaryFrom(node) {
    const base = node && node.baseSalary;
    if (!base) return "";
    const value = base.value || base;
    const min = Number(value.minValue || value.value || 0);
    const max = Number(value.maxValue || value.value || 0);
    const money = (n) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    if (min && max && min !== max) return `${money(min)} a ${money(max)}`;
    if (min) return money(min);
    return "";
  }

  function salaryFromText(text) {
    const match = text.match(/(?:sal[aá]rio|remunera[cç][aã]o|faixa)[^\n]{0,30}?(R\$\s?[\d.,]+(?:\s*(?:a|até|-)\s*R\$\s?[\d.,]+)?)/i);
    if (match) return match[1].replace(/\s+/g, " ");
    const loose = text.match(/R\$\s?[\d.]{3,}(?:,\d{2})?/);
    return loose ? loose[0] : "";
  }

  function biggestDescription() {
    const selectors = [
      '[class*="job-description" i]',
      '[class*="descricao" i]',
      '[class*="description" i]',
      '[data-testid*="description" i]',
      "#vagaDescricao",
      "article",
      "main"
    ];
    let best = "";
    for (const selector of selectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const node of nodes) {
        if (node.closest("header, nav, footer, aside")) continue;
        const text = NS.text(node);
        if (text.length > best.length && text.length < 30000) best = text;
      }
    }
    if (best.length < 250) {
      const body = NS.text(document.body || document.documentElement);
      if (body.length > best.length) best = body;
    }
    return best.slice(0, MAX_DESCRIPTION);
  }

  function detectBlock() {
    const url = location.href.toLowerCase();
    if (/\/(login|entrar|signin)\b/.test(url)) return "login";
    const frames = document.querySelectorAll(
      'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]'
    );
    for (const frame of frames) {
      const rect = frame.getBoundingClientRect();
      if (rect.width > 250 && rect.height > 100) return "captcha";
    }
    const text = NS.norm((document.body && document.body.innerText) || "").slice(0, 4000);
    if (/nao sou um robo|verify you are human|verifique que voce e humano|complete o captcha/.test(text)) {
      return "captcha";
    }
    if (document.querySelector('input[type="password"]') && document.querySelectorAll("form input").length <= 4) {
      return "login";
    }
    return null;
  }

  function extract() {
    const blocked = detectBlock();
    const posting = findPosting();
    const pageText = NS.text(document.body || document.documentElement).slice(0, MAX_DESCRIPTION);

    const title =
      (posting && String(posting.title || "").trim()) ||
      firstText(["h1", '[data-testid*="job-title" i]', ".job-title"]) ||
      String(document.title || "").split("|")[0].trim();

    const company =
      (posting && posting.hiringOrganization && (posting.hiringOrganization.name || posting.hiringOrganization)) ||
      firstText([
        '[data-testid*="company" i]',
        '[class*="company-name" i]',
        '[class*="empresa" i] a',
        'a[href*="/empresa"]'
      ]) ||
      "";

    const location =
      (posting && fromAddress(posting)) ||
      firstText(['[data-testid*="location" i]', '[class*="location" i]', '[class*="local" i]']) ||
      (pageText.match(/\b[\p{L}\s]{2,40}\s-\s[A-Z]{2}\b/u) || [])[0] ||
      "";

    const salary =
      (posting && salaryFrom(posting)) ||
      salaryFromText(pageText) ||
      "";

    const description = posting && posting.description
      ? htmlToText(posting.description).slice(0, MAX_DESCRIPTION)
      : biggestDescription();

    const validThrough = posting && posting.validThrough ? String(posting.validThrough) : "";
    const validTs = Date.parse(validThrough);
    const expiredText = /vaga (encerrada|expirada|indisponivel|removida)|anuncio (encerrado|expirado)|processo seletivo (encerrado|finalizado)/i.test(
      NS.norm(pageText)
    );

    return {
      ok: true,
      url: location.href.split("#")[0],
      site: (window.__MJB_adapterFor ? window.__MJB_adapterFor(location.href).key : "generic"),
      blocked,
      title: String(title || "").replace(/\s+/g, " ").slice(0, 200),
      company: String(company || "").replace(/\s+/g, " ").slice(0, 120),
      location: String(location || "").replace(/\s+/g, " ").slice(0, 120),
      salary: String(salary || "").replace(/\s+/g, " ").slice(0, 80),
      employmentType: (posting && String(posting.employmentType || "")) || "",
      postedAt: (posting && String(posting.datePosted || "")) || "",
      validThrough,
      expired: expiredText || (Number.isFinite(validTs) && validTs < Date.now()),
      description,
      hasJsonLd: Boolean(posting),
      descriptionSize: description.length
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "MJB_EXTRACT") return;
    try {
      sendResponse(extract());
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  });
})();

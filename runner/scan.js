(() => {
  if (window.__MJB_SCAN_READY) return;
  window.__MJB_SCAN_READY = true;

  const NS = window.__MJB;

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^(vaga|job|emprego)\s*[:\-]\s*/i, "")
      .replace(/\s*\|\s*.*$/, "")
      .trim()
      .slice(0, 180);
  }

  function looksLikeDetail(href, lenient) {
    if (!lenient) return true;
    return /[/\-_=]\d{3,}/.test(href) || /\.(html?|aspx)(\?|$)/i.test(href);
  }

  function collect(adapter, lenient) {
    let detail = /./i;
    let exclude = null;
    try {
      if (adapter.isJobDetail) detail = new RegExp(adapter.isJobDetail, "i");
      if (adapter.excludeUrl) exclude = new RegExp(adapter.excludeUrl, "i");
    } catch {
      /* adapter inválido: segue sem filtro */
    }

    const found = new Map();
    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = String(anchor.href || "").split("#")[0];
      if (!/^(https?|file):/i.test(href)) continue;
      if (!detail.test(href)) continue;
      if (exclude && exclude.test(href)) continue;
      if (!looksLikeDetail(href, lenient)) continue;

      const title = cleanTitle(
        anchor.getAttribute("aria-label") || anchor.getAttribute("title") || NS.text(anchor)
      );
      if (title.length < 3) continue;

      const previous = found.get(href);
      if (!previous || title.length > previous.title.length) {
        found.set(href, { url: href, title });
      }
    }
    return [...found.values()];
  }

  function absolute(href) {
    try {
      return new URL(href, location.href).toString().split("#")[0];
    } catch {
      return "";
    }
  }

  function pageNumberIn(url) {
    try {
      const parsed = new URL(url);
      for (const key of ["page", "Page", "pagina", "p"]) {
        const value = parsed.searchParams.get(key);
        if (value && /^\d+$/.test(value)) return Number(value);
      }
    } catch {
      /* url estranha */
    }
    return null;
  }

  function withPage(url, page, param = "page") {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set(param, String(page));
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  // Descobre a próxima página de resultados: link "próxima", rel=next ou o
  // próprio paginador (Catho ?page=N, InfoJobs ?Page=N).
  function detectNext() {
    const adapter = window.__MJB_adapterFor(location.href);
    const candidates = [
      'a[rel="next"]',
      "a.next-page",
      'a[aria-label*="Próxima" i]',
      'a[aria-label*="Proxima" i]',
      'a[aria-label*="Next" i]',
      'a[title*="Próxima" i]',
      'a[title*="Next" i]'
    ];
    for (const selector of candidates) {
      const anchor = document.querySelector(selector);
      if (!anchor) continue;
      const href = absolute(anchor.getAttribute("href"));
      if (href && href !== location.href.split("#")[0]) return href;
    }

    const textual = [...document.querySelectorAll("a[href]")].find((anchor) =>
      /^(pr[oó]xim[ao]|seguinte|next|›|»)$/i.test(NS.text(anchor))
    );
    if (textual) {
      const href = absolute(textual.getAttribute("href"));
      if (href && href !== location.href.split("#")[0]) return href;
    }

    // Fallback por parâmetro de página: Catho/InfoJobs não renderizam o
    // paginador no HTML inicial, mas aceitam o parâmetro na URL.
    const config = adapter && adapter.pagination;
    if (config && config.param) {
      const current = pageNumberIn(location.href) || 1;
      if (current < 60) return withPage(location.href, current + 1, config.param);
    }

    const current = pageNumberIn(location.href) || 1;
    const hasPaginator = Boolean(
      document.querySelector('.pagination, [class*="pagination" i], [class*="paginator" i]')
    );
    if (hasPaginator && current < 60) return withPage(location.href, current + 1, "page");
    return "";
  }

  function scanPage() {
    const adapter = window.__MJB_adapterFor(location.href);
    let jobs = collect(adapter, adapter.key === "generic");

    // Se o adapter específico não achou nada, tenta um padrão mais largo.
    if (!jobs.length) {
      jobs = collect(window.__MJB_ADAPTERS.generic, true);
    }
    return {
      jobs: jobs.map((job) => ({ ...job, site: adapter.key })),
      nextUrl: detectNext(),
      page: pageNumberIn(location.href) || 1
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "MJB_SCAN") return;
    try {
      const result = scanPage();
      sendResponse({ ok: true, jobs: result.jobs, nextUrl: result.nextUrl, page: result.page, url: location.href });
    } catch (error) {
      sendResponse({ ok: false, jobs: [], nextUrl: "", error: String(error) });
    }
  });
})();

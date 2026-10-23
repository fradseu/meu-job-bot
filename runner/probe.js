(() => {
  if (window.__MJB_PROBE_READY) return;
  window.__MJB_PROBE_READY = true;

  const NS = window.__MJB;

  function describe(el) {
    return {
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      id: el.id || "",
      name: el.getAttribute("name") || "",
      placeholder: el.getAttribute("placeholder") || "",
      label:
        (el.labels && el.labels[0] && NS.text(el.labels[0])) ||
        el.getAttribute("aria-label") ||
        "",
      visible: NS.visible(el),
      required: Boolean(el.required),
      value: el.type === "password" ? "" : String(el.value || "").slice(0, 40)
    };
  }

  function probe() {
    const adapter = window.__MJB_adapterFor(location.href);
    const buttons = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')]
      .filter((el) => NS.visible(el))
      .slice(0, 60)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: NS.text(el).slice(0, 60),
        id: el.id || "",
        cls: String(el.className || "").slice(0, 80)
      }));
    const fields = [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => el.type !== "hidden")
      .slice(0, 60)
      .map(describe);
    return {
      url: location.href,
      title: document.title,
      adapter: adapter.key,
      inputs: fields.length,
      buttons,
      fields,
      textSample: NS.text(document.body).slice(0, 900)
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "MJB_PROBE") return;
    try {
      sendResponse(probe());
    } catch (error) {
      sendResponse({ error: String(error) });
    }
  });
})();

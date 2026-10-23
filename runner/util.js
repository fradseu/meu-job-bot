(() => {
  const NS = (window.__MJB = window.__MJB || {});
  if (NS.utilReady) return;
  NS.utilReady = true;

  NS.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  NS.rand = (min, max) => Math.floor(min + Math.random() * Math.max(1, max - min + 1));
  NS.text = (el) => ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  NS.norm = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  NS.visible = (el) => {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) < 0.05) return false;
    return true;
  };

  NS.visibleAll = (selector, root = document) =>
    [...root.querySelectorAll(selector)].filter(NS.visible);

  NS.clickable = (el) =>
    el.closest('button, a, [role="button"], input[type="submit"], input[type="button"], label, summary') || el;

  NS.click = (el) => {
    const target = NS.clickable(el);
    if (!target) return false;
    try {
      target.scrollIntoView({ block: "center", inline: "center" });
    } catch {
      /* alguns elementos não têm layout */
    }
    try {
      target.click();
      return true;
    } catch {
      return false;
    }
  };

  NS.isDisabled = (el) => {
    if (!el) return true;
    if (el.disabled) return true;
    if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return true;
    const cls = el.className;
    if (typeof cls === "string" && /(^|\s)(is-)?disabled(\s|$)/i.test(cls)) return true;
    return false;
  };

  NS.rx = (patterns) =>
    (Array.isArray(patterns) ? patterns : [patterns])
      .filter(Boolean)
      .map((pattern) => (pattern instanceof RegExp ? pattern : new RegExp(pattern, "i")));

  NS.findByText = (patterns, options = {}) => {
    const {
      selector = 'button, a, [role="button"], input[type="submit"], input[type="button"], label',
      root = document,
      max = 1,
      exclude = []
    } = options;
    const wanted = NS.rx(patterns);
    const blocked = NS.rx(exclude);
    const found = [];
    for (const el of root.querySelectorAll(selector)) {
      if (!NS.visible(el)) continue;
      const label =
        NS.text(el) || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "";
      if (!label || label.length > 90) continue;
      if (!wanted.some((re) => re.test(label))) continue;
      if (blocked.some((re) => re.test(label))) continue;
      found.push(el);
      if (max && found.length >= max) break;
    }
    return max === 1 ? found[0] || null : found;
  };

  NS.waitFor = async (fn, { timeout = 15000, interval = 350 } = {}) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      let value = null;
      try {
        value = fn();
      } catch {
        value = null;
      }
      if (value) return value;
      await NS.sleep(interval);
    }
    return null;
  };

  NS.setValue = (el, value) => {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    el.dataset.mjbFilled = "1";
  };

  NS.attachFile = (input, resume) => {
    if (!input || !resume || !resume.dataUrl) return false;
    try {
      const parts = String(resume.dataUrl).split(",");
      const meta = parts[0].match(/data:([^;]+);base64/);
      const mime = (meta && meta[1]) || resume.type || "application/octet-stream";
      const binary = atob(parts[1] || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], resume.name || "curriculo.pdf", { type: mime });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  NS.humanDelay = (min = 4000, max = 11000) => NS.sleep(NS.rand(min, max));
})();

(() => {
  if (window.__MJB_APPLY_READY) return;
  window.__MJB_APPLY_READY = true;

  const NS = window.__MJB;
  if (!NS) {
    console.warn("[JobBot] runner/util.js não foi injetado antes de apply.js");
    return;
  }

  const S = {
    apply: [
      "quero me candidatar",
      "candidatura simplificada",
      "easy apply",
      "me candidatar",
      "candidatar-se",
      "candidatar",
      "enviar curriculo",
      "enviar cv",
      "inscrever-se",
      "me inscrever",
      "apply now",
      "^apply$",
      "aplicar"
    ],
    submit: [
      "enviar candidatura",
      "enviar curriculo",
      "enviar cv",
      "finalizar candidatura",
      "concluir candidatura",
      "confirmar candidatura",
      "enviar resposta",
      "enviar inscricao",
      "enviar aplicacao",
      "^enviar$",
      "^submit",
      "^confirmar$",
      "^finalizar$",
      "^concluir$"
    ],
    next: [
      "continuar",
      "avancar",
      "proxim[oa]",
      "^next",
      "prosseguir",
      "salvar e continuar",
      "revisar",
      "review",
      "^seguir"
    ],
    applied: [
      "candidatura (enviada|realizada|concluida|efetuada|registrada|confirmada)",
      "curriculo (enviado|enviada)",
      "voce (ja )?se candidatou",
      "inscricao (enviada|realizada|confirmada)",
      "enviamos sua candidatura",
      "already applied",
      "application submitted"
    ],
    exclude: [
      "minhas candidaturas",
      "^candidaturas",
      "salvar (vaga|busca)",
      "compartilhar",
      "denunciar",
      "pesquisar",
      "^buscar",
      "cadastrar",
      "criar alerta",
      "ver (todas|mais)"
    ],
    consent: ["aceito", "concordo", "autorizo", "termos", "privacidade", "lgpd", "consentimento"],
    external: [
      "no site da empresa",
      "site da empresa",
      "candidatar-se no site",
      "candidatura externa",
      "apply on company site",
      "apply externally",
      "ir para o site",
      "continuar no site"
    ],
    junk: ["busca", "buscar", "pesquisar", "search", "filtro", "localiza"],
    company: ["empresa", "company", "organizacao", "razao social"]
  };

  const APPLY = NS.rx(S.apply);
  const SUBMIT = NS.rx(S.submit);
  const NEXT = NS.rx(S.next);
  const APPLIED = NS.rx(S.applied);
  const EXCLUDE = NS.rx(S.exclude);
  const CONSENT = NS.rx(S.consent);
  const EXTERNAL = NS.rx(S.external);
  const JUNK = NS.rx(S.junk);
  const COMPANY = NS.rx(S.company);

  const FIELD_RULES = [
    [/linkedin/, "linkedin"],
    [/github/, "github"],
    [/portfolio|site pessoal|website|behance|dribbble|^blog/, "portfolio"],
    [/e-?mail|correio eletronico/, "email"],
    [/telefone|celular|whatsapp|fone|phone|mobile|contato/, "phone"],
    [/nome completo|full ?name|first[ _]?name|seu nome|nome do candidato/, "fullName"],
    [/preten[s]?ao|salario|salary|remuneracao|valor pretendido/, "salaryExpectation"],
    [/cidade|city|municipio|localidade/, "city"],
    [/estado|uf\b/, "state"],
    [/resumo|sobre voce|apresentacao|mensagem|cover letter|summary|comentario|observacao|carta/, "summary"],
    [/experiencia|tempo de (atuacao|mercado)|anos de/, "yearsExperience"],
    [/ingles|english|nivel de idioma/, "english"],
    [/escolaridade|formacao|grau de instrucao|education|instrucao/, "education"],
    [/disponibilidade|previsao de inicio|inicio|imediato/, "availability"],
    [/pcd|deficiencia/, "pcd"],
    [/[^a-z]name([^a-z]|$)/, "fullName"]
  ];

  let lastPayload = null;

  function adapter() {
    return window.__MJB_adapterFor(location.href);
  }

  // Ritmo humano: usa a faixa configurada no painel, com fator por tipo de ação.
  function pause(rules, factor = 1) {
    const min = Number(rules && rules.minDelayMs) || 3000;
    const max = Math.max(min, Number(rules && rules.maxDelayMs) || 8000);
    return NS.sleep(Math.round(NS.rand(min, max) * factor));
  }

  function captchaChallenge() {
    const frames = document.querySelectorAll(
      'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="captcha"]'
    );
    for (const frame of frames) {
      const rect = frame.getBoundingClientRect();
      if (rect.width > 250 && rect.height > 100 && NS.visible(frame)) return true;
    }
    const body = NS.norm((document.body && document.body.innerText) || "").slice(0, 20000);
    return /nao sou um robo|verify you are human|verifique que voce e humano|complete o captcha|confirme que voce nao e um robo/.test(
      body
    );
  }

  function detectBlock() {
    const url = location.href.toLowerCase();
    if (/\/(login|entrar|signin|sign-in)\b/.test(url)) return "login";
    if (/checking your browser|verificando seu navegador/.test(NS.norm(document.title))) return "captcha";
    if (captchaChallenge()) return "captcha";
    if (
      document.querySelector('input[type="password"]') &&
      document.querySelectorAll("form input").length <= 4
    ) {
      return "login";
    }
    return null;
  }

  function hasApplied(currentAdapter) {
    const patterns = [...APPLIED, ...NS.rx(currentAdapter.appliedTexts || [])];
    const all = document.body ? document.body.querySelectorAll("*") : [];
    const start = Math.max(0, all.length - 4000);
    for (let i = all.length - 1; i >= start; i -= 1) {
      const el = all[i];
      if (el.children.length > 0) continue;
      if (!NS.visible(el)) continue;
      if (el.closest("header, nav, footer")) continue;
      const text = NS.text(el);
      if (!text || text.length > 160) continue;
      const flat = NS.norm(text);
      if (patterns.some((re) => re.test(flat))) return true;
    }
    return false;
  }

  function findApply(currentAdapter) {
    const patterns = [...NS.rx(currentAdapter.applyTexts || []), ...APPLY];
    const nodes = document.querySelectorAll(
      'button, a, [role="button"], input[type="submit"], input[type="button"]'
    );
    let best = null;
    for (const el of nodes) {
      if (!NS.visible(el) || NS.isDisabled(el)) continue;
      if (el.closest("header, nav")) continue;
      const label = NS.text(el) || el.value || el.getAttribute("aria-label") || "";
      if (!label || label.length > 80) continue;
      const flat = NS.norm(label);
      if (/candidaturas/i.test(flat)) continue;
      if (EXCLUDE.some((re) => re.test(flat))) continue;
      if (EXTERNAL.some((re) => re.test(flat))) continue;
      if (!patterns.some((re) => re.test(flat))) continue;
      const score = (SUBMIT.some((re) => re.test(label)) ? 2 : 0) + (label.length < 30 ? 1 : 0);
      if (!best || score > best.score) best = { el, score };
    }
    return best ? best.el : null;
  }

  function findButton(scope, patterns) {
    const nodes = scope.querySelectorAll(
      'button, a, [role="button"], input[type="submit"], input[type="button"]'
    );
    const candidates = [];
    for (const el of nodes) {
      if (!NS.visible(el)) continue;
      const label = NS.text(el) || el.value || el.getAttribute("aria-label") || "";
      if (!label || label.length > 70) continue;
      const flat = NS.norm(label);
      if (!patterns.some((re) => re.test(flat))) continue;
      if (EXCLUDE.some((re) => re.test(flat))) continue;
      candidates.push({ el, label, disabled: NS.isDisabled(el), len: label.length });
    }
    candidates.sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.len - b.len);
    return candidates[0] || null;
  }

  function findFormScope() {
    const hasFields = (el) => el.querySelector('input:not([type="hidden"]), select, textarea');
    // Só aceita formulário que pareça de candidatura: evita preencher busca,
    // newsletter, login ou "fale com o recrutador" que existem na mesma página.
    const looksLikeApplication = (scope) => {
      if (!hasFields(scope)) return false;
      if (findButton(scope, SUBMIT) || findButton(scope, APPLY)) return true;
      if (scope.querySelector('input[type="file"]')) return true;
      return false;
    };

    const dialogs = NS.visibleAll(
      '[role="dialog"], dialog[open], [class*="modal" i], [class*="Modal"]'
    ).filter(looksLikeApplication);
    if (dialogs.length) return dialogs[dialogs.length - 1];

    const mainForms = NS.visibleAll("form").filter(
      (form) => looksLikeApplication(form) && !form.closest("header, nav, footer, aside")
    );
    if (mainForms.length) return mainForms[0];
    return null;
  }

  function isJunk(el) {
    if (el.type === "search") return true;
    if (el.closest('header, nav, [role="search"], [role="navigation"]')) return true;
    const hint = NS.norm(`${el.getAttribute("placeholder") || ""} ${el.name || ""}`);
    return JUNK.some((re) => re.test(hint));
  }

  function realFields(scope) {
    return [...scope.querySelectorAll("input, select, textarea")].filter((el) => {
      if (el.type === "hidden" || el.disabled) return false;
      if (["submit", "button", "reset", "image", "search"].includes(el.type)) return false;
      if (isJunk(el)) return false;
      return el.type === "file" || NS.visible(el);
    });
  }

  function hasRealForm(scope) {
    if (!scope) return false;
    const fields = realFields(scope);
    if (fields.length >= 2) return true;
    const only = fields[0];
    return Boolean(only && (only.tagName === "TEXTAREA" || only.type === "file"));
  }

  function hintOf(el) {
    const parts = [];
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) parts.push(NS.text(label));
      } catch {
        /* id esquisito */
      }
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(NS.text(wrap).slice(0, 120));
    parts.push(el.getAttribute("aria-label") || "");
    parts.push(el.getAttribute("placeholder") || "");
    parts.push(el.getAttribute("name") || "");
    parts.push(el.id || "");
    parts.push(el.getAttribute("data-testid") || "");
    const group = el.closest(
      'fieldset, .form-group, [class*="field" i], [class*="input" i], [class*="control" i]'
    );
    if (group) {
      const label = group.querySelector('label, legend, .label, [class*="label" i]');
      if (label) parts.push(NS.text(label).slice(0, 120));
    }
    return NS.norm(parts.join(" | "));
  }

  function valueFor(hint, el, profile) {
    if (COMPANY.some((re) => re.test(hint))) return "";
    for (const [pattern, key] of FIELD_RULES) {
      if (!pattern.test(hint)) continue;
      const value = profile[key];
      if (value === undefined || value === null || String(value).trim() === "") return "";
      if (el.type === "number") {
        const digits = String(value).replace(/\D/g, "");
        return digits || "";
      }
      return String(value);
    }
    return "";
  }

  function applySelect(el, value, hint) {
    const wanted = NS.norm(value);
    const options = [...el.options];
    let match = options.find((opt) => NS.norm(opt.textContent) === wanted);
    if (!match) {
      match = options.find((opt) => {
        const text = NS.norm(opt.textContent);
        return text && (text.includes(wanted) || wanted.includes(text)) && text.length > 1;
      });
    }
    if (!match) {
      const digits = String(value).match(/\d+/);
      if (digits) {
        match = options.find((opt) => opt.textContent.replace(/\D/g, "") === digits[0]);
      }
    }
    if (!match && /disponibilidade|inicio|imediato/.test(hint)) {
      match = options.find((opt) => opt.value && !/selecione|escolha|--/.test(NS.norm(opt.textContent)));
    }
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dataset.mjbFilled = "1";
    return true;
  }

  function fillScope(scope, profile, resume) {
    let filled = 0;
    const fields = scope.querySelectorAll("input, select, textarea");
    for (const el of fields) {
      if (el.type === "hidden" || el.disabled || el.readOnly) continue;
      if (["submit", "button", "reset", "image", "search"].includes(el.type)) continue;
      if (el.type === "file") {
        if ((!el.files || el.files.length === 0) && NS.attachFile(el, resume)) filled += 1;
        continue;
      }
      if (el.type === "checkbox" || el.type === "radio") continue;
      if (!NS.visible(el) || isJunk(el)) continue;
      const hint = hintOf(el);
      if (!hint) continue;
      const existing = String(el.value || "").trim();
      if (existing && existing !== "0" && el.dataset.mjbFilled !== "1") continue;
      const value = valueFor(hint, el, profile);
      if (!value) continue;
      if (existing === value) {
        el.dataset.mjbFilled = "1";
        continue;
      }
      if (el.tagName === "SELECT") {
        if (applySelect(el, value, hint)) filled += 1;
      } else {
        NS.setValue(el, value);
        filled += 1;
      }
    }
    return filled;
  }

  function tickConsent(scope) {
    const boxes = scope.querySelectorAll('input[type="checkbox"]');
    for (const box of boxes) {
      if (box.checked || box.disabled) continue;
      const hint = `${hintOf(box)} ${NS.norm(box.value)}`;
      if (!CONSENT.some((re) => re.test(hint))) continue;
      NS.click(box);
    }
  }

  function highlight(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center" });
      el.style.outline = "3px solid #f59e0b";
      el.style.outlineOffset = "2px";
    } catch {
      /* sem layout */
    }
  }

  async function fillFlow(currentAdapter, profile, rules, resume) {
    const stats = { steps: 0, filled: 0, clicks: [] };
    let submitClicks = 0;

    for (let step = 0; step < 8; step += 1) {
      stats.steps = step + 1;
      await pause(rules, 0.15);

      const scope = findFormScope() || document.body;
      stats.filled += fillScope(scope, profile, resume);
      tickConsent(scope);

      if (hasApplied(currentAdapter)) return { state: "applied", detail: stats };

      const submit = findButton(scope, SUBMIT);
      const next = findButton(scope, NEXT);

      if (rules.dryRun) {
        highlight((submit && submit.el) || (next && next.el));
        return {
          state: "dry_run",
          reason: submit ? `botão: ${submit.label}` : "não achei o botão de envio",
          detail: stats
        };
      }
      if (!rules.autoSubmit) {
        highlight((submit && submit.el) || (next && next.el));
        return {
          state: "needs_review",
          reason: submit ? submit.label : "",
          detail: stats
        };
      }

      let target = null;
      if (submit && !submit.disabled) target = submit.el;
      else if (next && !next.disabled) target = next.el;

      if (!target) {
        await pause(rules, 0.2);
        const retry = findButton(findFormScope() || document.body, SUBMIT);
        if (retry && !retry.disabled) target = retry.el;
        else {
          return {
            state: "uncertain",
            reason: "nenhum botão de envio habilitado (campo obrigatório em branco?)",
            detail: stats
          };
        }
      }

      const isSubmit = SUBMIT.some((re) => re.test(NS.norm(NS.text(target))));
      if (isSubmit) submitClicks += 1;
      NS.click(target);
      stats.clicks.push(NS.text(target).slice(0, 40));
      await pause(rules, 0.35);

      if (hasApplied(currentAdapter)) return { state: "applied", detail: stats };

      if (isSubmit && submitClicks >= 2) {
        if (!findApply(currentAdapter) && !hasRealForm(findFormScope())) {
          return { state: "applied", detail: stats };
        }
        return { state: "uncertain", reason: "cliquei em enviar, mas não vi confirmação", detail: stats };
      }
    }

    if (hasApplied(currentAdapter)) return { state: "applied", detail: stats };
    return { state: "uncertain", reason: "fluxo com muitas etapas", detail: stats };
  }

  async function runApply(payload) {
    const { profile = {}, rules = {}, resume = null } = payload || {};
    lastPayload = { profile, rules, resume };
    const currentAdapter = adapter();

    await pause(rules, 0.15);

    const blocked = detectBlock();
    if (blocked) return { state: "blocked", reason: blocked };

    if (hasApplied(currentAdapter)) return { state: "already" };

    let clickedApply = false;
    if (!hasRealForm(findFormScope())) {
      const button = await NS.waitFor(() => findApply(currentAdapter), { timeout: 12000 });
      if (!button) {
        return { state: "no_button", reason: "não achei botão de candidatura nesta página" };
      }
      NS.click(button);
      clickedApply = true;
      await pause(rules, 0.25);

      const afterClick = detectBlock();
      if (afterClick) return { state: "blocked", reason: afterClick };
      if (hasApplied(currentAdapter)) return { state: "applied", detail: { how: "clique direto" } };

      await NS.waitFor(() => hasRealForm(findFormScope()) || hasApplied(currentAdapter), {
        timeout: 10000
      });
    }

    if (!hasRealForm(findFormScope()) && !hasApplied(currentAdapter)) {
      return {
        state: "uncertain",
        reason: clickedApply
          ? "cliquei em candidatar, mas o formulário não abriu aqui (pode abrir em outra aba)"
          : "página sem formulário de candidatura",
        detail: { clickedApply }
      };
    }

    return fillFlow(currentAdapter, profile, rules, resume);
  }

  async function runSubmit(payload) {
    const merged = { ...(lastPayload || {}), ...(payload || {}) };
    const currentAdapter = adapter();
    if (hasApplied(currentAdapter)) return { state: "applied" };
    return fillFlow(
      currentAdapter,
      merged.profile || {},
      { ...(merged.rules || {}), autoSubmit: true, dryRun: false },
      merged.resume || null
    );
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "MJB_APPLY") {
      runApply(message.payload)
        .then(sendResponse)
        .catch((error) => sendResponse({ state: "error", reason: String(error) }));
      return true;
    }
    if (message.type === "MJB_SUBMIT") {
      runSubmit(message.payload)
        .then(sendResponse)
        .catch((error) => sendResponse({ state: "error", reason: String(error) }));
      return true;
    }
  });
})();

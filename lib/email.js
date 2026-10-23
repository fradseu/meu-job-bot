import { esc } from "./util.js";

const BAND = [
  { min: 80, label: "Prioridade alta", color: "#0f766e" },
  { min: 65, label: "Vale candidatar", color: "#0d9488" },
  { min: 50, label: "Talvez", color: "#b45309" }
];

export function buildDigest({ jobs = [], date = new Date(), candidate = {}, siteCounts = {}, stats = {} } = {}) {
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const total = jobs.length;
  const evaluated = Number(stats.evaluated) || total;
  const minScore = Number(stats.minScore) || 0;
  const above = minScore ? jobs.filter((job) => Number(job.score) >= minScore).length : total;
  const best = total ? Math.max(...jobs.map((job) => Number(job.score) || 0)) : 0;

  const subject =
    total === 0
      ? `Triagem de vagas ${day}: nenhuma vaga nova para enviar`
      : minScore > 0 && above < total
        ? `Triagem de vagas ${day}: ${above} de ${total} vaga${total > 1 ? "s" : ""} acima de ${minScore} (melhor ${best}/100)`
        : `Triagem de vagas ${day}: ${total} vaga${total > 1 ? "s" : ""} avaliada${total > 1 ? "s" : ""} (melhor ${best}/100)`;

  const siteLine = Object.entries(siteCounts)
    .map(([site, count]) => `${site} ${count}`)
    .join(" · ");

  const summaryLine =
    total === 0
      ? "Nenhuma vaga aberta nesta execução."
      : minScore > 0
        ? `${total} vaga${total > 1 ? "s" : ""} no e-mail · ${above} acima de ${minScore} · ${evaluated} avaliada${evaluated > 1 ? "s" : ""} no total`
        : total < evaluated
          ? `${total} de ${evaluated} vagas no e-mail, da maior nota para a menor`
          : `${total} vaga${total > 1 ? "s" : ""} avaliada${total > 1 ? "s" : ""} hoje, da maior nota para a menor`;

  const cards = jobs
    .map((job, index) => card(job, index))
    .join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
        <tr><td style="padding:24px 28px 8px;background:#0f172a;">
          <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5eead4;font-weight:700;">MEU Job Bot</div>
          <h1 style="margin:6px 0 4px;font-size:22px;line-height:1.25;color:#ffffff;">${total} vaga${total === 1 ? "" : "s"} avaliada${total === 1 ? "" : "s"}${total ? ` · melhor ${best}/100` : ""}</h1>
          <div style="font-size:13px;color:#cbd5e1;">${esc(day)}${siteLine ? ` · ${esc(siteLine)}` : ""}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 4px;">
          <p style="margin:0 0 4px;font-size:14px;line-height:1.55;color:#334155;">
            ${esc(candidate.fullName || "Você")}, o robô abriu ${total} vaga${total === 1 ? "" : "s"} hoje e comparou a descrição com o seu currículo.
            ${minScore > 0 ? `A nota mínima para este e-mail é ${minScore}; ${above} passaram.` : "Todas estão aqui, com a nota de aderência."}
            Clique no botão para se candidatar no site.
          </p>
        </td></tr>
        <tr><td style="padding:12px 28px 24px;">
          ${cards || emptyBlock()}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#94a3b8;">
            Enviado pelo MEU Job Bot. As notas são uma triagem automática, não uma decisão: confira a vaga antes de aplicar.
            Nada foi enviado às empresas.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const textBlocks = jobs.map((job, i) =>
    [
      `${i + 1}) ${job.score}/100${job.verdict ? ` · ${job.verdict}` : ""}`,
      `   ${job.title}${job.company ? ` — ${job.company}` : ""}`,
      job.location ? `   Local: ${job.location}` : "",
      job.salary ? `   Salário: ${job.salary}` : "",
      job.reasons?.length ? `   Combina: ${job.reasons.join("; ")}` : "",
      job.gaps?.length ? `   Atenção: ${job.gaps.join("; ")}` : "",
      `   Link: ${job.url}`
    ]
      .filter(Boolean)
      .join("\n")
  );

  const text = [
    `MEU Job Bot — triagem de ${day}`,
    `${summaryLine}${siteLine ? ` (${siteLine})` : ""}`,
    "",
    ...(total ? [textBlocks.join("\n\n"), ""] : []),
    "Notas são triagem automática, não decisão: confira a vaga antes de aplicar.",
    "Nada foi enviado às empresas."
  ].join("\n");

  return { subject, html, text, day, total, evaluated, minScore };
}

function bandFor(score) {
  return BAND.find((item) => score >= item.min) || { label: "Baixa", color: "#64748b" };
}

function card(job, index) {
  const band = bandFor(job.score);
  const meta = [job.company, job.location].filter(Boolean).map(esc).join(" · ");
  const reasons = (job.reasons || []).slice(0, 3);
  const gaps = (job.gaps || []).slice(0, 2);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #e2e8f0;border-radius:12px;">
    <tr><td style="padding:16px 18px 6px;">
      <table role="presentation" width="100%"><tr>
        <td style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;">#${index + 1} · ${esc(job.site || "")}</td>
        <td align="right"><span style="display:inline-block;background:${band.color};color:#fff;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;">${job.score} · ${esc(band.label)}</span></td>
      </tr></table>
      <div style="font-size:16px;font-weight:700;line-height:1.35;color:#0f172a;margin-top:6px;">${esc(job.title || "(sem título)")}</div>
      ${meta ? `<div style="font-size:13px;color:#475569;margin-top:2px;">${meta}</div>` : ""}
      ${job.salary ? `<div style="font-size:13px;color:#0f766e;margin-top:4px;font-weight:600;">${esc(job.salary)}</div>` : ""}
      ${reasons.length ? `<div style="font-size:12.5px;color:#334155;margin-top:10px;line-height:1.5;"><strong style="color:#0f766e;">Combina:</strong> ${esc(reasons.join(" · "))}</div>` : ""}
      ${gaps.length ? `<div style="font-size:12.5px;color:#7c2d12;margin-top:4px;line-height:1.5;"><strong>Atenção:</strong> ${esc(gaps.join(" · "))}</div>` : ""}
      ${job.verdictText ? `<div style="font-size:12.5px;color:#475569;margin-top:4px;line-height:1.5;">${esc(job.verdictText)}</div>` : ""}
      <div style="margin:14px 0 12px;">
        <a href="${esc(job.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:10px 18px;border-radius:10px;">Abrir vaga e me candidatar</a>
      </div>
    </td></tr>
  </table>`;
}

function emptyBlock() {
  return `<div style="border:1px dashed #cbd5e1;border-radius:12px;padding:22px;text-align:center;font-size:13.5px;color:#64748b;line-height:1.6;">
    Nenhuma vaga nova foi aberta nesta execução.<br>
    Nada para revisar hoje — o robô volta a varrer na próxima execução.
  </div>`;
}

/* ------------------------------- envio ------------------------------- */

export const EMAIL_PROVIDERS = [
  { id: "brevo", name: "Brevo", needs: "apiKey + fromEmail (remetente verificado)" },
  { id: "resend", name: "Resend", needs: "apiKey + fromEmail (onboarding@resend.dev)" },
  { id: "web3forms", name: "Web3Forms", needs: "apiKey (access key) — texto simples" },
  { id: "custom", name: "Webhook próprio", needs: "webhookUrl" }
];

export async function sendEmail(emailConfig, { subject, html, text, total }) {
  const provider = emailConfig.provider || "brevo";
  const to = String(emailConfig.toEmail || "").trim();
  if (!to) throw new Error("informe o e-mail de destino");
  if (total === 0) throw new Error("nada para enviar: nenhuma vaga no e-mail");

  if (provider === "brevo") {
    assertKey(emailConfig);
    const fromEmail = String(emailConfig.fromEmail || "").trim();
    if (!fromEmail) throw new Error("informe o remetente verificado no Brevo");
    return postJson(
      "https://api.brevo.com/v3/smtp/email",
      { "api-key": emailConfig.apiKey, "Content-Type": "application/json" },
      {
        sender: { name: emailConfig.fromName || "MEU Job Bot", email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      }
    );
  }

  if (provider === "resend") {
    assertKey(emailConfig);
    const fromEmail = String(emailConfig.fromEmail || "onboarding@resend.dev").trim();
    return postJson(
      "https://api.resend.com/emails",
      { Authorization: `Bearer ${emailConfig.apiKey}`, "Content-Type": "application/json" },
      {
        from: `${emailConfig.fromName || "MEU Job Bot"} <${fromEmail}>`,
        to: [to],
        subject,
        html,
        text
      }
    );
  }

  if (provider === "web3forms") {
    assertKey(emailConfig);
    return postJson(
      "https://api.web3forms.com/submit",
      { "Content-Type": "application/json", Accept: "application/json" },
      {
        access_key: emailConfig.apiKey,
        subject,
        from_name: emailConfig.fromName || "MEU Job Bot",
        email: to,
        message: text,
        botcheck: false
      }
    );
  }

  if (provider === "custom") {
    const url = String(emailConfig.webhookUrl || "").trim();
    if (!url) throw new Error("informe a URL do webhook");
    return postJson(
      url,
      { "Content-Type": "application/json" },
      { to, subject, html, text, from: emailConfig.fromName || "MEU Job Bot" }
    );
  }

  throw new Error(`provedor de e-mail desconhecido: ${provider}`);
}

function assertKey(emailConfig) {
  if (!String(emailConfig.apiKey || "").trim()) throw new Error("informe a API key do provedor");
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const raw = await response.text().catch(() => "");
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    /* resposta não-JSON */
  }
  if (!response.ok) {
    if (/just a moment|cf-mitigated|cloudflare/i.test(raw)) {
      throw new Error(
        `envio bloqueado pelo Cloudflare (${response.status}). Abra o site do provedor no Chrome, conclua a verificação e tente de novo.`
      );
    }
    const detail = (data && (data.message || data.error || data.errors)) || raw;
    throw new Error(`envio falhou (${response.status}): ${String(JSON.stringify(detail) || "").slice(0, 220)}`);
  }
  if (data && data.success === false) {
    throw new Error(`o provedor recusou o envio: ${data.message || "sem detalhe"}`);
  }
  return { ok: true, provider: url, response: data || raw.slice(0, 200) };
}

export function digestToHtmlDocument(digest) {
  return String(digest.html || "");
}

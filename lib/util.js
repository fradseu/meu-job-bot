export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

export const fmtTime = (ts = Date.now()) =>
  new Date(ts).toLocaleTimeString("pt-BR", { hour12: false });

export const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

"use strict";
const API_BASE = document.body.dataset.apiBase.replace(/\/$/, "");
const form = document.getElementById("analysis-form"), fields = document.getElementById("analysis-fields"), policy = document.getElementById("policy"), submit = document.getElementById("analyze");
const status = document.getElementById("status"), error = document.getElementById("error"), retry = document.getElementById("retry-policies");
const analysisTime = document.getElementById("analysis-time");
const report = document.getElementById("report"), empty = document.getElementById("report-empty"), download = document.getElementById("download"), reportSection = document.querySelector(".report-section");
let reportUrl = null, busy = false;

async function loadPolicies() {
  fields.disabled = true; retry.hidden = true; error.hidden = true; status.textContent = "Caricamento delle policy…";
  try {
    const response = await fetch(`${API_BASE}/policies`, { signal: AbortSignal.timeout(15000), credentials: "omit" });
    if (!response.ok) throw new Error();
    const policies = await response.json();
    if (!Array.isArray(policies) || !policies.length || policies.some(item => typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name)) throw new Error();
    policy.replaceChildren(...policies.map(item => new Option(item.name, item.id)));
    fields.disabled = false; status.textContent = "";
  } catch {
    status.textContent = ""; error.textContent = "Non è stato possibile caricare le policy. Verifica la connessione e riprova."; error.hidden = false; retry.hidden = false;
  }
}

retry.addEventListener("click", loadPolicies);
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true; fields.disabled = true; error.hidden = true; download.hidden = true; report.hidden = true; empty.hidden = true;
  reportSection.setAttribute("aria-busy", "true"); status.textContent = "Analisi in corso. L’elaborazione può richiedere alcuni minuti: mantieni aperta questa pagina."; submit.textContent = "Analisi in corso…";
  const started = performance.now(), elapsed = () => { const seconds = Math.floor((performance.now() - started) / 1000); return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`; };
  status.classList.add("is-loading"); analysisTime.hidden = false; analysisTime.textContent = "Tempo trascorso: 0 s";
  const timer = setInterval(() => { analysisTime.textContent = `Tempo trascorso: ${elapsed()}`; }, 1000);
  if (reportUrl) { URL.revokeObjectURL(reportUrl); reportUrl = null; }
  try {
    const response = await fetch(`${API_BASE}/local-link-bot`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/markdown" }, credentials: "omit", body: JSON.stringify({ url: document.getElementById("dataset-url").value.trim(), policy: policy.value }) });
    if (!response.ok) {
      const messages = { 413: "Il documento è troppo grande per l’analisi. Prova con una rappresentazione più compatta dei metadati.", 415: "Il formato della risorsa non è supportato. Usa una pagina HTML o un documento testuale.", 422: "Controlla l’URL e la policy selezionata: il documento potrebbe essere vuoto o non valido.", 502: "Non è stato possibile recuperare i metadati o completare il report. Riprova tra poco.", 504: "L’analisi non è terminata entro il tempo disponibile. Riprova tra poco." };
      throw new Error(messages[response.status] || "Il servizio non ha completato la richiesta. Riprova tra poco.");
    }
    if (!response.headers.get("Content-Type")?.toLowerCase().includes("text/markdown")) throw new Error("Il servizio ha restituito un formato inatteso. Riprova tra poco.");
    const markdown = await response.text();
    if (!markdown.trim()) throw new Error("Il servizio ha restituito un report vuoto. Riprova tra poco.");
    report.innerHTML = DOMPurify.sanitize(marked.parse(markdown), { ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "b", "em", "i", "del", "s", "ul", "ol", "li", "blockquote", "pre", "code", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td"], ALLOWED_ATTR: ["href", "title", "colspan", "rowspan", "start", "align"], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
    report.querySelectorAll("table").forEach((table, index) => { const wrapper = document.createElement("div"); wrapper.className = "table-scroll"; wrapper.tabIndex = 0; wrapper.setAttribute("role", "region"); wrapper.setAttribute("aria-label", `Tabella ${index + 1} del report, scorrimento orizzontale`); table.before(wrapper); wrapper.append(table); });
    report.querySelectorAll("a").forEach(link => { const href = link.getAttribute("href"); if (href && !/^https?:\/\//i.test(href) && !href.startsWith("#")) link.removeAttribute("href"); link.target = "_blank"; link.rel = "noopener noreferrer"; });
    reportUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    download.href = reportUrl; download.hidden = false; report.hidden = false; status.textContent = `Analisi completata in ${elapsed()}. Il report è disponibile qui sotto e può essere scaricato in Markdown.`;
  } catch (failure) {
    status.textContent = ""; error.textContent = failure instanceof TypeError ? "Impossibile contattare il servizio. Verifica la connessione e riprova." : failure.message; error.hidden = false; empty.hidden = false;
  } finally {
    clearInterval(timer); status.classList.remove("is-loading"); analysisTime.hidden = true;
    busy = false; fields.disabled = false; submit.textContent = "Analizza metadati"; reportSection.setAttribute("aria-busy", "false");
  }
});
loadPolicies();

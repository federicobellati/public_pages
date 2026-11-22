"use strict";
const API_BASE = document.body.dataset.apiBase.replace(/\/$/, ""), REQUEST_TIMEOUT_MS = 3600000;
const form = document.getElementById("analysis-form"), fields = document.getElementById("analysis-fields"), question = document.getElementById("question"), submit = document.getElementById("analyze");
const status = document.getElementById("status"), error = document.getElementById("error"), analysisTime = document.getElementById("analysis-time"), responseTime = document.getElementById("response-time");
const report = document.getElementById("report"), empty = document.getElementById("report-empty"), download = document.getElementById("download"), reportSection = document.querySelector(".report-section");
let reportUrl = null, busy = false;

question.addEventListener("input", () => question.setCustomValidity(""));
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  question.setCustomValidity(question.value.trim() ? "" : "Scrivi una domanda prima di inviarla.");
  if (!form.reportValidity()) return;
  const text = question.value.trim();
  busy = true; fields.disabled = true; error.hidden = true; download.hidden = true; report.hidden = true; empty.hidden = true; responseTime.hidden = true;
  report.replaceChildren(); reportSection.setAttribute("aria-busy", "true"); status.textContent = "Ricerca in corso. Mantieni aperta questa pagina: l'elaborazione può richiedere diversi minuti."; submit.textContent = "Ricerca in corso…";
  const started = performance.now(), elapsed = () => { const seconds = Math.floor((performance.now() - started) / 1000); return seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min ${seconds % 60} s`; };
  status.classList.add("is-loading"); analysisTime.hidden = false; analysisTime.textContent = "Tempo trascorso: 0 s";
  const timer = setInterval(() => { analysisTime.textContent = `Tempo trascorso: ${elapsed()}`; }, 1000);
  if (reportUrl) { URL.revokeObjectURL(reportUrl); reportUrl = null; download.removeAttribute("href"); }
  try {
    const response = await fetch(`${API_BASE}/alvise-graph/query`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/markdown" }, credentials: "omit", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), body: JSON.stringify({ question: text }) });
    if (!response.ok) {
      const messages = { 422: "La domanda non è valida. Inserisci da 1 a 4.000 caratteri.", 502: "Il servizio di ricerca non ha restituito una risposta completa. Puoi riprovare.", 503: "Il servizio di ricerca non è configurato o è temporaneamente indisponibile. Contatta l'amministratore.", 504: "Il server ha interrotto l'attesa prima della risposta. Puoi riprovare; se il problema continua, contatta l'amministratore per verificare i timeout del servizio." };
      throw new Error(messages[response.status] || "Il servizio non ha completato la richiesta. Puoi riprovare tra poco.");
    }
    if (!response.headers.get("Content-Type")?.toLowerCase().includes("text/markdown")) throw new Error("Il servizio ha restituito un formato inatteso. Puoi riprovare.");
    const markdown = await response.text();
    if (!markdown.trim()) throw new Error("Il servizio ha restituito una risposta vuota. Puoi riprovare.");
    report.innerHTML = DOMPurify.sanitize(marked.parse(markdown), { ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "b", "em", "i", "del", "s", "ul", "ol", "li", "blockquote", "pre", "code", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td"], ALLOWED_ATTR: ["href", "title", "colspan", "rowspan", "start", "align"], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
    report.querySelectorAll("table").forEach((table, index) => { const wrapper = document.createElement("div"); wrapper.className = "table-scroll"; wrapper.tabIndex = 0; wrapper.setAttribute("role", "region"); wrapper.setAttribute("aria-label", `Tabella ${index + 1} della risposta, scorrimento orizzontale`); table.before(wrapper); wrapper.append(table); });
    report.querySelectorAll("a").forEach(link => { const href = link.getAttribute("href"); if (href && !/^https?:\/\//i.test(href) && !href.startsWith("#")) link.removeAttribute("href"); link.target = "_blank"; link.rel = "noopener noreferrer"; });
    reportUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    download.href = reportUrl; download.hidden = false; report.hidden = false;
    responseTime.textContent = `Tempo complessivo di risposta: ${elapsed()} (invio, elaborazione e ricezione).`; responseTime.hidden = false;
    status.textContent = "Ricerca completata. La risposta è disponibile qui sotto e può essere scaricata in Markdown.";
  } catch (failure) {
    status.textContent = `Richiesta terminata dopo ${elapsed()}.`;
    error.textContent = failure.name === "TimeoutError" || failure.name === "AbortError" ? "È stato raggiunto il limite di attesa di un'ora del browser. Non è stata ricevuta una risposta completa; l'elaborazione sul server potrebbe essere ancora in corso." : failure instanceof TypeError ? "Impossibile contattare il servizio. Verifica la connessione e riprova." : failure.message;
    error.hidden = false; empty.hidden = false;
  } finally {
    clearInterval(timer); status.classList.remove("is-loading"); analysisTime.hidden = true;
    busy = false; fields.disabled = false; submit.textContent = "Invia domanda"; reportSection.setAttribute("aria-busy", "false");
  }
});

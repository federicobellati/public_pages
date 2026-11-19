# Verifica dei metadati · IS-mA-BOT

Pagina statica HTML/CSS/JavaScript per nginx. Non richiede build, Node.js, framework o modifiche a FastAPI.

## Pubblicazione sul portale

Copiare `chatbot.html`, `chatbot.css`, `chatbot.js` e le risorse sotto `assets/` nella cartella del sito `public/public_site/`, mantenendo i percorsi. La tile IS-mA-BOT del portale punta già a `chatbot.html`. Non sostituire `styles.css`, `app.js`, `config.js` o altre pagine del portale. I loghi e il font inclusi provengono dal sito originale.

Il collegamento «Consulta la Data Policy» apre `https://assets.ve.ismar.cnr.it/public/public_site/datapolicy.html`. Il documento sarà pubblicato lì dall'amministratore: questa consegna non modifica quella pagina e non espone la policy attraverso un'API.

## Collegamento a GENAPI

L'indirizzo è configurato nell'attributo `data-api-base` di `chatbot.html`: `https://genapi.ve.ismar.cnr.it`. La pagina carica il menu da `GET /policies` e invia esclusivamente `url` e `policy` a `POST /local-link-bot`. Non inserire chiavi o credenziali nella pagina.

Il reverse proxy deve offrire un certificato HTTPS valido e consentire le richieste lunghe dell'analisi (timeout LLM attuale: 600 secondi). GENAPI deve consentire via CORS l'origine della pagina; il backend esistente ammette i sottodomini HTTP/HTTPS di `*.ve.ismar.cnr.it`. Certificati e configurazione del proxy restano a cura dell'amministratore.

## Comportamento

- Campo URL precompilato con il dataset ERDDAP di clorofilla del fiume Zero usato nei test; sono accettati URL HTTP/HTTPS.
- Durante l'attesa il modulo impedisce invii duplicati; non viene mostrata una percentuale di avanzamento.
- Il report Markdown viene reso con tabelle e sezioni nell'ordine restituito, senza ricalcolare risultati o percentuali. I report non sono conservati dopo la chiusura o il ricaricamento della pagina.
- Il download `report.md` conserva il testo restituito dall'API. La visualizzazione HTML viene filtrata con DOMPurify; script, moduli, immagini e contenuto attivo dei report non vengono eseguiti o caricati.
- Gestiti errori di connessione, caricamento policy e risposte API 413, 415, 422, 502, 504; possibile riprovare senza ricaricare la pagina. Un nuovo tentativo sostituisce il report precedente.
- Adattamento a telefono e desktop; le tabelle larghe scorrono all'interno della propria area, anche da tastiera.

## Librerie incluse

Marked 18.2.1 (MIT) e DOMPurify 3.4.18 (Apache-2.0 o MPL-2.0), con le rispettive licenze in `assets/vendor/`. Sono copie locali: nessun caricamento da CDN durante l'uso. Riferimenti: https://marked.js.org/ e https://github.com/cure53/DOMPurify.

## Verifica locale

La pagina è stata verificata nel browser con risposte di prova: visualizzazione del report, download, errori, validazione e adattamento a telefono e desktop. Il server temporaneo, le risposte di prova e le schermate di verifica sono stati rimossi durante la pulizia del progetto. La verifica del collegamento reale HTTPS sarà eseguita dopo l'aggiornamento dei certificati e la pubblicazione della pagina.

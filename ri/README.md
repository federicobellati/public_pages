# Registro RI da SPARQL

Nuova versione della pagina pubblica: stessa grafica inglese di `registry-web/`, elenco dinamico e schede individuali, con dati esclusivamente da `https://fuseki.ve.ismar.cnr.it/rireg/query`. La versione precedente in `registry-web/` resta invariata. Nessuna lettura dei Turtle locali o su assets, nessuna lista manuale di infrastrutture, nessuna scrittura sul server.

## Pubblicazione

Copiare `index.html`, `styles.css`, `app.js` e l'intera cartella `assets/` in una cartella dedicata sotto `https://assets.ve.ismar.cnr.it/`. Non occorrono compilazione, installazioni o componenti server side aggiuntivi. Non copiare README, test, checkpoint, profilo, form o `AGENTS.md`. I file sono stati preparati localmente: nessuna pubblicazione eseguita.

- Elenco: `index.html` nella cartella scelta.
- Scheda individuale: `index.html?id=danubius-ri`, oppure uno dei collegamenti generati dall'elenco.
- L'indirizzo `?id=` identifica una vista individuale condivisibile: non occorre generare un file HTML per ciascuna RI né configurare riscritture del server.

La pagina richiede JavaScript e una connessione a Fuseki. HTTPS e CORS dal dominio `https://assets.ve.ismar.cnr.it` sono stati verificati il 9 novembre 2026. Verificata anche l'apertura diretta di `index.html` in Edge dal computer, con caricamento automatico dell'elenco, apertura della scheda e ritorno all'elenco: non occorre selezionare un Turtle. Il browser può inviare `Origin: null`, quindi questa modalità dipende dal CORS del server per tale origine. Per un dominio di pubblicazione diverso occorre che Fuseki autorizzi anche quell'origine. Queste istruzioni non modificano la configurazione di Fuseki.

## Dati e query

`sparqlEndpoint` in `app.js` contiene l'endpoint HTTPS. Le richieste sono GET anonime con parametro `query`, intestazione `Accept`, credenziali omesse, cache disabilitata e timeout di 20 secondi; vengono controllati stato HTTP e formato della risposta.

L'elenco usa SELECT sul default graph di `/rireg`: cerca le risorse con tipo LUPO `https://kos.lifewatch.eu/ontologies/LUPO#ResearchInfrastructure` e IRI nel namespace del profilo `https://w3id.org/cnr-ismar/research-infrastructures-registry/`, ricavando titoli e nomi alternativi facoltativi. Le righe multiple sono raggruppate per RI; i nomi inglesi hanno precedenza. Non c'è un limite fisso al numero di RI. Le nuove descrizioni conformi presenti nel default graph appaiono al successivo caricamento. La pagina non interroga named graph: nelle prove preliminari non sono stati restituiti named graph non vuoti.

La scheda usa CONSTRUCT per recuperare le triple dell'infrastruttura, del documento identificato dalla convenzione approvata `IRI della RI + .ttl` e dei relativi contatto ed editore. N3.js legge il risultato Turtle; non scarica documenti dagli IRI W3ID o da una directory. Il download contiene il risultato della query, non il file sorgente originale: commenti, prefissi, ordine delle triple ed etichette dei nodi anonimi possono differire. Il grafo mantiene gli IRI e le relazioni esistenti, senza introdurre triple o un nuovo modello.

Restano disponibili sito ufficiale, logo con testo sostitutivo in caso di errore, domini scientifici, IRI copiabile, metadati espandibili, descrizione RDF e download. Licenza, diritti, responsabilità, versione e date riguardano il documento di metadati; nessuna validazione SHACL è eseguita dalla pagina. Font, loghi istituzionali, foglio di stile, libreria N3.js e licenze sono copie identiche alle risorse della pagina precedente; i loghi delle RI sono richiesti agli indirizzi contenuti nel dataset.

## Verifica

Controllo sintassi: `node --check registry-sparql-web/app.js`. Il test dedicato `.shacl/tests/test_sparql_web.cjs` verifica la pagina con risposte effettive di Fuseki e alcuni casi simulati, senza leggere Turtle dal registry o da assets e senza modificare il dataset. Usa Playwright ed Edge già disponibili nell'ambiente Codex e un server temporaneo limitato alla cartella della pagina su `127.0.0.1`, chiuso a fine test. Le query verso Fuseki sono richieste HTTPS reali nella fase live; il CORS per assets è verificato separatamente mediante richiesta HTTP con la relativa origine. I risultati e le schermate sono salvati in `.shacl/qa/sparql-web-*`.

Una prima anteprima con origine assets simulata tramite intercettazione delle richieste è stata bloccata da Edge: il browser considerava la pagina pubblica e Fuseki nella rete locale. La verifica dalla vera origine di pubblicazione resta da eseguire dopo il caricamento: i browser possono richiedere il permesso di accesso alla rete locale quando una pagina pubblica contatta un endpoint che il DNS interno risolve su un indirizzo privato. Non sono state cambiate impostazioni del browser, indebolite protezioni o aggiunti inoltri. Riferimento: [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access).

Riferimenti: [SPARQL Query](https://www.w3.org/TR/sparql11-query/), [SPARQL Protocol](https://www.w3.org/TR/sparql11-protocol/), [endpoint Fuseki](https://jena.apache.org/documentation/fuseki2/soh.html). Le classi e le proprietà del modello già approvato sono riutilizzate; nessun nuovo termine ontologico è aggiunto.

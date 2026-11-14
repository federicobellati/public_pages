# CNR ISMAR · Facilities Registry

Pagina statica autonoma per esplorare il registro Facilities, nello stile della pagina [Locations](https://assets.ve.ismar.cnr.it/public/public_pages/loc/). Tutto il necessario è in questa cartella, pronta per un repository separato. Nessun file del portale principale è necessario.

## Pubblicazione

Copia **il contenuto** di questa cartella nella directory servita a:

`https://assets.ve.ismar.cnr.it/public/public_pages/fac/`

Il documento iniziale è `index.html`. Non occorrono installazione, compilazione, backend o regole di riscrittura. Sono sufficienti HTTPS, indice `index.html` e MIME type standard. Usare la barra finale nell'indirizzo della directory. Per le prove locali servire la cartella via HTTP; l'apertura con `file://` può essere bloccata dal browser per le richieste al registro.

La tile **Facilities** dentro SOM è già configurata nel portale principale per l'indirizzo finale. **Facilities Map** resta disponibile con il suo collegamento precedente. La pagina sarà raggiungibile da quella tile dopo la pubblicazione di questa cartella.

## Dati e navigazione

- Endpoint di sola lettura: `https://fuseki.ve.ismar.cnr.it/facreg/query`.
- Risorse: `sosa:Asset` nel namespace `https://w3id.org/cnr-ismar/facilities-registry/`.
- Elenco aggiornato all'apertura; pulsante Refresh per rileggerlo. Nessun elenco statico di ripiego.
- Ricerca su nomi, codici, descrizioni, proprietari, referenti e categorie; filtro per tipo di facility e ordinamento A–Z/Z–A.
- Scheda condivisibile tramite `?id=bgc_argo`, con descrizione, tipo SeaVoX L06, proprietario, referenti, eventuali localizzazioni, metadati e identificativo persistente.
- Download della descrizione Turtle effettivamente ricevuta, compresi documento amministrativo, attribuzioni, agenti, contatti ed editore. Nessuna coordinata viene dedotta quando non è presente nel registro.
- Timeout di 25 secondi, messaggi per errori e risultati vuoti, pulsante per riprovare; supporto alla cronologia del browser.

Le richieste non inviano cookie o credenziali. Fuseki deve consentire CORS dall'origine della pagina. Il 14 novembre 2026 l'endpoint ha restituito 44 facilities ed è stato verificato dal browser in anteprima locale.

## Edit

Ogni scheda ha il pulsante **Edit**, che apre il [modulo Facility già disponibile online](https://assets.ve.ismar.cnr.it/public/public_forms/sap-facility-shacl-form.html) in una nuova scheda. La cartella contiene soltanto la pagina di visualizzazione e le sue risorse, senza una copia locale del modulo.

**Limite del modulo online verificato:** non supporta il caricamento automatico di una facility tramite il parametro `id`. Il pulsante apre quindi il modulo senza passare un parametro che verrebbe ignorato. Questa limitazione è indicata anche nella scheda.

Per modificare una facility con il modulo attuale, scaricare il suo `.ttl` dalla sezione **Semantic description** della scheda e importarlo nel modulo online mediante **Carica Turtle locale**. Il caricamento automatico richiederebbe un intervento sul modulo online, esterno a questa pagina di visualizzazione.

## File e configurazione

| File | Contenuto |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Elenco e schede di dettaglio |
| `config.js` | Endpoint, namespace, collegamenti al portale, SOM, Locations e modulo online |
| `type-labels.js` | Etichette SeaVoX L06 già incluse nel modulo ISMAR, versione 21 |
| `assets/` | Loghi, font Manrope e lettore RDF N3 |
| `licenses/` | Licenze e provenienza |

Le risorse grafiche e software della visualizzazione sono locali: non occorre una CDN. I dati restano caricati in tempo reale dai servizi ISMAR. Il collegamento al modulo online è configurato in `editURL` in `config.js`.

I metadati descrivono il documento RDF; la relativa licenza non viene presentata come licenza dei dati osservativi. Le date senza indicazione del fuso sono mostrate come ricevute, senza assegnare un fuso arbitrario.

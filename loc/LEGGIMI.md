# Registro delle location — pagina pubblica

## Pubblicazione

Copiare **tutto il contenuto di questa cartella**, mantenendo le sottocartelle, in:

https://assets.ve.ismar.cnr.it/public/public_pages/loc/

La pagina iniziale è `index.html`. Non servono installazione, compilazione, database locale, PHP o altri componenti server-side. I file sono già pronti. Il server deve soltanto servire i file statici.

## Funzionamento

- Elenco compatto delle `geo:Feature` nel namespace `https://w3id.org/cnr-ismar/locations-registry/`, con nome (`rdfs:label`, poi `dcterms:title`), codice e paese; ricerca anche nella descrizione e ordinamento A–Z / Z–A.
- Dati letti direttamente da `https://fuseki.ve.ismar.cnr.it/locreg/query`. Nuove location pubblicate nel dataset compaiono al caricamento o premendo **Refresh**, senza modificare il sito. Ricerca e ordinamento operano nel browser sull'elenco caricato; non c'è un limite di cento record.
- Scheda singola con URL condivisibile, per esempio `https://assets.ve.ismar.cnr.it/public/public_pages/loc/?id=AAOT`. Il collegamento diretto funziona anche al ricaricamento, senza regole di riscrittura sul server.
- Link **Edit** nella scheda: apre in una nuova scheda `https://assets.ve.ismar.cnr.it/public/public_forms/sap-location-shacl-form.html?id={ID}`. Occorre pubblicare anche la copia aggiornata del modulo consegnata in `../web_forms/`: il modulo precedente non legge il parametro `id`. Il modulo rilegge da Fuseki la location selezionata; le modifiche si esportano in Turtle con il funzionamento abituale, senza scritture automatiche nel registro.
- Descrizione, note, immagine e relazioni geografiche provengono dalla Feature. Immagini e campi opzionali vengono mostrati se presenti; nessuna location viene modellata o duplicata dalla pagina.
- Coordinate dal `geo:asWKT` della Geometry collegata: `POINT Z(longitudine latitudine quota)` in EPSG:4979, secondo la convenzione esplicita del SAP Location. Quota ellissoidica WGS84 e accuratezza verticale espresse in metri; lo zero è preservato. Il collegamento a OpenStreetMap usa soltanto le coordinate orizzontali.
- Geometria, UUID, documento amministrativo, publisher, contatto, licenza e date consultabili nei pannelli espandibili. Le date sono visualizzate in UTC, con valore originale disponibile nel titolo del campo.
- Download del sottografo Turtle restituito da Fuseki: Feature, documento `.ttl`, Geometry collegata, publisher e contatto. Non viene scaricato l'intero dataset e non viene effettuata validazione SHACL nel browser.
- Interfaccia in inglese, palette, loghi e carattere coerenti con il registro RI. Layout adattato anche agli schermi piccoli.

## File

`index.html`, `styles.css` e `app.js` costituiscono la pagina. `assets/` contiene loghi CNR/ISMAR, Manrope e il lettore RDF N3.js, riutilizzati dalla pagina pubblica del registro RI. Le licenze di N3.js e Manrope sono incluse nelle rispettive sottocartelle. Nessuna libreria viene richiesta a CDN durante l'uso; l'immagine eventualmente dichiarata nella Feature viene caricata dal suo URL originale.

La lettura del dataset richiede una connessione a Internet e il permesso CORS del servizio Fuseki per l'origine `https://assets.ve.ismar.cnr.it`: verificato il 9 novembre 2026. Il sito non richiede cookie, autenticazione o credenziali; tutte le richieste a Fuseki sono query di sola lettura.

Per un'anteprima locale servire la cartella con un normale server HTTP statico. Il doppio clic sul file HTML (`file://`) può essere limitato dal browser o dal CORS del servizio; la destinazione prevista è HTTPS.

## Verifiche

Verificati il collegamento al dataset pubblico (una location: AAOT), elenco, ricerca per descrizione, assenza di risultati, ordinamento, scheda tramite clic e URL diretto, metadati, immagine, copia IRI, download Turtle e layout desktop/mobile. Verificati inoltre parsing e coordinate dei 40 Turtle locali e aggregazione di un elenco simulato di cento location con righe duplicate ed etichette multilingua. I dati di prova non sono inclusi in questa cartella.

I riscontri tecnici e le schermate sono conservati separatamente nel progetto, in `output/verifica_web_loc/`. Nessun Turtle del progetto è stato modificato e nessun file è stato pubblicato sul server.

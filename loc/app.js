'use strict';

const registryIRI = 'https://w3id.org/cnr-ismar/locations-registry/';
const sparqlEndpoint = 'https://fuseki.ve.ismar.cnr.it/locreg/query';
const ns = { rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', geo: 'http://www.opengis.net/ont/geosparql#', dc: 'http://purl.org/dc/terms/', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', skos: 'http://www.w3.org/2004/02/skos/core#', gn: 'https://www.geonames.org/ontology#', foaf: 'http://xmlns.com/foaf/0.1/', dcat: 'http://www.w3.org/ns/dcat#', vc: 'http://www.w3.org/2006/vcard/ns#', owl: 'http://www.w3.org/2002/07/owl#' };
const byId = id => document.getElementById(id);
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\u0000-\u0020<>"{}|^`\\/?#]/u.test(id);
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en');
const preferred = terms => terms.find(term => term.language === 'en' || term['xml:lang'] === 'en') || terms.find(term => !term.language && !term['xml:lang']) || terms[0];
let catalogue = null;
let loadSequence = 0;
let currentIRI = '';
let downloadURL;
let activeRequest;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function notice(message, error = false) {
  byId('status').textContent = message;
  byId('notice').hidden = !message;
  byId('notice').classList.toggle('error', error);
  byId('retry').hidden = !error;
  byId('error-back').hidden = !error || !new URLSearchParams(location.search).has('id');
}

function linked(value, label, email = false) {
  let url = '';
  try { const parsed = new URL(value); if (['https:', 'http:', ...(email ? ['mailto:'] : [])].includes(parsed.protocol)) url = parsed.href; } catch { /* Render non-URL values as plain text. */ }
  const node = element(url ? 'a' : 'span', label || value);
  if (url) node.href = url;
  return node;
}

async function querySparql(query, accept, signal) {
  const url = new URL(sparqlEndpoint);
  url.searchParams.set('query', query);
  const response = await fetch(url, { headers: { Accept: accept }, credentials: 'omit', cache: 'no-store', signal });
  if (!response.ok) throw new Error('The registry service is unavailable (HTTP ' + response.status + ').');
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes(accept)) throw new Error('The registry service returned an unexpected response format.');
  return response;
}

const catalogueQuery = `SELECT DISTINCT ?feature ?label ?title ?notation ?description ?country WHERE {
  ?feature a <${ns.geo}Feature> .
  FILTER(isIRI(?feature) && STRSTARTS(STR(?feature), "${registryIRI}"))
  OPTIONAL { ?feature <${ns.rdfs}label> ?label }
  OPTIONAL { ?feature <${ns.dc}title> ?title }
  OPTIONAL { ?feature <${ns.skos}notation> ?notation }
  OPTIONAL { ?feature <${ns.dc}description> ?description }
  OPTIONAL { ?feature <${ns.gn}countryCode> ?country }
}`;

async function fetchCatalogue(signal) {
  const response = await querySparql(catalogueQuery, 'application/sparql-results+json', signal);
  const data = await response.json();
  if (!Array.isArray(data.results?.bindings)) throw new Error('The registry service returned invalid results.');
  const records = new Map();
  for (const row of data.results.bindings) {
    if (row.feature?.type !== 'uri' || !row.feature.value.startsWith(registryIRI)) continue;
    const id = row.feature.value.slice(registryIRI.length);
    if (!validId(id)) continue;
    if (!records.has(id)) records.set(id, { id, label: [], title: [], notation: [], description: [], country: [] });
    const record = records.get(id);
    for (const key of ['label', 'title', 'notation', 'description', 'country']) if (row[key]?.type === 'literal') record[key].push(row[key]);
  }
  return [...records.values()].map(record => ({ id: record.id, name: preferred(record.label)?.value || preferred(record.title)?.value || preferred(record.notation)?.value || record.id, code: preferred(record.notation)?.value || record.id, country: preferred(record.country)?.value || '', search: normalize([record.id, ...['label', 'title', 'notation', 'description', 'country'].flatMap(key => record[key].map(term => term.value))].join(' ')) }));
}

function renderCatalogue() {
  const search = normalize(byId('search').value.trim());
  const results = catalogue.filter(record => record.search.includes(search)).sort((a, b) => (a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id)) * (byId('sort').value === 'desc' ? -1 : 1));
  byId('total-count').textContent = catalogue.length;
  byId('results-count').textContent = results.length + (results.length === 1 ? ' location' : ' locations') + (search ? ' of ' + catalogue.length : '');
  byId('locations').replaceChildren(...results.map((record, index) => {
    const item = element('li');
    const link = element('a', undefined, 'location-row');
    link.href = '?id=' + encodeURIComponent(record.id);
    const name = element('span', record.name, 'row-name');
    if (record.code !== record.name) name.append(element('span', ' ' + record.code, 'row-code'));
    const arrow = element('span', '→', 'row-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    const number = element('span', String(index + 1).padStart(2, '0'), 'row-index');
    number.setAttribute('aria-hidden', 'true');
    link.append(number, name, element('span', record.country || '—', 'row-country'), arrow);
    item.append(link);
    return item;
  }));
  byId('empty').hidden = results.length > 0;
  byId('empty-description').textContent = search ? 'Try another name, code or word from the description.' : 'No locations are currently published in the registry.';
  byId('clear-search').hidden = !search;
}

function recordQuery(iri) {
  // The SAP defines the document IRI as the Feature IRI followed by .ttl.
  return `CONSTRUCT { ?s ?p ?o } WHERE {
    { VALUES ?s { <${iri}> <${iri}.ttl> } ?s ?p ?o }
    UNION { <${iri}> <${ns.geo}hasGeometry> ?s . ?s ?p ?o }
    UNION { <${iri}.ttl> (<${ns.dcat}contactPoint>|<${ns.dc}publisher>) ?s . ?s ?p ?o }
  }`;
}

function parseRecord(text, iri) {
  if (typeof N3 === 'undefined') throw new Error('The RDF reader could not be loaded. Please reload the page.');
  const store = new N3.Store(new N3.Parser({ baseIRI: iri + '.ttl', format: 'text/turtle' }).parse(text));
  const resource = N3.DataFactory.namedNode(iri);
  if (!store.countQuads(resource, ns.rdf + 'type', N3.DataFactory.namedNode(ns.geo + 'Feature'), null)) throw new Error('The requested location was not found in the registry.');
  const values = (subject, predicate) => subject ? store.getObjects(subject, predicate, null) : [];
  const value = (subject, predicate) => preferred(values(subject, predicate));
  const title = value(resource, ns.rdfs + 'label') || value(resource, ns.dc + 'title');
  return { text, resource, metadata: N3.DataFactory.namedNode(iri + '.ttl'), values, value, title, name: title?.value || value(resource, ns.skos + 'notation')?.value || iri.slice(registryIRI.length) };
}

function field(container, label, content, language) {
  if (content === undefined || content === null || content === '') return;
  const wrapper = element('div', undefined, 'metadata-field');
  const dd = element('dd');
  if (typeof content === 'string') dd.textContent = content; else dd.append(content);
  if (language) dd.lang = language;
  wrapper.append(element('dt', label), dd);
  byId(container).append(wrapper);
}

function termContent(term) {
  if (!term || term.termType === 'BlankNode') return '';
  return term.termType === 'NamedNode' ? linked(term.value) : term.value;
}

function termsContent(terms) {
  const fragment = document.createDocumentFragment();
  for (const term of terms.filter(term => term.termType !== 'BlankNode')) {
    const node = term.termType === 'NamedNode' ? linked(term.value) : element('span', term.value);
    if (term.language) node.lang = term.language;
    fragment.append(node);
  }
  return fragment.childNodes.length ? fragment : '';
}

function dateContent(term) {
  if (!term) return '';
  const date = new Date(term.value);
  if (!Number.isFinite(date.getTime())) return term.value;
  const time = element('time', new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC');
  time.dateTime = term.value;
  time.title = term.value;
  return time;
}

function pointFromWKT(wkt) {
  // Follow the Location SAP's explicit longitude / latitude / ellipsoidal-height convention.
  const match = /^\s*<https?:\/\/www\.opengis\.net\/def\/crs\/EPSG\/0\/4979>\s*POINT\s+Z\s*\(\s*([^\s]+)\s+([^\s]+)\s+([^\s)]+)\s*\)\s*$/i.exec(wkt || '');
  if (!match) return null;
  const coordinates = match.slice(1).map(Number);
  return coordinates.every(Number.isFinite) && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90 ? coordinates : null;
}

function renderRecord(record) {
  const { resource, metadata, values, value, title, name } = record;
  currentIRI = resource.value;
  document.title = name + ' · CNR ISMAR';
  byId('record-title').textContent = name;
  byId('record-title').lang = title?.language || 'en';
  byId('crumb-current').textContent = name;
  byId('crumb-current').hidden = byId('crumb-divider').hidden = false;
  const description = value(resource, ns.dc + 'description');
  byId('description').textContent = description?.value || 'No description is provided in the registry.';
  byId('description').lang = description?.language || 'en';
  const code = value(resource, ns.skos + 'notation');
  const country = value(resource, ns.gn + 'countryCode');
  byId('record-tags').replaceChildren(...[code?.value, country ? 'Country · ' + country.value : ''].filter(Boolean).map(text => element('span', text, 'tag')));
  byId('keywords').replaceChildren(...values(resource, ns.dc + 'subject').filter(term => term.termType === 'Literal').map(term => { const node = element('span', term.value, 'tag'); node.lang = term.language || 'en'; return node; }));
  const imageLink = linked(value(resource, ns.foaf + 'depiction')?.value || '');
  const image = byId('location-image');
  byId('depiction').hidden = !imageLink.hasAttribute('href');
  image.onerror = () => { byId('depiction').hidden = true; };
  image.alt = name;
  if (imageLink.hasAttribute('href')) image.src = imageLink.href; else image.removeAttribute('src');
  byId('relations').replaceChildren();
  const relations = element('dl');
  byId('relations').append(relations);
  // Reuse only the links stated on the Feature; do not infer other geographic resources.
  for (const [label, predicate] of [['Spatial coverage / marine region', ns.dc + 'spatial'], ['Part of / research infrastructure', ns.dc + 'isPartOf']]) {
    const content = termsContent(values(resource, predicate));
    if (content) { const item = element('div', undefined, 'metadata-field'); const dd = element('dd'); dd.append(content); item.append(element('dt', label), dd); relations.append(item); }
  }
  byId('coordinates').replaceChildren();
  byId('geometry-fields').replaceChildren();
  const geometry = value(resource, ns.geo + 'hasGeometry');
  const wkt = value(geometry, ns.geo + 'asWKT');
  const point = pointFromWKT(wkt?.value);
  if (point) {
    const number = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 9 }).format(value);
    field('coordinates', 'Latitude', number(point[1]) + '°');
    field('coordinates', 'Longitude', number(point[0]) + '°');
    field('coordinates', 'Ellipsoidal height', number(point[2]) + ' m');
    byId('map-link').href = 'https://www.openstreetmap.org/?mlat=' + point[1] + '&mlon=' + point[0] + '#map=14/' + point[1] + '/' + point[0];
  }
  byId('map-link').hidden = !point;
  byId('coordinate-note').textContent = point ? 'WGS84 · EPSG:4979. Height is relative to the WGS84 ellipsoid, not sea level.' : 'Coordinates are not available in the expected EPSG:4979 POINT Z format. See the geometry below.';
  const accuracy = value(resource, ns.geo + 'hasMetricSpatialAccuracy');
  if (accuracy) field('coordinates', 'Vertical accuracy', (Number.isFinite(Number(accuracy.value)) ? String(Number(accuracy.value)) : accuracy.value) + ' m');
  field('geometry-fields', 'Location UUID', value(resource, ns.dc + 'identifier')?.value);
  field('geometry-fields', 'System identifier', code?.value);
  field('geometry-fields', 'Preferred name', termContent(value(resource, ns.skos + 'prefLabel')));
  field('geometry-fields', 'Geometry IRI', termContent(geometry));
  field('geometry-fields', 'Geometry UUID', value(geometry, ns.dc + 'identifier')?.value);
  field('geometry-fields', 'WKT geometry', wkt?.value);
  field('geometry-fields', 'GeoJSON geometry', value(geometry, ns.geo + 'asGeoJSON')?.value);
  field('geometry-fields', 'Geometry owner', termContent(value(geometry, ns.dc + 'isPartOf')));
  byId('resource-iri').textContent = resource.value;
  byId('resource-iri').href = resource.value;
  byId('copy-iri').textContent = 'Copy IRI';
  byId('copy-status').textContent = '';
  byId('metadata-fields').replaceChildren();
  const publisher = value(metadata, ns.dc + 'publisher');
  const publisherName = value(publisher, ns.foaf + 'name');
  const publisherIRI = value(publisher, ns.owl + 'sameAs');
  field('metadata-fields', 'Publisher', publisherIRI ? linked(publisherIRI.value, publisherName?.value) : publisherName?.value || termContent(publisher));
  field('metadata-fields', 'Document version', value(metadata, ns.dcat + 'version')?.value);
  field('metadata-fields', 'Document created', dateContent(value(metadata, ns.dc + 'created')));
  field('metadata-fields', 'Document last modified', dateContent(value(metadata, ns.dc + 'modified')));
  field('metadata-fields', 'Creator', termsContent(values(metadata, ns.dc + 'creator')));
  const contact = value(metadata, ns.dcat + 'contactPoint');
  field('metadata-fields', 'Contact', value(contact, ns.vc + 'fn')?.value);
  const email = value(contact, ns.vc + 'hasEmail');
  field('metadata-fields', 'Email', email ? linked(email.value, email.value.replace(/^mailto:/i, ''), true) : '');
  field('metadata-fields', 'Metadata licence', termsContent(values(metadata, ns.dc + 'license')));
  field('metadata-fields', 'Rights', termsContent(values(metadata, ns.dc + 'rights')));
  field('metadata-fields', 'Access rights', termsContent(values(metadata, ns.dc + 'accessRights')));
  field('metadata-fields', 'Application profile', termsContent(values(metadata, ns.dc + 'conformsTo')));
  field('metadata-fields', 'See also', termsContent(values(metadata, ns.rdfs + 'seeAlso')));
  field('metadata-fields', 'Metadata document', linked(metadata.value));
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = URL.createObjectURL(new Blob([record.text], { type: 'text/turtle;charset=utf-8' }));
  byId('download').href = downloadURL;
  byId('download').download = resource.value.slice(registryIRI.length) + '.ttl';
  byId('turtle').textContent = record.text;
}

async function loadPage(refresh = false, focus = false) {
  const sequence = ++loadSequence;
  activeRequest?.abort();
  activeRequest = new AbortController();
  const controller = activeRequest;
  const timeout = setTimeout(() => controller.abort(), 25000);
  const id = new URLSearchParams(location.search).get('id');
  byId('record').hidden = true;
  byId('catalogue').hidden = id !== null;
  byId('crumb-current').hidden = byId('crumb-divider').hidden = true;
  if (id === null) byId('registry-link').setAttribute('aria-current', 'page'); else byId('registry-link').removeAttribute('aria-current');
  byId('refresh').disabled = true;
  notice(id === null ? 'Loading the registry…' : 'Loading location…');
  try {
    if (id !== null) {
      if (!validId(id)) throw new Error('Invalid location identifier.');
      const iri = registryIRI + id;
      const response = await querySparql(recordQuery(iri), 'text/turtle', controller.signal);
      const text = await response.text();
      if (sequence !== loadSequence) return;
      renderRecord(parseRecord(text, iri));
      byId('record').hidden = false;
      for (const disclosure of document.querySelectorAll('details')) disclosure.open = false;
    } else {
      document.title = 'Locations · CNR ISMAR';
      if (refresh || !catalogue) catalogue = await fetchCatalogue(controller.signal);
      if (sequence !== loadSequence) return;
      renderCatalogue();
      byId('search').disabled = byId('sort').disabled = false;
    }
    notice('');
    if (focus) byId(id === null ? 'catalogue-title' : 'record-title').focus();
  } catch (error) {
    if (sequence !== loadSequence) return;
    notice(error.name === 'AbortError' ? 'The registry did not respond in time. Please try again.' : error instanceof TypeError ? 'Unable to connect to the registry. Check your connection and try again.' : error.message, true);
    if (id === null && !catalogue) byId('results-count').textContent = 'Registry unavailable';
  } finally {
    clearTimeout(timeout);
    if (sequence === loadSequence) byId('refresh').disabled = false;
  }
}

byId('search').addEventListener('input', renderCatalogue);
byId('sort').addEventListener('change', renderCatalogue);
byId('clear-search').addEventListener('click', () => { byId('search').value = ''; renderCatalogue(); byId('search').focus(); });
byId('refresh').addEventListener('click', () => loadPage(true));
byId('retry').addEventListener('click', () => loadPage(true));
byId('copy-iri').addEventListener('click', async () => {
  const iri = currentIRI;
  try { await navigator.clipboard.writeText(iri); if (iri === currentIRI) { byId('copy-iri').textContent = 'Copied'; byId('copy-status').textContent = 'IRI copied to clipboard.'; } }
  catch { byId('copy-status').textContent = 'Select and copy the persistent identifier above.'; byId('copy-iri').textContent = 'Select the IRI above'; }
});
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash || link.getAttribute('href')?.startsWith('#')) return;
  event.preventDefault();
  history.pushState(null, '', url.href);
  window.scrollTo(0, 0);
  loadPage(false, true);
});
window.addEventListener('popstate', () => loadPage(false, true));
loadPage();

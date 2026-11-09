'use strict';

const registryIRI = 'https://w3id.org/cnr-ismar/research-infrastructures-registry/';
const sparqlEndpoint = 'https://fuseki.ve.ismar.cnr.it/rireg/query';
const ns = { rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', lupo: 'https://kos.lifewatch.eu/ontologies/LUPO#', dc: 'http://purl.org/dc/terms/', foaf: 'http://xmlns.com/foaf/0.1/', dcat: 'http://www.w3.org/ns/dcat#', vc: 'http://www.w3.org/2006/vcard/ns#', owl: 'http://www.w3.org/2002/07/owl#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#' };
const byId = id => document.getElementById(id);
let downloadURL;
let currentIRI = '';
let loadSequence = 0;
const validId = id => typeof id === 'string' && id.length > 0 && !/[\u0000-\u0020<>"{}|^`\\/?#]/u.test(id);

function notice(message, error = false) {
  byId('status').textContent = message;
  byId('status').classList.toggle('error', error);
  byId('status').hidden = !message;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function safeURL(value, email = false) {
  try { const url = new URL(value); return ['https:', 'http:', ...(email ? ['mailto:'] : [])].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

function linked(value, label, email = false) {
  const url = safeURL(value, email);
  const node = element(url ? 'a' : 'span', label || value);
  if (url) node.href = url;
  return node;
}

function parseRecord(text, baseIRI) {
  const store = new N3.Store(new N3.Parser({ baseIRI, format: 'text/turtle' }).parse(text));
  const subjects = store.getSubjects(ns.rdf + 'type', N3.DataFactory.namedNode(ns.lupo + 'ResearchInfrastructure'), null);
  if (!subjects.length) throw new Error('The requested infrastructure was not found in the dataset.');
  if (subjects.length !== 1 || subjects[0].termType !== 'NamedNode') throw new Error('The document must describe exactly one infrastructure with an explicit IRI and type lupo:ResearchInfrastructure.');
  const resource = subjects[0];
  const values = (subject, predicate) => subject ? store.getObjects(subject, predicate, null) : [];
  const value = (subject, predicate) => values(subject, predicate)[0];
  const textTerm = terms => terms.find(term => term.termType === 'Literal' && term.language === 'en') || terms.find(term => term.termType === 'Literal');
  const title = textTerm(values(resource, ns.dc + 'title'));
  const description = textTerm(values(resource, ns.dc + 'description'));
  const alternatives = values(resource, ns.dc + 'alternative').filter(term => term.termType === 'Literal').sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
  // The established profile identifies the metadata document by RI IRI + .ttl.
  const metadata = N3.DataFactory.namedNode(resource.value + '.ttl');
  return { text, resource, metadata, values, value, title, description, alternatives, name: textTerm(alternatives)?.value || title?.value || resource.value };
}

async function querySparql(query, accept) {
  const url = new URL(sparqlEndpoint);
  url.searchParams.set('query', query);
  const response = await fetch(url, { headers: { Accept: accept }, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('The registry service is unavailable (HTTP ' + response.status + ').');
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes(accept)) throw new Error('The registry service returned an unexpected response format.');
  return response;
}

async function fetchRecord(id) {
  if (!validId(id)) throw new Error('Invalid infrastructure identifier.');
  const iri = registryIRI + id;
  // Retrieve the existing RI, metadata document, contact and publisher without creating new relationships.
  const query = `CONSTRUCT { ?s ?p ?o } WHERE {
    { VALUES ?s { <${iri}> <${iri}.ttl> } ?s ?p ?o }
    UNION { VALUES ?document { <${iri}.ttl> } ?document (<${ns.dcat}contactPoint>|<${ns.dc}publisher>) ?s . ?s ?p ?o }
  }`;
  const response = await querySparql(query, 'text/turtle');
  const text = await response.text();
  const record = parseRecord(text, iri + '.ttl');
  if (record.resource.value !== iri) throw new Error('The requested infrastructure was not found in the dataset.');
  return record;
}

function field(label, content, language) {
  if (!content || (typeof content === 'string' && !content.trim())) return;
  const wrapper = element('div', undefined, 'metadata-field');
  const dd = element('dd');
  if (typeof content === 'string') dd.textContent = content; else dd.append(content);
  if (language) dd.lang = language;
  wrapper.append(element('dt', label), dd);
  byId('metadata-fields').append(wrapper);
}

function termContent(term) {
  if (!term || term.termType === 'BlankNode') return '';
  return term.termType === 'NamedNode' ? linked(term.value) : term.value;
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

function renderRecord(record) {
  const { resource, metadata, value, values, title, description, alternatives, name } = record;
  currentIRI = resource.value;
  byId('catalogue').hidden = true;
  byId('record').hidden = false;
  document.title = name + ' · CNR ISMAR';
  byId('record-title').textContent = name;
  byId('record-title').lang = alternatives.find(term => term.value === name)?.language || title?.language || 'en';
  byId('full-title').textContent = title?.value || '';
  byId('full-title').lang = title?.language || 'en';
  byId('full-title').hidden = !title || title.value === name;
  byId('description').textContent = description?.value || 'No description is provided in the document.';
  byId('description').lang = description?.language || 'en';
  const domains = values(resource, ns.dc + 'subject').filter(term => term.termType === 'NamedNode');
  byId('scientific-domains').hidden = !domains.length;
  byId('scientific-domain-links').replaceChildren(...domains.map(term => { const item = element('li'); item.append(linked(term.value)); return item; }));
  byId('alternatives').replaceChildren(...alternatives.filter(term => term.value !== name && term.value !== title?.value).map(term => { const tag = element('span', term.value, 'tag'); tag.lang = term.language || 'en'; return tag; }));
  byId('crumb-current').textContent = name;
  byId('crumb-current').hidden = byId('crumb-divider').hidden = false;
  byId('registry-link').removeAttribute('aria-current');
  const logo = value(resource, ns.foaf + 'depiction');
  const logoURL = logo?.termType === 'NamedNode' ? safeURL(logo.value) : '';
  const image = byId('ri-logo');
  image.hidden = !logoURL;
  byId('logo-fallback').hidden = !!logoURL;
  image.onerror = () => { image.hidden = true; byId('logo-fallback').hidden = false; };
  image.alt = name + ' logo';
  if (logoURL) image.src = logoURL; else image.removeAttribute('src');
  const homepage = value(resource, ns.foaf + 'homepage');
  const homepageURL = homepage?.termType === 'NamedNode' ? safeURL(homepage.value) : '';
  byId('homepage').hidden = !homepageURL;
  if (homepageURL) byId('homepage').href = homepageURL; else byId('homepage').removeAttribute('href');
  byId('homepage-host').textContent = homepageURL ? new URL(homepageURL).hostname : 'No website is provided in the document.';
  // Keep a single anchor for the persistent identifier.
  const iriNode = byId('resource-iri');
  iriNode.textContent = resource.value;
  const iriURL = safeURL(resource.value);
  if (iriURL) iriNode.href = iriURL; else iriNode.removeAttribute('href');
  byId('metadata-fields').replaceChildren();
  const publisher = value(metadata, ns.dc + 'publisher');
  const publisherName = value(publisher, ns.foaf + 'name');
  const publisherIRI = value(publisher, ns.owl + 'sameAs');
  field('Publisher', publisherIRI?.termType === 'NamedNode' ? linked(publisherIRI.value, publisherName?.value) : publisherName?.value);
  field('Document version', value(metadata, ns.dcat + 'version')?.value);
  field('Document created', dateContent(value(metadata, ns.dc + 'created')));
  field('Document last modified', dateContent(value(metadata, ns.dc + 'modified')));
  field('Creator', termContent(value(metadata, ns.dc + 'creator')));
  const contact = value(metadata, ns.dcat + 'contactPoint');
  const contactName = value(contact, ns.vc + 'fn');
  const email = value(contact, ns.vc + 'hasEmail');
  const contactContent = document.createDocumentFragment();
  if (contactName) contactContent.append(document.createTextNode(contactName.value));
  if (email?.termType === 'NamedNode') contactContent.append(element('br'), linked(email.value, email.value.replace(/^mailto:/i, ''), true));
  if (contactContent.childNodes.length) field('Record contact', contactContent);
  const license = value(metadata, ns.dc + 'license');
  field('Document licence', license?.value === 'https://creativecommons.org/licenses/by/4.0/' ? linked(license.value, 'Creative Commons Attribution 4.0 · CC BY 4.0') : termContent(license));
  const access = value(metadata, ns.dc + 'accessRights');
  field('Document access', access?.value === 'http://publications.europa.eu/resource/authority/access-right/PUBLIC' ? linked(access.value, 'Public') : termContent(access));
  const rights = value(metadata, ns.dc + 'rights');
  field('Rights statement', rights?.value, rights?.language);
  field('Declared application profile', termContent(value(metadata, ns.dc + 'conformsTo')));
  values(metadata, ns.rdfs + 'seeAlso').forEach(term => field('Profile rules', termContent(term)));
  field('Document IRI', linked(metadata.value));
  byId('turtle').textContent = record.text;
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = URL.createObjectURL(new Blob([record.text], { type: 'text/turtle;charset=utf-8' }));
  byId('download').href = downloadURL;
  byId('download').download = resource.value.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_') + '.ttl';
  byId('record-origin').textContent = 'Description from the SPARQL registry';
  byId('metadata').open = byId('source').open = false;
  byId('copy-iri').textContent = 'Copy IRI';
  notice('');
}

async function showCatalogue() {
  const sequence = ++loadSequence;
  const query = `SELECT DISTINCT ?ri ?title ?alternative WHERE {
    ?ri a <${ns.lupo}ResearchInfrastructure> .
    FILTER(isIRI(?ri) && STRSTARTS(STR(?ri), "${registryIRI}"))
    OPTIONAL { ?ri <${ns.dc}title> ?title }
    OPTIONAL { ?ri <${ns.dc}alternative> ?alternative }
  } ORDER BY ?ri ?title ?alternative`;
  const response = await querySparql(query, 'application/sparql-results+json');
  const data = await response.json();
  if (sequence !== loadSequence) return;
  if (!Array.isArray(data.results?.bindings)) throw new Error('The registry service returned invalid query results.');
  const records = new Map();
  for (const row of data.results.bindings) {
    if (row.ri?.type !== 'uri' || !row.ri.value.startsWith(registryIRI)) throw new Error('The registry service returned an invalid infrastructure IRI.');
    const id = row.ri.value.slice(registryIRI.length);
    if (!validId(id)) throw new Error('The registry contains an unsupported infrastructure identifier.');
    if (!records.has(id)) records.set(id, { id, titles: [], alternatives: [] });
    const record = records.get(id);
    if (row.title?.type === 'literal') record.titles.push(row.title);
    if (row.alternative?.type === 'literal') record.alternatives.push(row.alternative);
  }
  const preferred = terms => terms.find(term => term['xml:lang'] === 'en') || terms[0];
  const cards = [...records.values()].map((record, index) => {
    const title = preferred(record.titles);
    const name = preferred(record.alternatives) || title;
    const card = element('a', undefined, 'card');
    card.href = '?id=' + encodeURIComponent(record.id);
    const arrow = element('span', '↗', 'card-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    const label = element('h2', name?.value || record.id);
    const subtitle = element('p', title?.value || '');
    label.lang = name?.['xml:lang'] || 'en';
    subtitle.lang = title?.['xml:lang'] || 'en';
    card.append(element('span', String(index + 1).padStart(2, '0'), 'card-index'), arrow, label, subtitle);
    return card;
  });
  byId('cards').replaceChildren(...cards);
  notice(cards.length ? '' : 'No research infrastructures are currently published in the registry.');
}

byId('copy-iri').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentIRI); byId('copy-iri').textContent = 'IRI copied ✓'; }
  catch { const range = document.createRange(); range.selectNodeContents(byId('resource-iri')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); notice('Identifier selected: press Ctrl+C or use the Copy command on your device.'); }
});

async function init() {
  try {
    if (typeof N3 === 'undefined') throw new Error('The Turtle reader is unavailable: check that assets/vendor/n3.min.js is present.');
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { byId('registry-link').setAttribute('aria-current', 'page'); await showCatalogue(); return; }
    byId('catalogue').hidden = true;
    if (!validId(id)) throw new Error('Invalid identifier. Return to the RI Registry to select an infrastructure.');
    const sequence = ++loadSequence;
    const record = await fetchRecord(id);
    if (sequence === loadSequence) renderRecord(record);
  } catch (error) { notice('Unable to load the registry. ' + error.message + ' Please try again or return to the RI Registry.', true); }
}

init();

'use strict';

// File names only: descriptions and metadata are always read from Turtle.
const infrastructureIds = ['danubius-ri', 'elter', 'embrc', 'emso', 'euro-argo', 'icos', 'jerico', 'lifewatch'];
const registryIRI = 'https://w3id.org/cnr-ismar/research-infrastructures-registry/';
const registryFilesURL = 'https://assets.ve.ismar.cnr.it/registry/research-infrastructures-registry/';
const ns = { rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', lupo: 'https://kos.lifewatch.eu/ontologies/LUPO#', dc: 'http://purl.org/dc/terms/', foaf: 'http://xmlns.com/foaf/0.1/', dcat: 'http://www.w3.org/ns/dcat#', vc: 'http://www.w3.org/2006/vcard/ns#', owl: 'http://www.w3.org/2002/07/owl#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#' };
const byId = id => document.getElementById(id);
let downloadURL;
let currentIRI = '';
let loadSequence = 0;

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
  if (subjects.length !== 1 || subjects[0].termType !== 'NamedNode') throw new Error('The document must describe exactly one infrastructure with an explicit IRI and type lupo:ResearchInfrastructure.');
  const resource = subjects[0];
  const values = (subject, predicate) => subject ? store.getObjects(subject, predicate, null) : [];
  const value = (subject, predicate) => values(subject, predicate)[0];
  const textTerm = terms => terms.find(term => term.termType === 'Literal' && term.language === 'en') || terms.find(term => term.termType === 'Literal');
  const title = textTerm(values(resource, ns.dc + 'title'));
  const description = textTerm(values(resource, ns.dc + 'description'));
  const alternatives = values(resource, ns.dc + 'alternative').filter(term => term.termType === 'Literal');
  // The established profile identifies the metadata document by RI IRI + .ttl.
  const metadata = N3.DataFactory.namedNode(resource.value + '.ttl');
  return { text, resource, metadata, values, value, title, description, alternatives, name: textTerm(alternatives)?.value || title?.value || resource.value };
}

async function fetchRecord(id) {
  const response = await fetch(registryFilesURL + encodeURIComponent(id) + '.ttl', { headers: { Accept: 'text/turtle' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Document unavailable (HTTP ' + response.status + ').');
  return parseRecord(await response.text(), registryIRI + encodeURIComponent(id) + '.ttl');
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

function renderRecord(record, local = false) {
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
  // Keep a single anchor, including when an imported IRI uses an unsupported scheme.
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
  byId('record-origin').textContent = local ? 'Local file preview' : 'Description from the registry';
  byId('metadata').open = byId('source').open = false;
  byId('copy-iri').textContent = 'Copy IRI';
  notice('');
}

async function showCatalogue() {
  if (location.protocol === 'file:') { notice('To preview a description from this folder, select a Turtle file using “Open a local Turtle file”. Infrastructure pages load automatically on the website.'); return; }
  const sequence = ++loadSequence;
  const results = await Promise.allSettled(infrastructureIds.map(fetchRecord));
  if (sequence !== loadSequence) return;
  results.forEach((result, index) => {
    const id = infrastructureIds[index];
    const card = element('a', undefined, 'card');
    card.href = '?id=' + encodeURIComponent(id);
    const arrow = element('span', '↗', 'card-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    const label = element('h2', result.status === 'fulfilled' ? result.value.name : id);
    const subtitle = element('p', result.status === 'fulfilled' ? result.value.title?.value : 'Description temporarily unavailable');
    label.lang = subtitle.lang = 'en';
    card.append(element('span', String(index + 1).padStart(2, '0'), 'card-index'), arrow, label, subtitle);
    byId('cards').append(card);
  });
  const failed = results.filter(result => result.status === 'rejected').length;
  notice(failed ? failed + ' description(s) are unavailable. Open an infrastructure page to try again.' : '');
}

byId('copy-iri').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentIRI); byId('copy-iri').textContent = 'IRI copied ✓'; }
  catch { const range = document.createRange(); range.selectNodeContents(byId('resource-iri')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); notice('Identifier selected: press Ctrl+C or use the Copy command on your device.'); }
});

byId('local-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const sequence = ++loadSequence;
  try {
    const text = await file.text();
    const record = parseRecord(text, registryIRI + encodeURIComponent(file.name));
    if (sequence !== loadSequence) return;
    renderRecord(record, true);
    // A local preview must not retain a misleading shareable registry query.
    if (location.protocol !== 'file:') history.replaceState(null, '', location.pathname);
    byId('contenuto').focus();
  } catch (error) { if (sequence === loadSequence) notice('Unable to open the file. ' + error.message, true); }
  event.target.value = '';
});

async function init() {
  try {
    if (typeof N3 === 'undefined') throw new Error('The Turtle reader is unavailable: check that assets/vendor/n3.min.js is present.');
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { byId('registry-link').setAttribute('aria-current', 'page'); await showCatalogue(); return; }
    byId('catalogue').hidden = true;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) throw new Error('Invalid identifier. Return to the RI Registry to select an infrastructure.');
    if (location.protocol === 'file:') { notice('To view an infrastructure page when opening this HTML file directly, select the corresponding Turtle file below.'); return; }
    const sequence = ++loadSequence;
    const record = await fetchRecord(id);
    if (sequence === loadSequence) renderRecord(record);
  } catch (error) { notice('Unable to load the description. ' + error.message + ' You can open a local Turtle file or return to the RI Registry.', true); }
}

init();

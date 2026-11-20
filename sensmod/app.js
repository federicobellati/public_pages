'use strict';

const settings = window.SENSOR_MODELS_REGISTRY, labels = window.RegistryLabels;
const ns = { schema: 'http://schema.org/', sosa: 'http://www.w3.org/ns/sosa/', dc: 'http://purl.org/dc/terms/', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', skos: 'http://www.w3.org/2004/02/skos/core#', foaf: 'http://xmlns.com/foaf/0.1/', owl: 'http://www.w3.org/2002/07/owl#', dcat: 'http://www.w3.org/ns/dcat#', prov: 'http://www.w3.org/ns/prov#', adms: 'http://www.w3.org/ns/adms#' };
const byId = id => document.getElementById(id), normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en');
const preferred = terms => terms.find(t => (t.language || t['xml:lang'] || '').toLowerCase() === 'en') || terms.find(t => /^en-/i.test(t.language || t['xml:lang'] || '')) || terms.find(t => !t.language && !t['xml:lang']) || terms[0];
const human = name => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const predicateTitle = iri => { const namespace = Object.values(ns).concat('https://schema.org/').find(prefix => iri.startsWith(prefix)); return namespace ? human(iri.slice(namespace.length)) : linked(iri); };
const safeIRI = iri => { try { return !/[<>"{}|^`\\\u0000-\u0020]/.test(iri) && ['https:', 'http:'].includes(new URL(iri).protocol); } catch { return false; } };
let catalogue = null, page = 1, sequence = 0, request, currentIRI = '', downloadURL;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notice(message, error = false) {
  byId('notice').hidden = !message; byId('status').textContent = message;
  byId('notice').classList.toggle('error', error); byId('retry').hidden = !error;
  byId('error-back').hidden = !error || !location.search;
}
function linked(iri, title) {
  if (!safeIRI(iri) && !/^mailto:[^\s<>]+$/i.test(iri)) return element('span', title || iri);
  const link = title ? element('a', title) : labels.link(iri); link.href = iri; link.title = iri;
  return link;
}
function route(iri) {
  const id = iri.startsWith(settings.registryIRI) ? iri.slice(settings.registryIRI.length) : '';
  return id && !/[/?#]/.test(id) ? '?id=' + encodeURIComponent(id) : '?iri=' + encodeURIComponent(iri);
}
async function querySparql(query, accept, signal) {
  const url = new URL(settings.endpoint); url.searchParams.set('query', query);
  const response = await fetch(url, { headers: { Accept: accept }, credentials: 'omit', cache: 'no-store', signal });
  if (!response.ok) throw new Error('The registry service is unavailable (HTTP ' + response.status + ').');
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes(accept)) throw new Error('The registry returned an unexpected response format.');
  return response;
}
const schemaPath = property => `(<http://schema.org/${property}>|<https://schema.org/${property}>)`;
const graphUnion = pattern => `{ ${pattern} } UNION { GRAPH ?graph { ${pattern} } }`;
const cataloguePattern = `VALUES ?modelClass { <http://schema.org/ProductModel> <https://schema.org/ProductModel> }
  ?model a ?modelClass . FILTER(isIRI(?model))
  OPTIONAL { ?model <${ns.dc}title> ?title }
  OPTIONAL { ?model <${ns.rdfs}label> ?label }
  OPTIONAL { ?model ${schemaPath('model')} ?code }
  OPTIONAL { ?model (<${ns.rdfs}comment>|<${ns.dc}description>|<http://schema.org/description>|<https://schema.org/description>) ?description }
  OPTIONAL { ?model ${schemaPath('manufacturer')} ?manufacturer . OPTIONAL { ?manufacturer (<${ns.rdfs}label>|<http://schema.org/name>|<https://schema.org/name>|<${ns.foaf}name>) ?manufacturerName } }`;
const catalogueQuery = `SELECT DISTINCT ?model ?title ?label ?code ?description ?manufacturer ?manufacturerName WHERE { ${graphUnion(cataloguePattern)} }`;

async function fetchCatalogue(signal) {
  const response = await querySparql(catalogueQuery, 'application/sparql-results+json', signal), data = await response.json();
  if (!Array.isArray(data.results?.bindings)) throw new Error('The registry returned invalid results.');
  const records = new Map(), keys = ['title', 'label', 'code', 'description'];
  for (const row of data.results.bindings) {
    if (row.model?.type !== 'uri' || !safeIRI(row.model.value)) continue;
    const iri = row.model.value;
    if (!records.has(iri)) records.set(iri, { iri, manufacturers: new Set(), ...Object.fromEntries(keys.map(k => [k, []])) });
    const record = records.get(iri);
    for (const key of keys) if (row[key]?.type === 'literal') record[key].push(row[key]);
    if (row.manufacturerName) record.manufacturers.add(row.manufacturerName.value);
    else if (row.manufacturer && row.manufacturer.type !== 'bnode') record.manufacturers.add(row.manufacturer.value);
  }
  return [...records.values()].map(record => ({ iri: record.iri, name: preferred(record.title)?.value || preferred(record.label)?.value || preferred(record.code)?.value || record.iri, language: preferred(record.title)?.['xml:lang'] || preferred(record.label)?.['xml:lang'] || '', code: preferred(record.code)?.value || '', manufacturers: [...record.manufacturers], search: normalize([record.iri, ...keys.flatMap(k => record[k].map(t => t.value)), ...record.manufacturers].join(' ')) }));
}
function renderManufacturers() {
  const selected = byId('manufacturer-filter').value, all = element('option', 'All manufacturers'); all.value = '';
  const manufacturers = [...new Set(catalogue.flatMap(r => r.manufacturers))].sort((a, b) => a.localeCompare(b, 'en'));
  byId('manufacturer-filter').replaceChildren(all, ...manufacturers.map(name => { const option = element('option', name); option.value = name; return option; }));
  byId('manufacturer-filter').value = manufacturers.includes(selected) ? selected : '';
}
function renderCatalogue(resetPage = false) {
  if (!catalogue) return;
  if (resetPage) page = 1;
  const search = normalize(byId('search').value.trim()), manufacturer = byId('manufacturer-filter').value;
  const results = catalogue.filter(r => r.search.includes(search) && (!manufacturer || r.manufacturers.includes(manufacturer))).sort((a, b) => (a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) || a.iri.localeCompare(b.iri)) * (byId('sort').value === 'desc' ? -1 : 1));
  const size = settings.pageSize, pages = Math.max(1, Math.ceil(results.length / size)); page = Math.min(page, pages);
  byId('total-count').textContent = catalogue.length.toLocaleString('en');
  byId('results-count').textContent = results.length.toLocaleString('en') + (results.length === 1 ? ' model' : ' models') + (search || manufacturer ? ' of ' + catalogue.length.toLocaleString('en') : '');
  byId('models').replaceChildren(...results.slice((page - 1) * size, page * size).map((record, i) => {
    const item = element('li'), link = element('a', undefined, 'facility-row'); link.href = route(record.iri);
    const index = element('span', String((page - 1) * size + i + 1).padStart(2, '0'), 'row-index'); index.setAttribute('aria-hidden', 'true');
    const name = element('span', record.name, 'row-name'); if (record.language) name.lang = record.language;
    if (record.code && record.code !== record.name) name.append(element('span', record.code, 'row-code'));
    link.append(index, name, element('span', record.manufacturers.join(' · ') || 'Not specified', 'row-type'));
    item.append(link); return item;
  }));
  byId('empty').hidden = results.length > 0; byId('clear-search').hidden = !search && !manufacturer;
  byId('empty-description').textContent = search || manufacturer ? 'Try another name, manufacturer or description.' : 'No sensor models are currently published in the registry.';
  byId('pagination').hidden = pages < 2; byId('previous').disabled = page === 1; byId('next').disabled = page === pages;
  byId('page-status').textContent = 'Page ' + page + ' of ' + pages;
}
function recordQuery(iri) {
  const paths = ['hasSubSystem', 'hasProperty'].map(p => `<${ns.sosa + p}>`).concat(`^<${ns.sosa}isSubSystemOf>`, ...['additionalProperty', 'width', 'height', 'depth', 'weight', 'manufacturer', 'value'].flatMap(p => [`<http://schema.org/${p}>`, `<https://schema.org/${p}>`]), `<${ns.dc}publisher>`, `<${ns.dcat}contactPoint>`, `<${ns.prov}qualifiedAttribution>`, `<${ns.prov}agent>`, `<${ns.adms}identifier>`, `<${ns.rdf}first>`, `<${ns.rdf}rest>`);
  const pattern = `VALUES ?root { <${iri}> <${iri}.ttl> } ?root (${paths.join('|')})* ?s . ?s ?p ?o . OPTIONAL { ?o ?lp ?label . VALUES ?lp { <${ns.skos}prefLabel> <${ns.rdfs}label> <http://schema.org/name> <https://schema.org/name> <${ns.foaf}name> } FILTER(isLiteral(?label)) }`;
  return `CONSTRUCT { ?s ?p ?o . ?o ?lp ?label } WHERE { ${graphUnion(pattern)} }`;
}
function field(container, label, content) {
  if (content === undefined || content === null || content === '' || (content.nodeType === 11 && !content.childNodes.length)) return;
  const wrapper = element('div', undefined, 'metadata-field'), dt = element('dt'), dd = element('dd');
  if (typeof label === 'string') dt.textContent = label; else dt.append(label);
  if (typeof content === 'string') dd.textContent = content; else dd.append(content);
  wrapper.append(dt, dd); (typeof container === 'string' ? byId(container) : container).append(wrapper);
}
function accessors(store) {
  const values = (subject, predicate) => {
    if (!subject) return [];
    const predicates = predicate.startsWith(ns.schema) ? [predicate, predicate.replace(ns.schema, 'https://schema.org/')] : [predicate];
    const terms = predicates.flatMap(p => store.getObjects(subject, p, null));
    return terms.filter((t, i) => terms.findIndex(other => other.equals(t)) === i);
  };
  return { values, value: (s, p) => preferred(values(s, p)) };
}
function renderRecord(text, iri) {
  if (typeof N3 === 'undefined') throw new Error('The RDF reader could not be loaded. Please reload the page.');
  const store = new N3.Store(new N3.Parser({ baseIRI: iri, format: 'text/turtle' }).parse(text));
  const { values, value } = accessors(store), resource = N3.DataFactory.namedNode(iri);
  if (!values(resource, ns.rdf + 'type').some(t => [ns.schema + 'ProductModel', 'https://schema.org/ProductModel'].includes(t.value))) throw new Error('The requested sensor model was not found in the registry.');
  labels.remember(store); currentIRI = iri;
  const nameTerm = value(resource, ns.dc + 'title') || value(resource, ns.rdfs + 'label') || value(resource, ns.schema + 'model'), name = nameTerm?.value || iri;
  function termContent(term, seen = new Set()) {
    if (term.termType === 'Literal') { const node = element('span', term.value); if (term.language) node.lang = term.language; return node; }
    if (seen.has(term.id)) return element('span', 'See linked record');
    if (term.termType !== 'Literal' && (values(term, ns.schema + 'value').length || values(term, ns.schema + 'minValue').length || values(term, ns.schema + 'maxValue').length)) return quantity(term, seen);
    if (term.termType === 'NamedNode') {
      const label = value(term, ns.foaf + 'name') || value(term, ns.schema + 'name');
      return linked(term.value, label?.value);
    }
    return structured(term, seen);
  }
  function contents(terms, seen = new Set()) {
    const fragment = document.createDocumentFragment(); terms.forEach(term => fragment.append(termContent(term, seen))); return fragment;
  }
  function structured(subject, seen = new Set()) {
    if (seen.has(subject.id)) return element('span', 'See linked record');
    const visited = new Set(seen).add(subject.id), list = element('dl', undefined, 'nested-fields');
    for (const predicate of store.getPredicates(subject, null, null)) {
      if (predicate.value === ns.rdf + 'type') continue;
      field(list, predicateTitle(predicate.value), contents(store.getObjects(subject, predicate, null), visited));
    }
    return list.childNodes.length ? list : element('span', subject.termType === 'NamedNode' ? subject.value : 'No further description provided');
  }
  function quantity(subject, seen = new Set()) {
    const wrapper = element('span', undefined, 'quantity'), terms = values(subject, ns.schema + 'value'), min = value(subject, ns.schema + 'minValue'), max = value(subject, ns.schema + 'maxValue');
    if (terms.length) wrapper.append(contents(terms, new Set(seen).add(subject.id)));
    if (min || max) wrapper.append(element('span', (min?.value ?? '…') + ' to ' + (max?.value ?? '…')));
    const units = [...values(subject, ns.schema + 'unitText'), ...values(subject, ns.schema + 'unitCode')];
    if (units.length) { wrapper.append(document.createTextNode(' ')); wrapper.append(contents(units)); }
    if (!terms.length && !min && !max) return structured(subject);
    return wrapper;
  }
  function properties(container, subject, predicate) {
    const props = values(subject, predicate).sort((a, b) => (value(a, ns.schema + 'name')?.value || '').localeCompare(value(b, ns.schema + 'name')?.value || ''));
    for (const prop of props) {
      const title = value(prop, ns.rdfs + 'label') || value(prop, ns.schema + 'name'), id = value(prop, ns.schema + 'propertyID');
      const label = title ? (title.termType === 'NamedNode' ? termContent(title) : human(title.value)) : id ? termContent(id) : 'Property';
      const body = element('div'); body.append(quantity(prop));
      if (id) { const reference = element('div', undefined, 'property-reference'); reference.append(termContent(id)); body.append(reference); }
      const handled = ['name', 'propertyID', 'value', 'minValue', 'maxValue', 'unitCode', 'unitText'].flatMap(p => [ns.schema + p, 'https://schema.org/' + p]).concat(ns.rdf + 'type', ns.rdfs + 'label');
      const extra = element('dl', undefined, 'nested-fields');
      for (const p of store.getPredicates(prop, null, null)) if (!handled.includes(p.value)) field(extra, predicateTitle(p.value), contents(store.getObjects(prop, p, null)));
      if (extra.childNodes.length) body.append(extra);
      field(container, label, body);
    }
  }
  function remaining(container, subject, handled) {
    const excluded = new Set(handled.flatMap(p => p.startsWith(ns.schema) ? [p, p.replace(ns.schema, 'https://schema.org/')] : [p]));
    for (const predicate of store.getPredicates(subject, null, null)) if (!excluded.has(predicate.value)) field(container, predicateTitle(predicate.value), contents(store.getObjects(subject, predicate, null)));
  }
  const modelId = iri.startsWith(settings.registryIRI) ? iri.slice(settings.registryIRI.length) : '';
  byId('edit').hidden = !/^[A-Za-z][A-Za-z0-9_-]*$/.test(modelId);
  if (!byId('edit').hidden) { const url = new URL(settings.editURL); url.searchParams.set('id', modelId); byId('edit').href = url.href; }
  document.title = name + ' · CNR ISMAR'; byId('record-title').textContent = name; byId('record-title').lang = nameTerm?.language || '';
  byId('crumb-current').textContent = name; byId('crumb-current').hidden = byId('crumb-divider').hidden = false;
  const manufacturers = values(resource, ns.schema + 'manufacturer'), categories = values(resource, ns.schema + 'category');
  byId('record-tags').replaceChildren(...manufacturers.map(term => { const tag = element('span', undefined, 'tag'); tag.append(termContent(term)); return tag; }));
  const descriptions = [...values(resource, ns.rdfs + 'comment'), ...values(resource, ns.dc + 'description'), ...values(resource, ns.schema + 'description')];
  byId('description').replaceChildren(...(descriptions.length ? descriptions.map(term => { const p = element('p', term.value); if (term.language) p.lang = term.language; return p; }) : [element('p', 'No description is provided in the registry.')]));
  const image = [...values(resource, ns.schema + 'image'), ...values(resource, ns.foaf + 'depiction')].find(term => safeIRI(term.value));
  byId('depiction').hidden = !image; byId('model-image').alt = name; byId('model-image').onerror = () => { byId('depiction').hidden = true; };
  if (image) byId('model-image').src = image.value; else byId('model-image').removeAttribute('src');
  for (const id of ['references', 'model-fields', 'technical-fields', 'additional-fields', 'components', 'metadata-documents']) byId(id).replaceChildren();
  field('references', 'Product website', contents(values(resource, ns.schema + 'url')));
  field('references', 'Documentation', contents(values(resource, ns.dc + 'references')));
  field('model-fields', 'Model', contents(values(resource, ns.schema + 'model')));
  field('model-fields', 'Manufacturer', manufacturers.length ? contents(manufacturers) : 'Not specified');
  field('model-fields', 'Category', contents(categories));
  field('model-fields', 'Manufacturer part number', contents(values(resource, ns.schema + 'mpn')));
  field('model-fields', 'Identifier', contents(values(resource, ns.dc + 'identifier')));
  for (const p of ['material', 'width', 'height', 'depth', 'weight']) field('technical-fields', human(p), contents(values(resource, ns.schema + p)));
  properties('technical-fields', resource, ns.schema + 'additionalProperty'); properties('technical-fields', resource, ns.sosa + 'hasProperty');
  byId('specifications').hidden = !byId('technical-fields').childNodes.length;
  const components = [], visited = new Set([resource.id]);
  function collect(parent) {
    const children = [...values(parent, ns.sosa + 'hasSubSystem'), ...store.getSubjects(ns.sosa + 'isSubSystemOf', parent, null)];
    for (const child of children) if (!visited.has(child.id)) { visited.add(child.id); components.push(child); collect(child); }
  }
  collect(resource);
  components.sort((a, b) => (value(a, ns.rdfs + 'label')?.value || a.value).localeCompare(value(b, ns.rdfs + 'label')?.value || b.value, 'en', { numeric: true }));
  byId('component-count').textContent = components.length + (components.length === 1 ? ' component' : ' components');
  byId('no-components').hidden = components.length > 0;
  field('model-fields', 'Measurement components', String(components.length));
  components.forEach((component, index) => {
    const card = element('details', undefined, 'component-card'), summary = element('summary'), heading = element('span'), title = value(component, ns.rdfs + 'label') || value(component, ns.dc + 'title'), code = value(component, ns.dc + 'identifier');
    const titleNode = element('span', title?.value || code?.value || component.value, 'component-title'); if (title?.language) titleNode.lang = title.language;
    heading.append(titleNode); if (code && code.value !== title?.value) heading.append(element('span', code.value, 'component-code'));
    const plus = element('span', '+', 'plus'); plus.setAttribute('aria-hidden', 'true'); summary.append(heading, plus); card.append(summary);
    const body = element('div', undefined, 'component-body'), dl = element('dl', undefined, 'metadata-fields');
    field(dl, 'Observed properties', contents(values(component, ns.sosa + 'observes')));
    field(dl, 'Measurement unit', contents([...values(component, ns.schema + 'unitCode'), ...values(component, ns.schema + 'unitText')]));
    field(dl, 'Description', contents([...values(component, ns.rdfs + 'comment'), ...values(component, ns.dc + 'description'), ...values(component, ns.schema + 'description')]));
    properties(dl, component, ns.sosa + 'hasProperty'); properties(dl, component, ns.schema + 'additionalProperty');
    remaining(dl, component, [ns.rdf + 'type', ns.rdfs + 'label', ns.dc + 'title', ns.dc + 'identifier', ns.sosa + 'observes', ns.schema + 'unitCode', ns.schema + 'unitText', ns.rdfs + 'comment', ns.dc + 'description', ns.schema + 'description', ns.sosa + 'hasProperty', ns.schema + 'additionalProperty']);
    if (component.termType === 'NamedNode') field(dl, 'Component IRI', linked(component.value, component.value));
    body.append(dl); card.append(body); if (components.length === 1) card.open = true; byId('components').append(card);
  });
  remaining('additional-fields', resource, [ns.rdf + 'type', ns.dc + 'title', ns.rdfs + 'label', ns.rdfs + 'comment', ns.dc + 'description', ns.schema + 'description', ns.schema + 'model', ns.schema + 'manufacturer', ns.schema + 'category', ns.schema + 'mpn', ns.dc + 'identifier', ns.schema + 'image', ns.foaf + 'depiction', ns.schema + 'url', ns.dc + 'references', ns.sosa + 'hasSubSystem', ns.sosa + 'hasProperty', ns.schema + 'additionalProperty', ...['material', 'width', 'height', 'depth', 'weight'].map(p => ns.schema + p)]);
  byId('additional').hidden = !byId('additional-fields').childNodes.length;
  const metadata = N3.DataFactory.namedNode(iri + '.ttl');
  if (store.countQuads(metadata, null, null, null)) { const dl = element('dl', undefined, 'metadata-fields'); remaining(dl, metadata, [ns.rdf + 'type']); field(dl, 'Metadata document', linked(metadata.value, metadata.value)); byId('metadata-documents').append(dl); }
  else byId('metadata-documents').append(element('p', 'No metadata document is described in this record.', 'muted'));
  byId('resource-iri').textContent = iri; byId('resource-iri').href = iri; byId('copy-iri').textContent = 'Copy IRI'; byId('copy-status').textContent = '';
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = URL.createObjectURL(new Blob([text], { type: 'text/turtle;charset=utf-8' }));
  byId('download').href = downloadURL; byId('download').download = (modelId || 'sensor-model').replace(/[^\p{L}\p{N}_.-]/gu, '_') + '.ttl'; byId('turtle').textContent = text;
}
async function loadPage(refresh = false, focus = false) {
  const version = ++sequence; request?.abort(); request = new AbortController();
  const controller = request, timeout = setTimeout(() => controller.abort(), 30000), params = new URLSearchParams(location.search), detail = params.has('id') || params.has('iri');
  byId('record').hidden = true; byId('catalogue').hidden = detail; byId('crumb-current').hidden = byId('crumb-divider').hidden = true;
  if (detail) byId('registry-link').removeAttribute('aria-current'); else byId('registry-link').setAttribute('aria-current', 'page');
  byId('refresh').disabled = true; notice(detail ? 'Loading sensor model…' : 'Loading the registry…');
  labels.begin(); if (refresh) labels.clear();
  try {
    if (detail) {
      if (params.getAll('id').length + params.getAll('iri').length !== 1) throw new Error('Provide a single model identifier.');
      const id = params.get('id');
      if (id !== null && (!id || /[/?#]/.test(id))) throw new Error('Invalid model identifier.');
      const iri = id !== null ? settings.registryIRI + id : params.get('iri');
      if (!safeIRI(iri)) throw new Error('Invalid model IRI.');
      const response = await querySparql(recordQuery(iri), 'text/turtle', controller.signal), text = await response.text();
      if (version !== sequence) return;
      for (const details of document.querySelectorAll('details')) details.open = false;
      renderRecord(text, iri); byId('record').hidden = false;
    } else {
      document.title = 'Sensor models · CNR ISMAR';
      if (!catalogue || refresh) catalogue = await fetchCatalogue(controller.signal);
      if (version !== sequence) return;
      renderManufacturers(); renderCatalogue(); byId('search').disabled = byId('manufacturer-filter').disabled = byId('sort').disabled = false;
    }
    notice(''); if (focus) byId(detail ? 'record-title' : 'catalogue-title').focus();
  } catch (error) {
    if (version !== sequence) return;
    notice(error.name === 'AbortError' ? 'The registry did not respond in time. Please try again.' : error instanceof TypeError ? 'Unable to connect to the registry. Check your connection and try again.' : error.message, true);
    if (!detail && !catalogue) byId('results-count').textContent = 'Registry unavailable';
  } finally { clearTimeout(timeout); if (version === sequence) byId('refresh').disabled = false; }
}
for (const id of ['search', 'manufacturer-filter', 'sort']) byId(id).addEventListener(id === 'search' ? 'input' : 'change', () => renderCatalogue(true));
byId('clear-search').addEventListener('click', () => { byId('search').value = byId('manufacturer-filter').value = ''; renderCatalogue(true); byId('search').focus(); });
for (const id of ['refresh', 'retry']) byId(id).addEventListener('click', () => loadPage(true));
for (const [id, step] of [['previous', -1], ['next', 1]]) byId(id).addEventListener('click', () => { page += step; renderCatalogue(); byId('catalogue-title').focus(); byId('catalogue').scrollIntoView(); });
byId('copy-iri').addEventListener('click', async () => { const iri = currentIRI; try { await navigator.clipboard.writeText(iri); if (iri === currentIRI) { byId('copy-iri').textContent = 'Copied'; byId('copy-status').textContent = 'IRI copied to clipboard.'; } } catch { byId('copy-status').textContent = 'Select and copy the persistent identifier above.'; } });
document.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash || link.getAttribute('href')?.startsWith('#')) return;
  event.preventDefault(); history.pushState(null, '', url.href); window.scrollTo(0, 0); loadPage(false, true);
});
window.addEventListener('popstate', () => loadPage(false, true));
for (const link of document.querySelectorAll('.brand, .breadcrumbs > a:first-child')) link.href = settings.portalURL;
byId('som-link').href = settings.somURL;
loadPage();

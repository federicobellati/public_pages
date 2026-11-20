'use strict';

/* No term catalogue: resolve the actual IRIs found in each record, independently of provider. */
window.RegistryLabels = (() => {
  const predicates = ['http://www.w3.org/2004/02/skos/core#prefLabel', 'http://www.w3.org/2000/01/rdf-schema#label', 'http://schema.org/name', 'https://schema.org/name', 'http://purl.org/dc/terms/title', 'http://purl.org/dc/elements/1.1/title'];
  const known = new Map(), documents = new Map(), queue = [];
  let running = 0;
  const key = iri => { try { const url = new URL(iri); if (url.protocol === 'http:') url.protocol = 'https:'; if (/^(rdf|xml|ttl|turtle|jsonld|json-ld)$/i.test(url.searchParams.get('format') || '')) url.searchParams.delete('format'); return url.href; } catch { return iri; } };
  const preferred = terms => terms.find(t => (t.language || '').toLowerCase() === document.documentElement.lang.toLowerCase()) || terms.find(t => (t.language || '').toLowerCase().startsWith('en')) || terms.find(t => !t.language) || terms[0];
  function remember(store) {
    for (const predicate of predicates) for (const q of store.getQuads(null, predicate, null, null)) {
      if (q.subject.termType !== 'NamedNode' || q.object.termType !== 'Literal') continue;
      const id = key(q.subject.value), list = known.get(id) || [];
      list.push({ value: q.object.value, language: q.object.language, rank: predicates.indexOf(predicate) }); known.set(id, list);
    }
  }
  function current(iri) {
    const list = known.get(key(iri));
    if (!list?.length) return null;
    const rank = Math.min(...list.map(t => t.rank));
    return preferred(list.filter(t => t.rank === rank));
  }
  function add(iri, predicate, value, language = '') {
    if (!iri || !value || !predicates.includes(predicate)) return;
    const id = key(iri), list = known.get(id) || [];
    list.push({ value, language, rank: predicates.indexOf(predicate) }); known.set(id, list);
  }
  function parseXML(text, base) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid RDF/XML');
    const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', xmlNS = 'http://www.w3.org/XML/1998/namespace';
    for (const node of xml.getElementsByTagName('*')) {
      const predicate = node.namespaceURI + node.localName;
      if (!predicates.includes(predicate)) continue;
      let subject = node.parentElement, language = node.getAttributeNS(xmlNS, 'lang');
      if (language === null) { let ancestor = node.parentElement; while (ancestor && language === null) { language = ancestor.getAttributeNS(xmlNS, 'lang'); ancestor = ancestor.parentElement; } }
      const about = subject?.getAttributeNS(rdf, 'about'), id = subject?.getAttributeNS(rdf, 'ID');
      if (about === null && id === null) continue;
      const bases = []; for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) { const b = ancestor.getAttributeNS(xmlNS, 'base'); if (b) bases.unshift(b); }
      let resolved = base; for (const b of bases) resolved = new URL(b, resolved).href;
      add(new URL(about ?? '#' + id, resolved).href, predicate, node.textContent.trim(), language || '');
    }
  }
  async function parseJSON(text, base, signal) {
    const quads = await jsonld.toRDF(JSON.parse(text), { base, format: 'application/n-quads', documentLoader: async iri => {
      const url = new URL(iri); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported context URL'); url.protocol = 'https:';
      const response = await fetch(url, { headers: { Accept: 'application/ld+json, application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', signal });
      if (!response.ok) throw new Error('Context unavailable');
      const context = await response.text(); if (context.length > 5_000_000) throw new Error('Context too large');
      return { contextUrl: null, documentUrl: response.url, document: JSON.parse(context) };
    } });
    remember(new N3.Store(new N3.Parser({ format: 'N-Quads' }).parse(quads)));
  }
  async function retrieve(url) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { headers: { Accept: 'text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8, application/n-triples;q=0.7' }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) return;
      const type = (response.headers.get('Content-Type') || '').toLowerCase();
      if (/html/.test(type)) return;
      const text = await response.text(); if (text.length > 5_000_000) return;
      if (/json/.test(type)) await parseJSON(text, response.url, controller.signal);
      else if (/xml/.test(type) || /^\s*<\?xml|<rdf:RDF/.test(text)) parseXML(text, response.url);
      else remember(new N3.Store(new N3.Parser({ baseIRI: response.url }).parse(text)));
    } catch { /* CORS, missing labels and offline vocabularies leave the original IRI visible. */ }
    finally { clearTimeout(timeout); }
  }
  function drain() {
    while (running < 4 && queue.length) {
      const { url, done } = queue.shift(); running++;
      retrieve(url).finally(() => { running--; done(); drain(); });
    }
  }
  async function resolve(iri) {
    if (current(iri)) return current(iri);
    let url; try { url = new URL(iri); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.protocol = 'https:'; url.hash = '';
    const cached = documents.get(url.href);
    if (!cached || cached.expires < Date.now()) {
      const entry = { expires: Date.now() + 60000, promise: null };
      entry.promise = new Promise(done => { queue.push({ url: url.href, done }); drain(); }).then(() => { entry.expires = Date.now() + (current(iri) ? 3600000 : 60000); });
      documents.set(url.href, entry);
    }
    await documents.get(url.href).promise;
    return current(iri);
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const node = entry.target; observer.unobserve(node);
      resolve(node.dataset.vocabularyIri).then(label => { if (label && node.isConnected) { node.textContent = label.value; node.lang = label.language || ''; } });
    }
  }, { rootMargin: '160px' });
  function link(iri) {
    const label = current(iri), node = document.createElement('a');
    node.href = iri; node.textContent = label?.value || iri; node.title = iri; node.dataset.vocabularyIri = iri;
    if (label?.language) node.lang = label.language;
    if (!label) observer.observe(node);
    return node;
  }
  return { remember, link, current, resolve, begin: () => observer.disconnect(), clear: () => { documents.clear(); known.clear(); observer.disconnect(); } };
})();

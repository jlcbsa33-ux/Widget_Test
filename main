(function () {
'use strict';
if (window.__bdV8Loaded) return;
window.__bdV8Loaded = true;

var MAX_EVENTS = 200, MAX_SEL = 60;
var TEST_TOPIC = 'Balineau/DiagnosticV8';
var ownId = 'v8-' + Math.random().toString(36).slice(2, 8);

var events = [], marks = [], drops = [];
var selections = [], seenSel = {}, seenEmpty = {}, emptyCount = 0;
var apps = {};
var noiseCount = {}, noiseLast = {};
var platform = null, subscribed = false, subscription = null, selSubscribed = false, selSubscription = null;
var pings = { sent: 0, own: 0, other: 0 };
var state = { environment: '', platform: 'non chargé', ws: 'non testé', space: '' };

function el(id) { return document.getElementById(id); }
function txt(id, s) { var e = el(id); if (e) e.textContent = String(s); }
function nowIso() { return new Date().toISOString(); }
function hhmmss(iso) { return iso.slice(11, 19); }
function stringify(x) { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return '[objet non sérialisable]'; } }
function clip(x, n) { x = String(x == null ? '' : x); return x.length > n ? x.slice(0, n) + '… [tronqué]' : x; }

/* Masquage : paramètres d'URL, jetons, contextes de sécurité, tenants, e-mails */
function clean(s) {
  return String(s)
    .replace(/(https?:\/\/[^\s"'<>]+?)\?[^\s"'<>]+/gi, '$1?[PARAMÈTRES MASQUÉS]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[MASQUÉ]')
    .replace(/("(?:security_context|securityContext|widgetTenant|tenant|tenantId|userId|user_id|username|login|email|mail|contextId|envId|csrf|token|access_token)"\s*:\s*")[^"]*/gi, '$1[MASQUÉ]')
    .replace(/VPLM\w*\.[^"',}\n]*/g, '[CONTEXTE MASQUÉ]')
    .replace(/\b(?:oi|r)\d{8,}(?=-)/gi, '[ENV]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]');
}

/* ---------- messages ---------- */
function isNoise(label) {
  return /widget\.vc\.ds\.com|Frame3DXInfra|NGFilter|viewpointUpdate|sessionContent|GetFilterSpec|uwa-intercom/.test(label);
}

function log(label, detail, origin) {
  events.push({ at: nowIso(), label: label, origin: origin || '', detail: clip(clean(stringify(detail)), 900) });
  if (events.length > MAX_EVENTS) events.shift();
}

function noteApp(id, topic, tags) {
  if (!id) return;
  var a = apps[id] || (apps[id] = { count: 0, last: '', topic: '', tags: '' });
  a.count++; a.last = nowIso(); a.topic = topic;
  if (tags) a.tags = tags;
}

function detectApps(label, body) {
  try {
    if (!body || typeof body !== 'object') return;
    if (body.method === 'publish-context' && body.data && body.data.app_id) {
      var ctx = body.data.app_context || {}, tags = [];
      (ctx.mcp || []).forEach(function (m) { tags = tags.concat(m.tags || []); });
      noteApp(String(body.data.app_id).split('::')[0], label, tags.join(', '));
      return;
    }
    if (body.metadata && (body.metadata.xappid || body.metadata.appid)) {
      noteApp(body.metadata.xappid || String(body.metadata.appid).replace(/^\//, ''), label);
    }
  } catch (e) { /* ignoré */ }
}

function parseSelection(label, body) {
  try {
    var dd = body && body.data;
    if (!dd || !Array.isArray(dd.paths) || !dd.attributes || typeof dd.attributes !== 'object') return;
    var uid = body.metadata && body.metadata.uid;
    if (!dd.paths.length) {
      var ek = uid || ('e' + Math.floor(Date.now() / 500));
      if (!seenEmpty[ek]) { seenEmpty[ek] = 1; emptyCount++; }
      return;
    }
    dd.paths.forEach(function (ids, i) {
      if (!Array.isArray(ids) || !ids.length) return;
      var last = ids[ids.length - 1];
      var key = (uid || ('t' + Math.floor(Date.now() / 500))) + '#' + i + '#' + last;
      if (seenSel[key]) {
        if (seenSel[key].topics.indexOf(label) < 0) seenSel[key].topics.push(label);
        return;
      }
      var attr = dd.attributes[last] || {};
      var names = ids.map(function (id) {
        var a = dd.attributes[id];
        return a && a.label ? a.label : '[' + String(id).slice(0, 6) + '…]';
      });
      var entry = { at: nowIso(), id: last, type: attr.type || '?', label: attr.label || '?', path: names.join(' › '), topics: [label] };
      seenSel[key] = entry;
      selections.unshift(entry);
      if (selections.length > MAX_SEL) selections.pop();
    });
  } catch (e) { /* ignoré */ }
}

function handle(label, body, origin) {
  detectApps(label, body);
  parseSelection(label, body);
  if (isNoise(label)) {
    noiseCount[label] = (noiseCount[label] || 0) + 1;
    noiseLast[label] = nowIso();
    if (!el('bd-noise') || !el('bd-noise').checked) { render(); return; }
  }
  log(label, body, origin);
  render();
}

function onMessage(e) {
  var d = e.data, label;
  if (d && typeof d === 'object' && d.type === 'MessageBus:publish' && d.options) {
    label = (d.options.channel || '?') + ' / ' + (d.options.topic || '?');
    handle(label, d.options.data, e.origin);
  } else if (d && typeof d === 'object' && d.type) {
    handle('postMessage / ' + d.type, d, e.origin);
  } else {
    handle('postMessage / autre', d, e.origin);
  }
}

/* ---------- affichage ---------- */
function cell(tr, text) { var td = document.createElement('td'); td.textContent = text; tr.appendChild(td); }
function fillTable(id, rows, emptyText, cols) {
  var tb = el(id); if (!tb) return;
  while (tb.firstChild) tb.removeChild(tb.firstChild);
  if (!rows.length) {
    var tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = cols; td.className = 'hint'; td.textContent = emptyText; tr.appendChild(td); tb.appendChild(tr); return;
  }
  rows.forEach(function (r) {
    var tr = document.createElement('tr');
    r.forEach(function (c) { cell(tr, c); });
    tb.appendChild(tr);
  });
}

function render() {
  fillTable('bd-apps', Object.keys(apps).map(function (k) {
    var a = apps[k]; return [k, String(a.count), hhmmss(a.last), clip(a.tags, 200)];
  }), 'Aucun message d\'application reçu.', 4);

  fillTable('bd-sel', selections.slice(0, 30).map(function (s) {
    return [hhmmss(s.at), s.type, s.label, s.id, s.path, s.topics.join(' ; ')];
  }), 'Aucune sélection reçue.', 6);
  txt('bd-sel-count', selections.length + ' sélection(s) distincte(s) ; ' + emptyCount + ' message(s) de sélection vide (ignorés).');

  var noiseLines = Object.keys(noiseCount).map(function (k) { return noiseCount[k] + ' × ' + k + ' (dernier ' + hhmmss(noiseLast[k]) + ')'; });
  txt('bd-msgs',
    'Messages conservés : ' + events.length + ' (maximum ' + MAX_EVENTS + ')\n' +
    'Messages répétitifs comptés :\n' + (noiseLines.join('\n') || '(aucun)') +
    '\n\nDERNIERS ÉVÉNEMENTS\n' +
    events.slice(-15).map(function (x) { return hhmmss(x.at) + ' | ' + x.label + ' | ' + x.detail; }).join('\n'));

  txt('bd-platform', state.platform + '\nSujet test : ' + TEST_TOPIC + ' ; exemplaire : ' + ownId +
    '\nAbonné : ' + (subscribed ? 'oui' : 'non') +
    '\nPings envoyés : ' + pings.sent + ' ; reçus de cet exemplaire : ' + pings.own + ' ; reçus d\'un autre exemplaire : ' + pings.other);
  buildReport();
}

function buildReport() {
  var L = [];
  L.push('RAPPORT DE DIAGNOSTIC V8', nowIso(), '');
  L.push('SYNTHÈSE');
  L.push('Environnement : ' + state.environment);
  L.push('PlatformAPI : ' + state.platform);
  L.push('Applications détectées : ' + (Object.keys(apps).join(', ') || 'aucune'));
  L.push('Sélections distinctes reçues : ' + selections.length + ' (vides ignorées : ' + emptyCount + ')');
  L.push('Test deux exemplaires : envoyés ' + pings.sent + ', reçus de soi ' + pings.own + ', reçus d\'un autre ' + pings.other);
  L.push('Adresse 3DSpace : ' + (state.space ? 'détectée' : 'non détectée') + ' ; WAFData : ' + state.ws);
  L.push('', 'APPLICATIONS');
  Object.keys(apps).forEach(function (k) { L.push(k + ' | ' + apps[k].count + ' msg | ' + apps[k].tags); });
  L.push('', 'SÉLECTIONS (récentes en premier)');
  selections.forEach(function (s) { L.push(s.at + ' | ' + s.type + ' | ' + s.label + ' | ' + s.id + ' | ' + s.path + ' | via ' + s.topics.join(' ; ')); });
  L.push('', 'DÉPÔTS');
  drops.forEach(function (d) { L.push(JSON.stringify(d)); });
  L.push('', 'MARQUEURS', JSON.stringify(marks));
  L.push('', 'MESSAGES RÉPÉTITIFS COMPTÉS');
  Object.keys(noiseCount).forEach(function (k) { L.push(noiseCount[k] + ' × ' + k); });
  L.push('', 'ÉVÉNEMENTS CONSERVÉS (' + events.length + ')');
  events.forEach(function (x) { L.push(x.at + ' | ' + x.label + ' | ' + x.detail); });
  var r = el('bd-report'); if (r) r.value = clean(L.join('\n'));
}

/* ---------- PlatformAPI / require ---------- */
function getReq() {
  var arr = [window];
  try { if (window.parent !== window) arr.push(window.parent); } catch (e) {}
  try { if (window.top !== window.parent) arr.push(window.top); } catch (e) {}
  for (var i = 0; i < arr.length; i++) {
    try { if (typeof arr[i].require === 'function') return arr[i].require.bind(arr[i]); } catch (e) {}
  }
  return null;
}
function load(name, ok, err) {
  var req = getReq();
  if (!req) { err('require indisponible'); return; }
  try { req([name], ok, function (e) { err(clip(stringify(e && e.message || e), 200)); }); } catch (e) { err(e.message); }
}
function keys(x) { try { return Object.keys(x || {}).slice(0, 65).join(', '); } catch (e) { return 'indisponible'; } }

/* ---------- adresse 3DSpace ---------- */
function setSpace(base, source) {
  base = String(base || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\/]+\.3dexperience\.3ds\.com/i.test(base)) return false;
  if (!/\/enovia$/i.test(base)) base += '/enovia';
  state.space = base;
  if (el('bd-ws-base')) el('bd-ws-base').value = base;
  log('3DSpace', 'Adresse détectée via ' + source);
  return true;
}
function detectSpace() {
  var found = false;
  try {
    var raw = window.widget && typeof window.widget.getValue === 'function' ? window.widget.getValue('x3dPlatformServices') : null;
    if (raw) {
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      var list = Array.isArray(obj) ? obj : [obj];
      list.forEach(function (p) {
        if (found || !p) return;
        var u = p['3DSpace'] || p['3dspace'] || (p.services && p.services['3DSpace']);
        if (typeof u === 'object' && u) u = u.url;
        if (typeof u === 'string' && setSpace(u, 'préférence widget')) found = true;
      });
    }
  } catch (e) { /* ignoré */ }
  if (!found && drops.length) {
    drops.forEach(function (d) {
      (d.items || []).forEach(function (t) {
        (t.items || []).forEach(function (it) {
          if (found || !it.imageHost) return;
          if (/-space\./i.test(it.imageHost) && setSpace('https://' + it.imageHost + '/enovia', 'dernier dépôt')) found = true;
        });
      });
    });
  }
  txt('bd-ws', found ? 'Adresse 3DSpace détectée : ' + clean(state.space) : 'Adresse non détectée : saisir l\'adresse manuellement, ou déposer d\'abord un objet 3DSpace puis relancer la détection.');
  render();
}

/* ---------- initialisation ---------- */
function init() {
  txt('bd-banner', 'V8 exécutée à ' + new Date().toLocaleTimeString('fr-FR'));
  el('bd-banner').className = 'status ok';

  var names = ['widget', 'UWA', 'require', 'requirejs', 'define', 'curl'];
  state.environment = names.map(function (n) { return n + ' : ' + typeof window[n]; }).join(' ; ') +
    ' ; iframe : ' + (window !== window.parent) + ' ; origine : ' + location.origin;
  txt('bd-env', clean(state.environment) + '\nwidget : ' + keys(window.widget) + '\nUWA : ' + keys(window.UWA));

  window.addEventListener('message', onMessage);

  load('DS/PlatformAPI/PlatformAPI', function (P) {
    platform = P;
    state.platform = 'chargé : ' + keys(P);
    render();
  }, function (e) { state.platform = 'échec : ' + e; render(); });

  el('bd-mark-start').onclick = function () { marks.push({ at: nowIso(), action: 'début' }); log('MARQUEUR', 'DÉBUT'); render(); };
  el('bd-mark-end').onclick = function () { marks.push({ at: nowIso(), action: 'fin' }); log('MARQUEUR', 'FIN'); render(); };
  el('bd-clear').onclick = function () {
    events = []; marks = []; drops = []; selections = []; seenSel = {}; seenEmpty = {}; emptyCount = 0;
    noiseCount = {}; noiseLast = {}; apps = {}; pings = { sent: 0, own: 0, other: 0 }; render();
  };

  /* écoute passive de la sélection via PlatformAPI */
  el('bd-sel-listen').onclick = function () {
    if (!platform || typeof platform.subscribe !== 'function') { txt('bd-sel-listen-state', ' subscribe indisponible'); return; }
    if (selSubscribed) return;
    try {
      selSubscription = platform.subscribe('DS/ENO/select', function (p) { handle('PlatformAPI / DS/ENO/select', p, ''); });
      selSubscribed = true; txt('bd-sel-listen-state', ' abonnement demandé');
    } catch (e) { txt('bd-sel-listen-state', ' erreur : ' + e.message); }
  };

  /* dépôt */
  var zone = el('bd-drop');
  ['dragenter', 'dragover'].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault(); zone.classList.remove('over');
    var dt = e.dataTransfer, types = dt && dt.types ? Array.prototype.slice.call(dt.types) : [], out = [];
    types.forEach(function (t) {
      var v = '';
      try { v = dt.getData(t); } catch (ex) { v = ''; }
      var info = { type: t, length: v.length };
      try {
        var obj = JSON.parse(v);
        info.protocol = obj.protocol || null; info.source = obj.source || null; info.version = obj.version || null;
        info.items = ((obj.data && obj.data.items) || []).map(function (x) {
          var host = ''; try { host = new URL(x.image).host; } catch (z) {}
          return { objectId: x.objectId, objectType: x.objectType, displayName: x.displayName, serviceId: x.serviceId, source: x.source, imageHost: host };
        });
      } catch (ex) { info.preview = clip(clean(v), 300); }
      out.push(info);
    });
    var entry = { at: nowIso(), types: types, items: out };
    drops.push(entry);
    txt('bd-drop-out', clean(JSON.stringify(entry, null, 2)));
    out.forEach(function (t) { (t.items || []).forEach(function (it) { if (it.source) noteApp(it.source, 'dépôt'); }); });
    log('DÉPÔT', entry); render();
  });

  /* test à deux exemplaires */
  function onPing(p) {
    var sender = p && typeof p === 'object' ? p.sender : null;
    if (!sender || String(p.test || '').indexOf('diagnostic-v8') !== 0) { log('PlatformAPI / réception (autre)', p); render(); return; }
    if (sender === ownId) pings.own++; else pings.other++;
    log('PlatformAPI / ping reçu', { de: sender === ownId ? 'cet exemplaire' : 'autre exemplaire', seq: p.seq }); render();
  }
  el('bd-subscribe').onclick = function () {
    if (!platform || typeof platform.subscribe !== 'function') { log('PlatformAPI', 'subscribe indisponible'); render(); return; }
    if (subscribed) return;
    try { subscription = platform.subscribe(TEST_TOPIC, onPing); subscribed = true; log('PlatformAPI', 'Abonnement demandé : ' + TEST_TOPIC); }
    catch (e) { log('PlatformAPI / erreur subscribe', e.message); }
    render();
  };
  el('bd-publish').onclick = function () {
    if (!platform || typeof platform.publish !== 'function') { log('PlatformAPI', 'publish indisponible'); render(); return; }
    var data = { test: 'diagnostic-v8', sender: ownId, seq: pings.sent + 1, time: nowIso() };
    try { platform.publish(TEST_TOPIC, data); pings.sent++; log('PlatformAPI / ping envoyé', data); }
    catch (e) { log('PlatformAPI / erreur publish', e.message); }
    render();
  };
  el('bd-unsubscribe').onclick = function () {
    if (!platform || !subscribed) return;
    try { if (typeof platform.unsubscribe === 'function') platform.unsubscribe(TEST_TOPIC, subscription); subscribed = false; log('PlatformAPI', 'Désabonnement demandé'); }
    catch (e) { log('PlatformAPI / erreur unsubscribe', e.message); }
    render();
  };

  /* WAFData : lecture seule */
  el('bd-ws-detect').onclick = detectSpace;
  el('bd-ws-go').onclick = function () {
    var base = el('bd-ws-base').value.trim().replace(/\/+$/, ''), path = el('bd-ws-path').value.trim(), url;
    try {
      if (path.charAt(0) !== '/') path = '/' + path;
      var u = new URL(base + path);
      if (u.protocol !== 'https:' || u.username || u.password) throw new Error('HTTPS sans identifiants requis');
      if (!/\.3dexperience\.3ds\.com$/i.test(u.hostname)) throw new Error('Domaine 3dexperience.3ds.com attendu');
      url = u.href;
    } catch (e) { txt('bd-ws', 'Adresse invalide : ' + e.message); return; }
    state.ws = 'en cours'; txt('bd-ws', 'Requête GET en cours…');
    load('DS/WAFData/WAFData', function (W) {
      try {
        W.authenticatedRequest(url, {
          method: 'GET', type: 'json', timeout: 15000,
          onComplete: function (r) {
            var k = r && typeof r === 'object' ? Object.keys(r).join(', ') : '(' + typeof r + ', longueur ' + String(r).length + ')';
            state.ws = 'réponse GET reçue'; txt('bd-ws', 'Réponse reçue. Champs : ' + k); render();
          },
          onFailure: function (err) { state.ws = 'échec GET : ' + clip(clean(stringify(err && err.message || err)), 160); txt('bd-ws', state.ws); render(); },
          onTimeout: function () { state.ws = 'délai dépassé'; txt('bd-ws', state.ws); render(); }
        });
      } catch (e) { state.ws = 'erreur : ' + e.message; txt('bd-ws', state.ws); render(); }
    }, function (e) { state.ws = 'module introuvable : ' + e; txt('bd-ws', state.ws); render(); });
  };

  /* rapport */
  el('bd-report-refresh').onclick = buildReport;
  el('bd-report-copy').onclick = function () {
    buildReport();
    var t = el('bd-report');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t.value).then(function () { txt('bd-copy-status', 'Rapport copié.'); },
        function () { t.select(); txt('bd-copy-status', 'Sélectionné : copier avec Ctrl+C.'); });
    } else { t.select(); txt('bd-copy-status', 'Sélectionné : copier avec Ctrl+C.'); }
  };
  el('bd-report-download').onclick = function () {
    buildReport();
    var blob = new Blob([el('bd-report').value], { type: 'text/plain;charset=utf-8' }), u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = 'rapport_diagnostic_V8.txt'; a.click();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  };

  render();
}

var tries = 0, timer = setInterval(function () {
  if (el('bd-banner')) {
    clearInterval(timer);
    try { init(); } catch (e) { txt('bd-banner', 'Erreur V8 : ' + e.message); el('bd-banner').className = 'status bad'; }
  } else if (++tries > 100) clearInterval(timer);
}, 100);

/* exposé pour les tests hors navigateur */
window.__bdTest = { clean: clean, handle: handle, selections: function () { return selections; }, report: function () { buildReport(); return el('bd-report') && el('bd-report').value; } };
})();

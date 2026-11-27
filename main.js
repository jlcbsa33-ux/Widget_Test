(function () {
'use strict';
if (window.__bdV9Loaded) return;
window.__bdV9Loaded = true;

/* ===== V9 : journal en liste blanche =====
   Aucun contenu brut de message n'est conservé. Sont gardés uniquement :
   noms de sujets (normalisés), noms de champs, sélections/désélections,
   dépôts, capacités annoncées (mcp), compteurs. */

var MAX_FEED = 60, MAX_SEL = 80, MAX_TOPICS = 100;
var TEST_TOPIC = 'Balineau/DiagnosticV9';
var ownId = 'v9-' + Math.random().toString(36).slice(2, 8);
var NOISE_TOPIC = /NGFilter|Frame3DXInfra|properties:|GetFilterSpec|volatileSubscription|towidgetim|fromwidgetim|callToRTC|tonotif|\.im\.ds\.com|appProxyReady/;
var NOISE_KIND = { 'contexte': 1, 'caméra': 1, 'uwa': 1 };
var TASK_RE = /task|tâche|tache/i;
var GANTT_APP_RE = /TASK|GANTT|PRJ|PLAN/i;

var feed = [], feedIdx = {};
var topics = {};
var kindCount = {};
var apps = {};
var selections = [], seenSel = {};
var labelCache = {};
var drops = [], marks = [];
var gantt = null;
var lastDropHost = '';
var platform = null, subscribed = false, subscription = null, selSubscribed = false, selSubscription = null;
var pings = { sent: 0, own: 0, other: 0 };
var state = { environment: '', platform: 'non chargé', ws: 'non testé', space: '', spaceSource: '', compass: 'non lancé' };
var renderTimer = null;

function el(id) { return document.getElementById(id); }
function txt(id, s) { var e = el(id); if (e) e.textContent = String(s); }
function nowIso() { return new Date().toISOString(); }
function hhmmss(iso) { return iso ? iso.slice(11, 19) : ''; }
function stringify(x) { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return '[objet non sérialisable]'; } }
function clip(x, n) { x = String(x == null ? '' : x); return x.length > n ? x.slice(0, n) + '…' : x; }
function str(x, n) { return typeof x === 'string' || typeof x === 'number' ? clip(x, n || 120) : ''; }

/* Filet de sécurité supplémentaire appliqué au rapport (la liste blanche reste la protection principale) */
function clean(s) {
  return String(s)
    .replace(/(https?:\/\/[^\s"'<>]+?)\?[^\s"'<>]+/gi, '$1?[PARAMÈTRES MASQUÉS]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[MASQUÉ]')
    .replace(/VPLM\w*\.[^"',}\n]*/g, '[CONTEXTE MASQUÉ]')
    .replace(/\b[0-9a-f]{40}\b/gi, '[JETON]')
    .replace(/\+\d{2}[\d .-]{8,}\d/g, '[TÉLÉPHONE]')
    .replace(/\b(?:oi|r)\d{8,}(?=-)/gi, '[ENV]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]');
}

/* ---------- normalisation et analyse des messages ---------- */
function normTopic(t) {
  return String(t)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/[A-Za-z0-9]{20,}/g, '<id>')
    .replace(/\d{6,}/g, '<n>')
    .slice(0, 120);
}

/* Noms de champs seulement, jamais de valeurs */
function shape(o, depth) {
  depth = depth == null ? 2 : depth;
  try {
    if (Array.isArray(o)) return '[]';
    if (o && typeof o === 'object') {
      var ks = Object.keys(o).slice(0, 14).map(function (k) {
        var name = /^[0-9A-Fa-f]{16,}$/.test(k) || /^[A-Za-z0-9]{20,}$/.test(k) ? '<id>' : clip(k, 30);
        if (depth > 0 && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) return name + '{' + shape(o[k], depth - 1) + '}';
        return name;
      });
      var seen = {}, out = [];
      ks.forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
      return out.join(',');
    }
    return typeof o;
  } catch (e) { return '?'; }
}

function classify(body) {
  if (body && typeof body === 'object') {
    if (body.method === 'publish-context') return 'contexte';
    if (body.type === 'uwa-intercom') return 'uwa';
    var d = body.data;
    if (d && typeof d === 'object') {
      if (Array.isArray(d.paths)) return 'sélection';
      if (d.rootIds) return 'contenu';
      if (d.viewpoint || d.viewpointV2) return 'caméra';
    }
  }
  return 'autre';
}

function appOf(body) {
  try {
    if (!body || typeof body !== 'object') return '';
    if (body.metadata && (body.metadata.xappid || body.metadata.appid)) return normTopic(String(body.metadata.xappid || body.metadata.appid).replace(/^\//, '')).slice(0, 40);
    if (body.data && body.data.app_id) return normTopic(String(body.data.app_id).split('::')[0]).slice(0, 40);
    if (body.targetApp && body.targetApp.options && body.targetApp.options.id) return normTopic(body.targetApp.options.id).slice(0, 40);
  } catch (e) {}
  return '';
}

function noteApp(id, tags) {
  if (!id) return;
  var a = apps[id] || (apps[id] = { count: 0, first: nowIso(), last: '', tags: '' });
  a.count++; a.last = nowIso();
  if (tags) a.tags = tags;
}

function detectApp(body, app) {
  var tags = '';
  try {
    if (body && body.method === 'publish-context' && body.data && body.data.app_context) {
      var list = [];
      (body.data.app_context.mcp || []).forEach(function (m) {
        (m.tags || []).forEach(function (t) { if (/^[\w.-]{1,40}$/.test(String(t))) list.push(String(t)); });
      });
      tags = list.join(', ');
    }
  } catch (e) {}
  noteApp(app, tags);
}

function addFeed(nt, kind, app, body) {
  var uid = body && body.metadata && body.metadata.uid ? String(body.metadata.uid) : '';
  var key = uid ? uid + '|' + kind : '';
  if (key && feedIdx[key]) {
    if (feedIdx[key].topics.indexOf(nt) < 0) feedIdx[key].topics.push(nt);
    return;
  }
  var f = { at: nowIso(), kind: kind, app: app, topics: [nt], key: key };
  feed.unshift(f);
  if (key) feedIdx[key] = f;
  if (feed.length > MAX_FEED) { var old = feed.pop(); if (old.key) delete feedIdx[old.key]; }
}

function parseSelection(nt, body, app) {
  try {
    var dd = body && body.data;
    if (!dd || !Array.isArray(dd.paths)) return;
    var uid = body.metadata && body.metadata.uid ? String(body.metadata.uid) : '';
    var attrs = dd.attributes && typeof dd.attributes === 'object' ? dd.attributes : {};
    Object.keys(attrs).forEach(function (id) {
      var a = attrs[id];
      if (a && typeof a.label === 'string' && a.label) labelCache[id] = clip(a.label, 120);
    });
    var bucket = uid || ('t' + Math.floor(Date.now() / 500));
    if (!dd.paths.length) {
      var ke = 'E|' + bucket + '|' + app;
      if (seenSel[ke]) { if (seenSel[ke].topics.indexOf(nt) < 0) seenSel[ke].topics.push(nt); return; }
      var e = { at: nowIso(), kind: 'désélection', type: '', label: '', id: '', path: [], app: app, topics: [nt] };
      seenSel[ke] = e; selections.unshift(e);
    } else {
      dd.paths.forEach(function (ids, i) {
        if (!Array.isArray(ids) || !ids.length) return;
        var last = String(ids[ids.length - 1]);
        var ks = 'S|' + bucket + '#' + i + '#' + last;
        if (seenSel[ks]) { if (seenSel[ks].topics.indexOf(nt) < 0) seenSel[ks].topics.push(nt); return; }
        var lastAttr = attrs[last] || {};
        var path = ids.map(function (id) {
          var a = attrs[id] || {};
          return { id: String(id), type: str(a.type, 40), label: str(a.label, 120) };
        });
        var s = { at: nowIso(), kind: 'sélection', type: str(lastAttr.type, 40), label: str(lastAttr.label, 120), id: last, path: path, app: app, topics: [nt] };
        seenSel[ks] = s; selections.unshift(s);
      });
    }
    while (selections.length > MAX_SEL) selections.pop();
  } catch (err) { /* ignoré */ }
}

function handle(label, body, origin) {
  var nt = normTopic(label), kind = classify(body), app = appOf(body);
  var ck = nt + ' [' + kind + ']';
  var t = topics[ck];
  if (!t && Object.keys(topics).length < MAX_TOPICS) t = topics[ck] = { count: 0, first: nowIso(), last: '', shape: shape(body) };
  if (t) { t.count++; t.last = nowIso(); }
  kindCount[kind] = (kindCount[kind] || 0) + 1;
  detectApp(body, app);
  if (kind === 'sélection') parseSelection(nt, body, app);
  var noisy = NOISE_KIND[kind] || NOISE_TOPIC.test(nt);
  var show = el('bd-noise') && el('bd-noise').checked;
  if (!noisy || show) addFeed(nt, kind, app, body);
  scheduleRender();
}

function onMessage(e) {
  var d = e.data;
  if (d && typeof d === 'object' && d.type === 'MessageBus:publish' && d.options) {
    handle((d.options.channel || '?') + ' / ' + (d.options.topic || '?'), d.options.data, e.origin);
  } else if (d && typeof d === 'object' && d.type) {
    var sub = '';
    try {
      var ev = d.payload && d.payload.event ? String(d.payload.event) : '';
      var a0 = d.payload && d.payload.data && d.payload.data.args && d.payload.data.args[0];
      sub = (ev ? ' / ' + ev : '') + (typeof a0 === 'string' && /^(on[A-Z]\w{0,40}|launchWidget)$/.test(a0) ? ' / ' + a0 : '');
    } catch (x) {}
    handle('postMessage / ' + clip(d.type, 40) + sub, d, e.origin);
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
    var tr0 = document.createElement('tr'), td0 = document.createElement('td');
    td0.colSpan = cols; td0.className = 'hint'; td0.textContent = emptyText; tr0.appendChild(td0); tb.appendChild(tr0); return;
  }
  rows.forEach(function (r) {
    var tr = document.createElement('tr');
    r.forEach(function (c) { cell(tr, c); });
    tb.appendChild(tr);
  });
}

function selView(s) {
  if (s.kind === 'désélection') return { label: '', path: '' };
  var cached = !s.label && labelCache[s.id];
  var label = s.label || labelCache[s.id] || '?';
  var path = (s.path || []).map(function (n) { return n.label || labelCache[n.id] || '[' + (n.type || 'nœud') + ']'; }).join(' › ');
  return { label: label + (cached ? ' (via cache)' : ''), path: path };
}

function ganttText() {
  if (!gantt) return 'Test non démarré.';
  var known = Object.keys(apps).filter(function (k) { return GANTT_APP_RE.test(k); });
  var newApps = Object.keys(apps).filter(function (k) { return apps[k].first >= gantt.at; });
  var taskSel = selections.filter(function (s) { return s.kind === 'sélection' && s.at >= gantt.at && TASK_RE.test(s.type); });
  var taskDrop = drops.filter(function (d) {
    return d.at >= gantt.at && (d.items || []).some(function (t) { return (t.items || []).some(function (i) { return TASK_RE.test(i.objectType || ''); }); });
  });
  var newTopics = Object.keys(topics).filter(function (k) {
    return topics[k].first >= gantt.at && !NOISE_TOPIC.test(k) && !/\[(contexte|caméra|uwa)\]$/.test(k);
  });
  return [
    'Démarré à ' + hhmmss(gantt.at),
    (known.length ? '✅' : '⬜') + ' Application Gantt/Tâches détectée : ' + (known.join(', ') || 'non'),
    (newApps.length ? '✅' : '⬜') + ' Applications apparues depuis le démarrage : ' + (newApps.join(', ') || 'aucune'),
    (taskSel.length ? '✅' : '⬜') + ' Sélection d\'une tâche reçue : ' + taskSel.length,
    (taskDrop.length ? '✅' : '⬜') + ' Dépôt d\'une tâche reçu : ' + taskDrop.length,
    'Nouveaux sujets utiles depuis le démarrage : ' + (newTopics.slice(0, 8).join(' | ') || 'aucun')
  ].join('\n');
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(function () { renderTimer = null; render(); }, 250);
}

function render() {
  fillTable('bd-apps', Object.keys(apps).map(function (k) {
    var a = apps[k]; return [k, String(a.count), hhmmss(a.first), hhmmss(a.last), clip(a.tags, 220)];
  }), 'Aucun message d\'application reçu.', 5);

  var nSel = selections.filter(function (s) { return s.kind === 'sélection'; }).length;
  var nDes = selections.length - nSel;
  fillTable('bd-sel', selections.slice(0, 30).map(function (s) {
    var v = selView(s);
    return [hhmmss(s.at), s.kind === 'désélection' ? 'Désélection' : 'Sélection', s.type, v.label, s.id, v.path, s.app, s.topics.join(' ; ')];
  }), 'Aucune sélection reçue.', 8);
  txt('bd-sel-count', nSel + ' sélection(s) distincte(s) ; ' + nDes + ' désélection(s) ; ' + Object.keys(labelCache).length + ' libellé(s) en cache.');

  txt('bd-gantt', ganttText());

  txt('bd-feed', feed.length ? feed.slice(0, 25).map(function (f) {
    return hhmmss(f.at) + ' | ' + f.kind + ' | ' + (f.app || '-') + ' | ' + f.topics.join(' ; ');
  }).join('\n') : 'Aucun message utile.');

  var rows = Object.keys(topics).sort(function (a, b) { return topics[b].last < topics[a].last ? -1 : 1; }).slice(0, 40).map(function (k) {
    return [k, String(topics[k].count), hhmmss(topics[k].last), clip(topics[k].shape, 200)];
  });
  fillTable('bd-topics', rows, 'Aucun sujet reçu.', 4);

  txt('bd-platform', state.platform + '\nSujet test : ' + TEST_TOPIC + ' ; exemplaire : ' + ownId +
    '\nAbonné : ' + (subscribed ? 'oui' : 'non') +
    '\nPings envoyés : ' + pings.sent + ' ; reçus de cet exemplaire : ' + pings.own + ' ; reçus d\'un autre exemplaire : ' + pings.other);
  buildReport();
}

function buildReport() {
  var L = [];
  var nSel = selections.filter(function (s) { return s.kind === 'sélection'; }).length;
  var nDes = selections.length - nSel;
  L.push('RAPPORT DE DIAGNOSTIC V9 (journal en liste blanche : aucun contenu brut)', nowIso(), '');
  L.push('SYNTHÈSE');
  L.push('Environnement : ' + state.environment);
  L.push('PlatformAPI : ' + state.platform);
  L.push('Applications détectées : ' + (Object.keys(apps).join(', ') || 'aucune'));
  L.push('Sélections distinctes : ' + nSel + ' ; désélections : ' + nDes + ' ; libellés en cache : ' + Object.keys(labelCache).length);
  L.push('Test deux exemplaires : envoyés ' + pings.sent + ', reçus de soi ' + pings.own + ', reçus d\'un autre ' + pings.other);
  L.push('Adresse 3DSpace : ' + (state.space ? 'détectée via ' + state.spaceSource : 'non détectée') + ' ; service plateforme : ' + state.compass + ' ; WAFData : ' + state.ws);
  L.push('', 'TEST GANTT', ganttText());
  L.push('', 'APPLICATIONS');
  Object.keys(apps).forEach(function (k) { L.push(k + ' | ' + apps[k].count + ' msg | premier ' + hhmmss(apps[k].first) + ' | dernier ' + hhmmss(apps[k].last) + ' | ' + apps[k].tags); });
  L.push('', 'SÉLECTIONS ET DÉSÉLECTIONS (récentes en premier)');
  selections.forEach(function (s) {
    var v = selView(s);
    L.push(s.at + ' | ' + s.kind + ' | ' + s.type + ' | ' + v.label + ' | ' + s.id + ' | ' + v.path + ' | ' + s.app + ' | via ' + s.topics.join(' ; '));
  });
  L.push('', 'DÉPÔTS');
  drops.forEach(function (d) { L.push(JSON.stringify(d)); });
  L.push('', 'MARQUEURS', JSON.stringify(marks));
  L.push('', 'COMPTEURS PAR NATURE');
  Object.keys(kindCount).forEach(function (k) { L.push(kindCount[k] + ' × ' + k); });
  L.push('', 'CATALOGUE DES SUJETS (nom | nombre | premier | dernier | champs du premier message)');
  Object.keys(topics).forEach(function (k) { L.push(k + ' | ' + topics[k].count + ' | ' + hhmmss(topics[k].first) + ' | ' + hhmmss(topics[k].last) + ' | ' + topics[k].shape); });
  L.push('', 'FIL D\'ACTIVITÉ (récent en premier)');
  feed.forEach(function (f) { L.push(f.at + ' | ' + f.kind + ' | ' + (f.app || '-') + ' | ' + f.topics.join(' ; ')); });
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
  try { req([name], ok, function (e) { err(clip(stringify(e && e.message || e), 160)); }); } catch (e) { err(e.message); }
}
function keys(x) { try { return Object.keys(x || {}).slice(0, 65).join(', '); } catch (e) { return 'indisponible'; } }

/* ---------- adresse 3DSpace ---------- */
function setSpace(base, source) {
  base = String(base || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\/]+\.3dexperience\.3ds\.com/i.test(base)) return false;
  if (!/\/enovia$/i.test(base)) base += '/enovia';
  state.space = base; state.spaceSource = source;
  if (el('bd-ws-base')) el('bd-ws-base').value = base;
  return true;
}
function pickUrl(r, pid) {
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) {
    var hit = null;
    r.forEach(function (x) { if (x && x.platformId === pid && x.url) hit = x.url; });
    if (hit) return hit;
    return r[0] && r[0].url ? r[0].url : '';
  }
  return r && r.url ? r.url : '';
}
function detectSpace() {
  var finished = false;
  state.compass = 'recherche…';
  function finish(found) {
    if (finished) return; finished = true;
    if (!found) {
      /* repli 1 : préférence du widget ; repli 2 : dernier dépôt */
      try {
        var raw = window.widget && typeof window.widget.getValue === 'function' ? window.widget.getValue('x3dPlatformServices') : null;
        if (raw) {
          var obj = typeof raw === 'string' ? JSON.parse(raw) : raw, list = Array.isArray(obj) ? obj : [obj];
          list.forEach(function (p) {
            if (found || !p) return;
            var u = p['3DSpace'] || p['3dspace'] || (p.services && p.services['3DSpace']);
            if (u && typeof u === 'object') u = u.url;
            if (typeof u === 'string' && setSpace(u, 'préférence du widget')) found = true;
          });
        }
      } catch (e) {}
      if (!found && lastDropHost && /-space\./i.test(lastDropHost) && setSpace('https://' + lastDropHost + '/enovia', 'dernier dépôt')) found = true;
    }
    txt('bd-ws', found ? 'Adresse 3DSpace détectée (source : ' + state.spaceSource + '). Prête pour le test GET.' : 'Adresse non détectée : déposer un objet 3DSpace puis relancer la détection, ou saisir l\'adresse à la main.');
    scheduleRender();
  }
  var pid = '';
  try { pid = window.widget && typeof window.widget.getValue === 'function' ? window.widget.getValue('x3dPlatformId') || '' : ''; } catch (e) {}
  try { if (!pid && platform && typeof platform.getTenant === 'function') { var tn = platform.getTenant(); if (typeof tn === 'string') pid = tn; } } catch (e) {}
  load('DS/i3DXCompassServices/i3DXCompassServices', function (S) {
    var timer = setTimeout(function () { if (!finished) { state.compass = 'pas de réponse (8 s)'; finish(false); } }, 8000);
    try {
      var opts = {
        serviceName: '3DSpace',
        onComplete: function (r) {
          clearTimeout(timer);
          var u = pickUrl(r, pid);
          if (u && setSpace(u, 'service de la plateforme')) { state.compass = 'ok'; finish(true); }
          else { state.compass = u ? 'adresse hors domaine attendu (non utilisée)' : 'réponse sans adresse'; finish(false); }
        },
        onFailure: function () { clearTimeout(timer); state.compass = 'échec de l\'appel'; finish(false); }
      };
      if (pid) opts.platformId = pid;
      S.getServiceUrl(opts);
    } catch (e) { clearTimeout(timer); state.compass = 'erreur : ' + clip(e.message, 80); finish(false); }
  }, function (e) { state.compass = 'module indisponible : ' + e; finish(false); });
}

/* ---------- dépôt ---------- */
function processDrop(dt) {
  var types = dt && dt.types ? Array.prototype.slice.call(dt.types) : [], out = [];
  types.forEach(function (t) {
    var v = '';
    try { v = dt.getData(t); } catch (ex) { v = ''; }
    var info = { type: clip(t, 40), length: v.length };
    try {
      var obj = JSON.parse(v);
      info.protocol = str(obj.protocol, 40); info.source = str(obj.source, 40); info.version = str(obj.version, 20);
      var items = (obj.data && Array.isArray(obj.data.items)) ? obj.data.items.slice(0, 20) : [];
      info.items = items.map(function (x) {
        try { if (x.image) { var h = new URL(x.image).host; if (h) lastDropHost = h; } } catch (z) {}
        return { objectId: str(x.objectId, 80), objectType: str(x.objectType, 60), displayName: str(x.displayName, 120), serviceId: str(x.serviceId, 40), source: str(x.source, 40) };
      });
    } catch (ex) { /* contenu non JSON : seuls le type et la longueur sont gardés */ }
    out.push(info);
  });
  var entry = { at: nowIso(), types: types.map(function (t) { return clip(t, 40); }), items: out };
  drops.push(entry);
  txt('bd-drop-out', JSON.stringify(entry, null, 2));
  out.forEach(function (t) { (t.items || []).forEach(function (it) { if (it.source) noteApp(normTopic(it.source).slice(0, 40), ''); }); });
  var evt = { at: entry.at, kind: 'dépôt', app: (out[0] && out[0].source) || '', topics: ['drop'], key: '' };
  feed.unshift(evt);
  if (lastDropHost && !state.space) detectSpace();
  scheduleRender();
  return entry;
}

/* ---------- initialisation ---------- */
function init() {
  txt('bd-banner', 'V9 exécutée à ' + new Date().toLocaleTimeString('fr-FR'));
  el('bd-banner').className = 'status ok';

  var names = ['widget', 'UWA', 'require', 'requirejs', 'define', 'curl'];
  state.environment = names.map(function (n) { return n + ' : ' + typeof window[n]; }).join(' ; ') +
    ' ; iframe : ' + (window !== window.parent);
  txt('bd-env', state.environment + '\nwidget (méthodes) : ' + keys(window.widget) + '\nUWA : ' + keys(window.UWA));

  window.addEventListener('message', onMessage);

  load('DS/PlatformAPI/PlatformAPI', function (P) {
    platform = P; state.platform = 'chargé : ' + keys(P); scheduleRender();
    detectSpace();
  }, function (e) { state.platform = 'échec : ' + e; scheduleRender(); detectSpace(); });

  el('bd-mark-start').onclick = function () { marks.push({ at: nowIso(), action: 'début' }); feed.unshift({ at: nowIso(), kind: 'MARQUEUR', app: '', topics: ['DÉBUT'], key: '' }); render(); };
  el('bd-mark-end').onclick = function () { marks.push({ at: nowIso(), action: 'fin' }); feed.unshift({ at: nowIso(), kind: 'MARQUEUR', app: '', topics: ['FIN'], key: '' }); render(); };
  el('bd-clear').onclick = function () {
    feed = []; feedIdx = {}; topics = {}; kindCount = {}; apps = {}; selections = []; seenSel = {};
    drops = []; marks = []; gantt = null; pings = { sent: 0, own: 0, other: 0 }; render();
  };
  el('bd-gantt-start').onclick = function () { gantt = { at: nowIso() }; render(); };

  el('bd-sel-listen').onclick = function () {
    if (!platform || typeof platform.subscribe !== 'function') { txt('bd-sel-listen-state', ' subscribe indisponible'); return; }
    if (selSubscribed) return;
    try {
      selSubscription = platform.subscribe('DS/ENO/select', function (p) { handle('PlatformAPI / DS/ENO/select', p, ''); });
      selSubscribed = true; txt('bd-sel-listen-state', ' abonnement demandé');
    } catch (e) { txt('bd-sel-listen-state', ' erreur : ' + clip(e.message, 80)); }
  };

  var zone = el('bd-drop');
  ['dragenter', 'dragover'].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
  zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); processDrop(e.dataTransfer); });

  function onPing(p) {
    var sender = p && typeof p === 'object' ? p.sender : null;
    if (!sender || String(p.test || '') !== 'diagnostic-v9') return;
    if (sender === ownId) pings.own++; else pings.other++;
    scheduleRender();
  }
  el('bd-subscribe').onclick = function () {
    if (!platform || typeof platform.subscribe !== 'function') { txt('bd-platform', 'subscribe indisponible'); return; }
    if (subscribed) return;
    try { subscription = platform.subscribe(TEST_TOPIC, onPing); subscribed = true; } catch (e) { state.platform += ' ; erreur subscribe : ' + clip(e.message, 80); }
    render();
  };
  el('bd-publish').onclick = function () {
    if (!platform || typeof platform.publish !== 'function') { txt('bd-platform', 'publish indisponible'); return; }
    try { platform.publish(TEST_TOPIC, { test: 'diagnostic-v9', sender: ownId, seq: pings.sent + 1, time: nowIso() }); pings.sent++; }
    catch (e) { state.platform += ' ; erreur publish : ' + clip(e.message, 80); }
    render();
  };
  el('bd-unsubscribe').onclick = function () {
    if (!platform || !subscribed) return;
    try { if (typeof platform.unsubscribe === 'function') platform.unsubscribe(TEST_TOPIC, subscription); subscribed = false; } catch (e) {}
    render();
  };

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
            var k = r && typeof r === 'object' ? Object.keys(r).slice(0, 20).map(function (x) { return clip(x, 30); }).join(', ') : '(' + typeof r + ', longueur ' + String(r).length + ')';
            state.ws = 'réponse GET reçue (champs : ' + k + ')'; txt('bd-ws', 'Réponse reçue. Champs : ' + k); scheduleRender();
          },
          onFailure: function (err) { state.ws = 'échec GET : ' + clip(clean(stringify(err && err.message || err)), 100); txt('bd-ws', state.ws); scheduleRender(); },
          onTimeout: function () { state.ws = 'délai dépassé'; txt('bd-ws', state.ws); scheduleRender(); }
        });
      } catch (e) { state.ws = 'erreur : ' + clip(e.message, 80); txt('bd-ws', state.ws); scheduleRender(); }
    }, function (e) { state.ws = 'module introuvable : ' + e; txt('bd-ws', state.ws); scheduleRender(); });
  };

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
    a.href = u; a.download = 'rapport_diagnostic_V9.txt'; a.click();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  };

  render();
}

var tries = 0, timer = setInterval(function () {
  if (el('bd-banner')) {
    clearInterval(timer);
    try { init(); } catch (e) { txt('bd-banner', 'Erreur V9 : ' + e.message); el('bd-banner').className = 'status bad'; }
  } else if (++tries > 100) clearInterval(timer);
}, 100);

/* exposé pour les tests hors navigateur */
window.__bdTest = {
  onMessage: onMessage, processDrop: processDrop, flush: render,
  startGantt: function () { gantt = { at: nowIso() }; },
  report: function () { buildReport(); return el('bd-report') && el('bd-report').value; },
  selections: function () { return selections; }
};
})();

(function () {
'use strict';
if (window.__asLoaded) return;
window.__asLoaded = true;

/* ===== Widget : association produit (CATIA / 3D) <-> tâche, dates et lecture 4D =====
   Lit les messages de la plateforme. Une seule action est envoyée aux autres widgets, et seulement sur clic ou en lecture :
   la publication d'un message de SÉLECTION sur DS/ENO/select (validé sur ta plateforme : arborescence et vues 3D réagissent).
   Aucune donnée n'est modifiée. Associations et dates sont stockées localement (localStorage, par plateforme).
   Ce script construit lui-même toute l'interface : la page HTML n'est qu'un chargeur. */

var VERSION = '10';

var CSS = `
body{font:14px 'Segoe UI',Arial,sans-serif;background:#eef2f6;color:#1c2938;margin:0;padding:12px}
main{max-width:1100px;margin:auto}h2{font-size:15px;margin:0 0 8px}
.row{display:flex;gap:12px;flex-wrap:wrap}.row .card{flex:1 1 320px;min-width:0}
.card{background:#fff;border:1px solid #cad3de;border-radius:9px;padding:12px;margin:10px 0}
.status{padding:8px;background:#fff1d0;border-radius:5px}.ok{background:#d9f3e1}.bad{background:#ffe0de}
.hint,small{color:#536477}.warn{color:#9a4b00;font-weight:600}
.warnbox{background:#fff6c9;border:1px solid #e3c96a;padding:6px 8px;border-radius:5px;font-size:12px;margin:6px 0}
.sel div.it{padding:5px 7px;border-left:4px solid #1263a8;background:#f2f8ff;margin:4px 0;border-radius:3px;overflow-wrap:anywhere}
.sel div.it.t{border-left-color:#b36b00;background:#fff8ec}
.sel div.it.t.off{border-left-color:#b3261e;background:#fff0ee}
.sel .sub{font-size:12px;color:#536477}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.bar select{width:auto}.bar label{display:inline;margin:0}
button{background:#1263a8;color:#fff;border:0;border-radius:5px;padding:8px 12px;cursor:pointer}
button.big{font-size:16px;padding:10px 20px;background:#1a7f37}button.big.on{background:#9a4b00}button.sec{background:#5b6f84}button.del{background:#b3261e;padding:3px 8px}button.eye{background:#5b6f84;padding:3px 8px;margin-right:4px}
button:disabled{opacity:.5;cursor:default}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d2dae3;padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e6edf5}
tr.cur td{background:#fff6c9}
.scroll{max-height:300px;overflow:auto}
#as-tbl-msg,#as-play-msg{min-height:1.3em;margin:4px 0;font-weight:600;color:#1c2938}
textarea,pre,input[type=text],select{width:100%;box-sizing:border-box;border:1px solid #9caabb;border-radius:4px;padding:6px;font:12px Consolas,monospace;background:#f7f9fb}
input[type=date]{padding:4px;border:1px solid #9caabb;border-radius:4px;font:12px 'Segoe UI',Arial,sans-serif;background:#f7f9fb}
textarea{height:120px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto}
progress{width:100%;height:10px}
#as-drop{border:2px dashed #7b9cbb;background:#f2f8ff;padding:16px;text-align:center;border-radius:8px}#as-drop.over{background:#cde9ff;border-color:#1263a8}
details summary{cursor:pointer;font-weight:600}label{display:block;margin:6px 0 2px}
#as-links div{margin:3px 0;overflow-wrap:anywhere}
`;

var HTML = `
<div id="as-banner" class="status">Chargement…</div>

<div class="row">
<section class="card"><h2>① Produit(s) sélectionné(s)</h2><div id="as-prod" class="sel"></div><small id="as-prod-note"></small></section>
<section class="card"><h2>② Tâche(s) sélectionnée(s)</h2><div id="as-task" class="sel"></div><small id="as-task-note"></small></section>
</div>

<div class="bar">
<button id="as-assoc" class="big">③ Associer</button>
<button id="as-clear" class="sec">Vider la sélection</button>
<span id="as-msg" class="hint"></span>
</div>

<section class="card"><h2>Liens de la sélection courante</h2><div id="as-links" class="hint">—</div></section>

<section class="card"><h2>Associations enregistrées <span id="as-count" class="hint"></span></h2>
<div id="as-tbl-msg" role="status">Le bouton 👁 met en évidence le produit de la ligne dans les vues 3D.</div>
<div class="scroll"><table><thead><tr><th>Tâche</th><th>Produit</th><th>Type</th><th>Chemin</th><th>Dates de la tâche</th><th>Associé le</th><th></th></tr></thead><tbody id="as-rows"></tbody></table></div>
<small id="as-store"></small></section>

<section class="card"><h2>Dates des tâches</h2>
<p class="hint">Dates saisies ici ou importées : le widget ne sait pas lire celles de Project Gantt. Elles sont rattachées à l'identifiant de la tâche et enregistrées dans ce navigateur.</p>
<div class="scroll"><table><thead><tr><th>Tâche</th><th>Produits</th><th>Début</th><th>Fin</th><th></th></tr></thead><tbody id="as-dates"></tbody></table></div>
<details id="as-dcsv-box" style="margin-top:8px"><summary>Importer des dates depuis un fichier CSV</summary>
<p class="hint">Première ligne = en-têtes. Colonnes reconnues : le titre de la tâche (<i>tache, tache_nom, titre, nom</i>) ou son identifiant (<i>tache_id</i>), puis <i>debut</i> et <i>fin</i>. Séparateur ; , ou tabulation. Dates jj/mm/aaaa ou aaaa-mm-jj. Le widget ne connaît pas le « Nom » T-0000… des tâches : le rapprochement se fait par titre ou par identifiant. Un titre porté par plusieurs tâches est signalé, jamais deviné. L'export CSV du widget se réimporte tel quel.</p>
<input type="file" id="as-dcsv-file" accept=".csv,.txt,text/csv,text/plain">
<textarea id="as-dcsv" placeholder="Ou coller ici le contenu du CSV."></textarea>
<div class="bar"><label><input type="checkbox" id="as-dcsv-over"> Écraser les dates déjà saisies</label><button id="as-dcsv-go" class="sec">Importer les dates</button></div>
<pre id="as-dcsv-out">Aucun import.</pre></details></section>

<section class="card"><h2>Lecture 4D</h2>
<p class="hint">Chaque jour publie, en un seul message, les produits à montrer d'après les dates ci-dessus. Chaque message remplace la sélection précédente : un seul surlignage (bleu), sans couleur par état, et rien n'est caché. Pendant la lecture, les sélections faites ailleurs sont ignorées.</p>
<div class="bar"><label for="as-play-from">Du</label><input type="date" id="as-play-from"><label for="as-play-to">au</label><input type="date" id="as-play-to"><button id="as-play-fit" class="sec">Caler sur les dates des tâches</button></div>
<div class="bar"><button id="as-play-first" class="sec" title="Début de la plage">⏮</button><button id="as-sim-prev" class="sec">−1 jour</button><input type="date" id="as-simdate"><button id="as-sim-next" class="sec">+1 jour</button><button id="as-play-last" class="sec" title="Fin de la plage">⏭</button><button id="as-play" class="big">▶ Lecture</button></div>
<progress id="as-play-bar" max="100" value="0"></progress>
<div id="as-sim-sum" class="hint">—</div>
<div class="bar"><label for="as-play-mode">Afficher :</label>
<select id="as-play-mode"><option value="built">construit à ce jour (terminé + en cours)</option><option value="run">en cours seulement</option><option value="todo">à venir seulement</option></select>
<label for="as-play-speed">Vitesse :</label>
<select id="as-play-speed"><option value="500">1 jour toutes les 0,5 s</option><option value="1000" selected>1 jour par seconde</option><option value="2000">1 jour toutes les 2 s</option><option value="3000">1 jour toutes les 3 s</option><option value="5000">1 jour toutes les 5 s</option></select></div>
<div class="bar"><label><input type="checkbox" id="as-play-auto" checked> Publier à chaque changement de date</label>
<label><input type="checkbox" id="as-play-clear" checked> Vider la sélection quand rien n'est à montrer</label>
<button id="as-sim-go" class="sec">Appliquer ce jour</button></div>
<div id="as-play-msg" role="status"></div></section>

<section class="card"><h2>Mise en évidence 3D</h2>
<div class="warnbox">Le widget publie un message de <b>sélection</b> sur DS/ENO/select, comme le fait l'arborescence : elle et les vues 3D réagissent. Chaque message remplace la sélection précédente. Aucune donnée n'est modifiée.</div>
<div class="bar"><button id="as-pub-task">Mettre en évidence les produits de la tâche sélectionnée</button><span id="as-pub-msg" class="hint"></span></div>
<pre id="as-pub-sum">Aucune publication.</pre>
<details><summary>Dernier message publié (structure, sans valeurs)</summary><pre id="as-pub-last">Aucun message publié.</pre></details>
<small>Le bouton 👁 d'une ligne du tableau publie un seul produit. Après un envoi, regarder la vue 3D : un surlignage a lieu même si aucun message n'est émis en retour. Pendant 3 secondes, le widget ne tient pas compte des sélections reçues d'autres applications.</small></section>

<details class="card"><summary>Vérifier l'identité des instances</summary>
<p class="hint">Sélectionner deux pieux d'une même semelle (ou en sélectionner un, le mémoriser comme A, puis en sélectionner un autre). Le widget compare leurs chemins d'identifiants niveau par niveau.</p>
<div class="bar"><button id="as-cmp-a" class="sec">Mémoriser la sélection comme A</button><button id="as-cmp-go" class="sec">Comparer la sélection avec A</button><button id="as-cmp-two" class="sec">Comparer les 2 premiers sélectionnés</button></div>
<pre id="as-cmp">Aucune comparaison.</pre></details>

<section class="card"><h2>Dépôt d'une tâche ou d'un produit</h2>
<p class="hint">Glisser une tâche ou un produit n'importe où dans ce widget : la zone ci-dessous sert de repère. Pour un produit, la sélection dans l'arborescence est préférable : un dépôt ne transporte pas l'emplacement exact et l'association ne pourra pas être mise en évidence.</p>
<div id="as-drop" tabindex="0">Déposer ici</div></section>

<details class="card"><summary>Sauvegarde et échange (CSV / JSON)</summary>
<p class="hint">Associations et dates sont gardées automatiquement dans ce navigateur, pour cette plateforme seulement. Exporter régulièrement pour en garder une copie ailleurs. Si le téléchargement est bloqué dans le dashboard, utiliser « Copier ».</p>
<div class="bar"><button id="as-exp-csv" class="sec">Exporter CSV</button><button id="as-exp-json" class="sec">Exporter JSON</button><button id="as-copy" class="sec">Copier</button><button id="as-imp" class="sec">Importer le JSON du cadre</button><button id="as-erase" class="del">Tout effacer</button></div>
<textarea id="as-io" placeholder="Le contenu exporté s'affiche ici. Pour importer : coller un JSON exporté puis « Importer le JSON du cadre »."></textarea>
<label for="as-file">Ou importer un fichier JSON</label><input type="file" id="as-file" accept=".json,application/json">
<small id="as-io-msg"></small></details>

<details class="card" id="as-diag-box"><summary>Diagnostic et lecture 3DSpace</summary>
<p class="hint">Les messages reçus mais non utilisés s'affichent en bas du diagnostic (nom du sujet, application émettrice et noms de champs, jamais les valeurs). « Nouvelle observation » remet les compteurs à zéro.</p>
<div class="bar"><button id="as-obs" class="sec">Nouvelle observation</button><button id="as-copy-diag" class="sec">Copier le diagnostic</button><small id="as-diag-msg"></small></div>
<pre id="as-diag">…</pre>
<h2 style="margin-top:10px">Observation complète (30 s)</h2>
<p class="hint">Pendant 30 secondes, le widget note <b>tous</b> les messages reçus, y compris ceux que le diagnostic habituel écarte (caméra, synchronisation, filtres) : nom du sujet, application émettrice, nombre, moment d'apparition et noms de champs. Jamais les valeurs. Cliquer sur « Observer », puis faire l'action à étudier dans le dashboard (par exemple l'œil de visibilité de l'arborescence).</p>
<div class="bar"><button id="as-full-go" class="sec">Observer 30 s</button><button id="as-full-stop" class="sec">Arrêter</button><button id="as-full-copy" class="sec">Copier le résultat</button><small id="as-full-msg"></small></div>
<pre id="as-full-out">Aucune observation complète.</pre>
<h2 style="margin-top:10px">Lecture 3DSpace (GET seul)</h2>
<p class="hint">Affiche les noms de champs de la réponse et les valeurs des champs dont le nom évoque une date, un nom, un état ou un pourcentage. Rien n'est enregistré.</p>
<label for="as-ws-base">Adresse 3DSpace</label><input type="text" id="as-ws-base" placeholder="Détection automatique">
<label for="as-ws-path">Chemin (utiliser {id} pour insérer l'identifiant)</label><input type="text" id="as-ws-path" value="/resources/v1/application/CSRF">
<label for="as-ws-id">{id} =</label><select id="as-ws-id"><option value="task">Première tâche sélectionnée</option><option value="prod">Premier produit sélectionné</option></select>
<label for="as-ws-sc">En-tête SecurityContext (seulement si le service le demande)</label><input type="text" id="as-ws-sc" placeholder="Rôle.Organisation.Espace collaboratif">
<div class="bar"><button id="as-ws-go" class="sec">Lire</button></div>
<pre id="as-ws-out">Non testé.</pre></details>
`;

var STORE_KEY = 'bd_assoc4d_v1', DATES_KEY = 'bd_assoc4d_dates_v1', PREFS_KEY = 'bd_assoc4d_prefs_v1';
var MAX_LINKS = 5000, DEDUPE_MS = 500;
var PROD_MAX = 200, PUB_MAX = 300, TASK_MAX = 50, UNH_MAX = 60;
var OWN_APP = 'ASSOC4D_AP', REACT_MS = 3000, PUB_TOPIC = 'DS/ENO/select';
var OBS_MS = 30000, OBS_MAX_TOPICS = 120;
var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
var MODES = { built: 'construit à ce jour', run: 'en cours seulement', todo: 'à venir seulement' };

/* Plateforme déduite de l'adresse de la page (ex. r1132101217487-eu1-ifwe... -> R1132101217487) */
var PLAT = (function () { var m = /^((?:oi|r)\d{6,})-/i.exec(location.hostname || ''); return m ? m[1].toUpperCase() : ''; })();
var UNH_NOISE = /NGFilter|Frame3DXInfra|properties:|GetFilterSpec|volatileSubscription|\.im\.ds\.com|widget\.vc\.ds\.com|viewpoint|appProxyReady|sessionContent|LinkBIProxy|SyncFeatures|XApp\.Magic|onAppReady|preferenceModification|NGF_lnkUnlnk/i;

var state = { products: [], tasks: [], prodDesel: false, taskDesel: false, prodAt: '', taskAt: '' };
var links = [];
var taskDates = {};
var labelCache = {}, typeCache = {};
var seen = {};
var unhandled = {};
var pendingEmptyProd = null, pendingUnTask = null;
var drops = 0, lastDropHost = '', lastDropSig = '', lastDropAt = 0;
var dnd = { enter: 0, over: 0, drop: 0, mod: 0, types: {}, lastTypes: '', lastEnterAt: '', last: '', platform: 'non testé' };
var platform = null, subs = [];
var diag = { msgs: 0, ignored: 0, sel: 0, task: 0, taskShape: '', taskItemShape: '', platform: 'non chargé', storage: 'non testé', space: '', spaceSource: '', compass: 'non lancé' };
/* publication */
var ownUids = {}, ownUidCount = 0, lastTenant = '';
var pub = null, pubUntil = 0, lastPubSig = null;
var cmpA = null, cmpText = '';
var datesSig = '';
/* lecture 4D */
var play = { on: false, timer: null, lastMsg: '' };
/* observation complète */
var full = { on: false, start: 0, topics: {}, order: [], total: 0, other: 0, over: 0, timer: null, tick: null, text: '' };

/* ---------- utilitaires ---------- */
/* Élément factice si un élément manque (sécurité) : évite de planter. */
var ghosts = {};
function el(id) {
  var e = document.getElementById(id);
  if (e) return e;
  return ghosts[id] || (ghosts[id] = document.createElement('div'));
}
function txt(id, s) { var e = el(id); if (e) e.textContent = String(s); }
function nowIso() { return new Date().toISOString(); }
function hhmmss(iso) { return iso ? new Date(iso).toLocaleTimeString('fr-FR') : ''; }
function localDt(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDay(s) { return DAY_RE.test(s || '') ? s.split('-').reverse().join('/') : ''; }
function pad2(n) { return ('0' + n).slice(-2); }
function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function addDays(day, n) { var d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function diffDays(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function clip(x, n) { x = String(x == null ? '' : x); return x.length > n ? x.slice(0, n) + '…' : x; }
function str(x, n) { return typeof x === 'string' || typeof x === 'number' ? clip(x, n || 120) : ''; }
function add(parent, tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; parent.appendChild(e); return e; }
function clearEl(e) { while (e && e.firstChild) e.removeChild(e.firstChild); }
function shortId(id) { id = String(id); return id.length > 14 ? id.slice(0, 6) + '…' + id.slice(-4) : id; }
function setMsg(s) { txt('as-msg', s); }
function keys(x) { try { return Object.keys(x || {}).slice(0, 30).join(', '); } catch (e) { return 'indisponible'; } }
function idOf(it) { return it ? str(it.objectId || it.id || it.physicalId || it.physicalid || it.identifier || '', 80) : ''; }
function isTaskItem(it) { return it && /task/i.test(str(it.objectType || it.type, 40)); }
function envMismatch(t) { return !!(t && t.env && PLAT && String(t.env).toUpperCase() !== PLAT); }
/* D'après tes essais : les tâches créées dans le Gantt arrivent avec le type « Task », celles créées dans
   Collaborative Tasks avec « dsplan:Task ». Observé sur trois tâches seulement : avertissement, pas blocage. */
function isCollabType(t) { return !!(t && /^dsplan:/i.test(t.type || '')); }
function uuid() {
  try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}
function normTopic(t) {
  return String(t)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/[A-Za-z0-9]{20,}/g, '<id>')
    .replace(/\d{6,}/g, '<n>')
    .replace(/ \/ [a-z0-9_-]*\d[a-z0-9_-]*$/, ' / <identifiant>') /* sujet réduit à un mot minuscule avec chiffre : souvent un identifiant utilisateur */
    .slice(0, 100);
}

/* Noms de champs seulement (diagnostic) */
function shape(o, depth) {
  try {
    if (Array.isArray(o)) return '[]';
    if (o && typeof o === 'object') {
      return Object.keys(o).slice(0, 16).map(function (k) {
        var n = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/.test(k) ? '<id>' : clip(k, 30);
        return depth > 0 && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? n + '{' + shape(o[k], depth - 1) + '}' : n;
      }).join(',');
    }
    return typeof o;
  } catch (e) { return '?'; }
}

/* Attributs d'un nœud tels que reçus : on ne garde que des valeurs simples (texte, nombre, booléen) */
function cleanAttr(a) {
  var out = {};
  if (!a || typeof a !== 'object' || Array.isArray(a)) return out;
  Object.keys(a).slice(0, 12).forEach(function (k) {
    var v = a[k], key = clip(k, 30);
    if (typeof v === 'string') out[key] = clip(v, 120);
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
  });
  return out;
}

function originOk(o) {
  if (location.protocol === 'file:') return true; /* essais locaux uniquement */
  try { return o === location.origin || /(^|\.)3ds\.com$/i.test(new URL(o).hostname); } catch (e) { return false; }
}

function seenRecently(key) {
  var now = Date.now();
  if (seen[key] && now - seen[key] < 10000) return true;
  seen[key] = now;
  var ks = Object.keys(seen);
  if (ks.length > 400) ks.forEach(function (k) { if (now - seen[k] > 10000) delete seen[k]; });
  return false;
}

function appOfBody(body) {
  try {
    if (body && body.metadata) return str(body.metadata.xappid || String(body.metadata.appid || '').replace(/^\//, ''), 40);
    if (body && typeof body.source === 'string') return str(body.source, 40);
  } catch (e) {}
  return '';
}

/* ---------- réception des messages ---------- */
var diagTimer = null;
function scheduleDiag() {
  if (diagTimer) return;
  diagTimer = setTimeout(function () { diagTimer = null; renderDiag(); renderPub(); }, 500);
}

function noteUnhandled(label, body) {
  if (UNH_NOISE.test(label)) return;
  var app = appOfBody(body);
  var nt = normTopic(label) + (app ? ' [' + app + ']' : ''), u = unhandled[nt];
  if (!u) {
    if (Object.keys(unhandled).length >= UNH_MAX) return;
    u = unhandled[nt] = { count: 0, last: '', shape: '' };
    try { u.shape = shape(body && body.data !== undefined ? body.data : body, 1); } catch (e) {}
  }
  u.count++; u.last = nowIso();
}

/* ---------- observation complète : tout est noté, sauf les valeurs ---------- */
function fullRecord(key, shapeText, used) {
  var t = full.topics[key];
  if (!t) {
    if (full.order.length >= OBS_MAX_TOPICS) { full.over++; return; }
    t = full.topics[key] = { n: 0, first: Date.now() - full.start, shape: shapeText, used: false };
    full.order.push(key);
  }
  t.n++; if (used) t.used = true;
}
function fullNoteBus(label, body, used) {
  if (!full.on) return;
  full.total++;
  var app = appOfBody(body), shp = '';
  try { shp = shape(body, 1); } catch (e) {}
  fullRecord(normTopic(label) + (app ? ' [' + app + ']' : ''), shp, used);
}
function fullNoteOther(d) {
  if (!full.on) return;
  full.total++; full.other++;
  var label = 'postMessage / autre', shp = typeof d;
  try {
    if (d && typeof d === 'object') {
      label = 'postMessage / ' + clip(d.type || '(sans type)', 40);
      var ev = d.payload && d.payload.event ? String(d.payload.event) : '';
      var a0 = d.payload && d.payload.data && d.payload.data.args && d.payload.data.args[0];
      if (ev) label += ' / ' + clip(ev, 40);
      if (typeof a0 === 'string' && /^(on[A-Z]\w{0,40}|launchWidget)$/.test(a0)) label += ' / ' + a0;
      shp = shape(d, 1);
    }
  } catch (e) {}
  fullRecord(normTopic(label), shp, false);
}
function fullBuildText() {
  var L = [];
  L.push((full.on ? 'Observation en cours' : 'Observation terminée') + ' : ' + full.total + ' message(s) reçus, ' + full.order.length + ' sujet(s) distinct(s)' + (full.over ? ' (+' + full.over + ' message(s) de sujets au-delà de ' + OBS_MAX_TOPICS + ')' : '') + '.');
  if (!full.order.length) { L.push('Aucun message reçu pendant l\'observation.'); return L.join('\n'); }
  L.push('Légende : +temps de première apparition | sujet [application] ×nombre (utilisé = pris en compte par ce widget) | champs : noms seulement');
  full.order.forEach(function (k) {
    var t = full.topics[k];
    L.push('+' + (t.first / 1000).toFixed(1) + ' s | ' + k + ' ×' + t.n + (t.used ? ' (utilisé)' : '') + ' | champs : ' + clip(t.shape, 200));
  });
  return L.join('\n');
}
function fullRender() { full.text = fullBuildText(); txt('as-full-out', full.text); }
function fullStart() {
  if (full.timer) clearTimeout(full.timer);
  if (full.tick) clearInterval(full.tick);
  full = { on: true, start: Date.now(), topics: {}, order: [], total: 0, other: 0, over: 0, timer: null, tick: null, text: '' };
  txt('as-full-msg', ' Observation en cours : agir maintenant dans le dashboard (30 s restantes).');
  fullRender();
  full.tick = setInterval(function () {
    var left = Math.max(0, Math.ceil((OBS_MS - (Date.now() - full.start)) / 1000));
    txt('as-full-msg', ' Observation en cours : ' + left + ' s restantes.'); fullRender();
  }, 500);
  full.timer = setTimeout(function () { fullStop(true); }, OBS_MS);
}
function fullStop(auto) {
  if (!full.on) { txt('as-full-msg', ' Aucune observation en cours.'); return; }
  full.on = false;
  if (full.timer) { clearTimeout(full.timer); full.timer = null; }
  if (full.tick) { clearInterval(full.tick); full.tick = null; }
  fullRender();
  txt('as-full-msg', auto ? ' Observation terminée (30 s).' : ' Observation arrêtée.');
  renderDiag();
}

function onMessage(e) {
  diag.msgs++;
  scheduleDiag();
  if (!originOk(e.origin)) { diag.ignored++; return; }
  var d = e.data;
  if (d && typeof d === 'object' && d.type === 'MessageBus:publish' && d.options) {
    var topic = String(d.options.topic || ''), label = (d.options.channel || '?') + ' / ' + topic;
    var used = route(topic, d.options.data);
    if (!used) noteUnhandled(label, d.options.data);
    fullNoteBus(label, d.options.data, used);
  } else if (full.on) fullNoteOther(d);
}

/* retourne true si le message a été utilisé */
function route(topic, body) {
  if (!body || typeof body !== 'object') return false;
  var src = str(body.source, 40);
  var items = body.data && Array.isArray(body.data.items) ? body.data.items : null;
  if (/(^|\/)ENOTASK_AP\.(select|unselect)$/.test(topic) || (items && (src === 'ENOTASK_AP' || items.some(isTaskItem)))) {
    handleTask(topic, body);
    return true;
  }
  if (body.data && Array.isArray(body.data.paths)) { handleSelection(body); return true; }
  return false;
}

function handleSelection(body) {
  var dd = body.data, md = body.metadata || {}, uid = md.uid ? String(md.uid) : '';
  /* message émis par ce widget : on le reconnaît, on ne le traite pas comme une sélection */
  if (uid && ownUids[uid]) { if (pub) { pub.echo++; renderPub(); scheduleDiag(); } return; }
  if (uid && seenRecently('S|' + uid)) return;
  var app = str(md.xappid || String(md.appid || '').replace(/^\//, ''), 40);
  if (typeof dd.tenant === 'string' && dd.tenant) lastTenant = clip(dd.tenant, 40);
  var attrs = dd.attributes && typeof dd.attributes === 'object' ? dd.attributes : {};
  Object.keys(attrs).forEach(function (id) {
    var a = attrs[id];
    if (a && typeof a.label === 'string' && a.label) labelCache[id] = clip(a.label, 120);
    if (a && typeof a.type === 'string' && a.type) typeCache[id] = clip(a.type, 40);
  });
  diag.sel++;
  /* pendant la fenêtre qui suit une publication : on note qui réagit, sans toucher à la sélection du widget */
  if (pub && Date.now() < pubUntil && app !== OWN_APP) {
    var r = pub.reacted[app || '?'] || (pub.reacted[app || '?'] = { n: 0, paths: 0 });
    r.n++; if (dd.paths.length) r.paths++;
    renderPub(); scheduleDiag();
    return;
  }
  if (!dd.paths.length) {
    /* Un message vide précède souvent une nouvelle sélection : on attend avant de le considérer comme une désélection. */
    if (pendingEmptyProd) clearTimeout(pendingEmptyProd);
    pendingEmptyProd = setTimeout(function () { pendingEmptyProd = null; if (state.products.length) { state.prodDesel = true; render(); } }, 700);
    return;
  }
  if (pendingEmptyProd) { clearTimeout(pendingEmptyProd); pendingEmptyProd = null; }
  var prods = [];
  dd.paths.forEach(function (ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    var sids = ids.slice(0, 30).map(String), last = sids[sids.length - 1], a = attrs[last] || {};
    prods.push({
      id: last, type: str(a.type, 40), label: str(a.label, 120),
      /* Le dernier identifiant désigne la référence : plusieurs emplacements peuvent la partager.
         L'emplacement (l'instance) est identifié par le chemin complet. */
      key: sids.join('/'),
      fromSel: true,
      pathIds: sids,
      pathLabels: sids.map(function (id) { var x = attrs[id] || {}; return str(x.label, 120); }),
      pathTypes: sids.map(function (id) { var x = attrs[id] || {}; return str(x.type, 40) || typeCache[id] || ''; }),
      pathAttrs: sids.map(function (id) { return cleanAttr(attrs[id]); })
    });
  });
  if (!prods.length) return;
  state.products = prods.slice(0, PROD_MAX); state.prodDesel = false; state.prodAt = nowIso();
  render();
}

function taskOf(it, body, via) {
  return {
    id: idOf(it), type: str(it.objectType || it.type, 40), label: str(it.displayName || it.label || it.title || it.name, 120),
    source: str(it.source || (body && body.source), 40), env: str(it.envId, 40), state: str(it.objectState, 40), via: via
  };
}

function handleTask(topic, body) {
  var isUn = /unselect$/.test(topic);
  var items = body.data && Array.isArray(body.data.items) ? body.data.items : [];
  diag.task++;
  diag.taskShape = shape(body, 2);
  if (items[0]) diag.taskItemShape = shape(items[0], 1);
  var key = 'T|' + topic + '|' + items.map(idOf).join(',') + '|' + Math.floor(Date.now() / DEDUPE_MS);
  if (seenRecently(key)) return;
  if (isUn || !items.length) {
    /* « unselect » précède normalement « select » : on attend avant de marquer la désélection. */
    if (pendingUnTask) clearTimeout(pendingUnTask);
    pendingUnTask = setTimeout(function () { pendingUnTask = null; if (state.tasks.length) { state.taskDesel = true; render(); } }, 700);
    return;
  }
  if (pendingUnTask) { clearTimeout(pendingUnTask); pendingUnTask = null; }
  var tasks = items.map(function (it) { return taskOf(it, body, 'sélection'); }).filter(function (t) { return t.id; });
  if (!tasks.length) { render(); return; }
  state.tasks = tasks.slice(0, TASK_MAX); state.taskDesel = false; state.taskAt = nowIso();
  render();
}

/* ---------- associations ---------- */
function prodLabel(p) { return p.label || labelCache[p.id] || ''; }
function prodPath(p) {
  var parts = p.pathIds.map(function (id, i) { return p.pathLabels[i] || labelCache[id] || ''; }).filter(Boolean);
  return parts.join(' › ') || '…';
}
function prodKey(p) { return p.key || p.id; }
/* Produit issu d'un dépôt : on ne connaît pas son emplacement. Un produit sélectionné à la racine
   (chemin d'un seul niveau) a, lui, un emplacement connu. */
function noLocation(p) { return p.fromSel === false; }

/* Un produit est identifié par son emplacement (chemin complet d'identifiants).
   Les anciennes associations (sans chemin d'identifiants) sont reconnues par référence + chemin lisible identique. */
function prodMatches(l, p) {
  if (l.pkey) return l.pkey === prodKey(p);
  return l.pid === p.id && (l.ppath || '') === prodPath(p);
}
function sameLink(a, b) {
  if (a.tid !== b.tid) return false;
  if (a.pkey && b.pkey) return a.pkey === b.pkey;
  return a.pid === b.pid && (a.ppath || '') === (b.ppath || '');
}
function findLink(c) {
  for (var i = 0; i < links.length; i++) {
    if (sameLink(links[i], c)) {
      if (!links[i].pkey && c.pkey) links[i].pkey = c.pkey;
      /* une association refaite depuis une sélection complète les informations manquantes d'une ancienne ligne */
      if (c.src === 'sel' && links[i].src !== 'sel') { links[i].src = 'sel'; if (c.pa && c.pa.length) links[i].pa = c.pa; if (c.pt && c.pt.length) links[i].pt = c.pt; if (c.pl && c.pl.length) links[i].pl = c.pl; }
      return i;
    }
  }
  return -1;
}
/* Un produit déposé (sans emplacement) ne doit pas doubler un lien déjà fait sur un emplacement précis de la même référence */
function coveredByLocated(p, tid) {
  if (!noLocation(p)) return false;
  return links.some(function (l) { return l.tid === tid && l.pid === p.id && l.src !== 'drop' && l.pkey && l.pkey !== l.pid; });
}

function associate() {
  if (!state.products.length || !state.tasks.length) { setMsg('Sélectionner d\'abord au moins un produit et une tâche.'); return; }
  var n = 0, dup = 0, cov = 0, full2 = false, foreign = state.tasks.some(envMismatch), collab = state.tasks.some(isCollabType);
  state.tasks.forEach(function (t) {
    state.products.forEach(function (p) {
      if (coveredByLocated(p, t.id)) { cov++; return; }
      var c = {
        pid: p.id, pkey: prodKey(p), ptype: p.type, plabel: prodLabel(p), ppath: prodPath(p),
        pt: (p.pathTypes || []).slice(), pl: p.pathLabels.map(function (lab, i) { return lab || labelCache[p.pathIds[i]] || ''; }),
        pa: (p.pathAttrs || []).map(cleanAttr), src: noLocation(p) ? 'drop' : 'sel',
        tid: t.id, ttype: t.type, tlabel: t.label, tsrc: t.source, tstate: t.state, plat: PLAT, at: nowIso()
      };
      if (findLink(c) >= 0) { dup++; return; }
      if (links.length >= MAX_LINKS) { full2 = true; return; }
      links.push(c); n++;
    });
  });
  save();
  setMsg(n + ' association(s) créée(s)' + (dup ? ', ' + dup + ' déjà existante(s)' : '') +
    (cov ? ', ' + cov + ' ignorée(s) : produit déposé sans emplacement, déjà lié sur un emplacement précis (sélectionner le produit dans l\'arborescence)' : '') +
    (full2 ? ' ; limite de ' + MAX_LINKS + ' atteinte' : '') +
    (foreign ? ' ⚠ tâche d\'une autre plateforme que celle de la page : vérifier.' : '') +
    (collab ? ' ⚠ tâche de type dsplan:Task (probablement créée dans Collaborative Tasks, hors Gantt).' : (foreign ? '' : '.')));
  render();
}

function removeLink(l) {
  var i = links.indexOf(l);
  if (i >= 0) { links.splice(i, 1); save(); render(); }
}

/* ---------- dates des tâches ---------- */
function validDay(s) { return typeof s === 'string' && DAY_RE.test(s) && !isNaN(new Date(s + 'T12:00:00').getTime()); }
function datesWarn(d) { return d && d.s && d.e && d.s > d.e ? '⚠ début après la fin' : ''; }
function setTaskDate(tid, k, v) {
  v = String(v || '');
  if (v && !validDay(v)) return false;
  var d = taskDates[tid] || (taskDates[tid] = {});
  if (v) d[k] = v; else delete d[k];
  if (!d.s && !d.e) delete taskDates[tid];
  saveDates(); renderTimeline(); renderTable(); renderDiag();
  return true;
}
function datesText(tid) {
  var d = taskDates[tid];
  if (!d || (!d.s && !d.e)) return '—';
  return (d.s ? fmtDay(d.s) : '?') + ' → ' + (d.e ? fmtDay(d.e) : '?');
}
function statusOf(d, day) {
  if (!d || !d.s || !d.e) return 'none';
  if (day < d.s) return 'todo';
  if (day > d.e) return 'done';
  return 'run';
}

/* ---------- import CSV des dates ---------- */
function parseCsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  var first = text.split(/\r?\n/, 1)[0] || '', delim = ';', best = -1;
  [';', ',', '\t'].forEach(function (c) { var n = first.split(c).length - 1; if (n > best) { best = n; delim = c; } });
  var rows = [], row = [], cur = '', q = false, i, ch;
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (q) {
      if (ch === '"') { if (text.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (rows.length > 5001) break;
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}
function normHead(s) {
  s = String(s || '').toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function parseDay(v) {
  v = String(v == null ? '' : v).trim();
  if (!v) return '';
  var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ,].*)?$/.exec(v), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[T ,].*)?$/.exec(v);
    if (!m) return '';
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  var dt = new Date(y, mo - 1, d, 12);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return y + '-' + pad2(mo) + '-' + pad2(d);
}
var ID_KEYS = ['tache_id', 'id', 'objectid', 'object_id'];
var TITLE_KEYS = ['tache', 'tache_nom', 'tache_titre', 'titre', 'nom', 'name', 'title', 'task', 'libelle'];
var START_KEYS = ['debut', 'debut_tache', 'start', 'start_date', 'date_debut', 'date_de_debut', 'debut_planifie'];
var END_KEYS = ['fin', 'fin_tache', 'end', 'end_date', 'finish', 'date_fin', 'date_de_fin', 'fin_planifiee'];
function colIndex(head, names) { for (var i = 0; i < head.length; i++) if (names.indexOf(head[i]) >= 0) return i; return -1; }

function importDatesCsv(text, overwrite) {
  var out = el('as-dcsv-out');
  var rows = parseCsv(text);
  if (rows.length < 2) { txt('as-dcsv-out', 'Rien à importer : il faut une ligne d\'en-têtes puis au moins une ligne de données.'); return; }
  var head = rows[0].map(normHead);
  var cId = colIndex(head, ID_KEYS), cTi = colIndex(head, TITLE_KEYS), cS = colIndex(head, START_KEYS), cE = colIndex(head, END_KEYS);
  if (cS < 0 && cE < 0) { txt('as-dcsv-out', 'Aucune colonne de dates reconnue (debut, fin). En-têtes lus : ' + clip(head.join(', '), 200)); return; }
  if (cId < 0 && cTi < 0) { txt('as-dcsv-out', 'Aucune colonne de tâche reconnue (tache_id, tache, titre, nom). En-têtes lus : ' + clip(head.join(', '), 200)); return; }
  /* tâches connues : associées ou sélectionnées */
  var known = {}, byTitle = {};
  function know(id, label) {
    if (!id) return;
    if (!known[id]) known[id] = label || '';
    var k = String(label || '').trim().toLowerCase();
    if (k) { var a = byTitle[k] || (byTitle[k] = []); if (a.indexOf(id) < 0) a.push(id); }
  }
  links.forEach(function (l) { know(l.tid, l.tlabel); });
  state.tasks.forEach(function (t) { know(t.id, t.label); });
  var upd = {}, kept = 0, notFound = [], ambiguous = [], bad = 0, empty = 0, order = 0, nrows = 0;
  rows.slice(1, 5001).forEach(function (r) {
    nrows++;
    var tid = '', idv = cId >= 0 ? String(r[cId] || '').trim() : '', tv = cTi >= 0 ? String(r[cTi] || '').trim() : '';
    if (idv && known[idv]) tid = idv;
    if (!tid && tv) {
      var set = byTitle[tv.toLowerCase()];
      if (!set) { if (notFound.indexOf(tv) < 0) notFound.push(tv); return; }
      if (set.length > 1) { if (ambiguous.indexOf(tv) < 0) ambiguous.push(tv); return; }
      tid = set[0];
    }
    if (!tid) { if (idv || tv) { var nm = tv || idv; if (notFound.indexOf(nm) < 0) notFound.push(nm); } return; }
    var vs = cS >= 0 ? String(r[cS] || '').trim() : '', ve = cE >= 0 ? String(r[cE] || '').trim() : '';
    var s = vs ? parseDay(vs) : '', e = ve ? parseDay(ve) : '';
    if (vs && !s) bad++;
    if (ve && !e) bad++;
    if (!s && !e) { if (!vs && !ve) empty++; return; }
    var cur = taskDates[tid] || {}, changed = false;
    [['s', s], ['e', e]].forEach(function (p) {
      if (!p[1]) return;
      if (cur[p[0]] && !overwrite) { if (cur[p[0]] !== p[1]) kept++; return; }
      if (cur[p[0]] !== p[1]) { cur[p[0]] = p[1]; changed = true; }
    });
    if (changed) { taskDates[tid] = cur; upd[tid] = 1; if (cur.s && cur.e && cur.s > cur.e) order++; }
  });
  saveDates(); datesSig = ''; render();
  function list(a) { return a.slice(0, 5).map(function (x) { return '« ' + clip(x, 40) + ' »'; }).join(', ') + (a.length > 5 ? ' … (+' + (a.length - 5) + ')' : ''); }
  var L = [];
  L.push(rows.length - 1 + ' ligne(s) lue(s) : dates de ' + Object.keys(upd).length + ' tâche(s) mises à jour.');
  if (kept) L.push(kept + ' date(s) différente(s) déjà saisie(s) conservée(s) (cocher « Écraser » pour les remplacer).');
  if (notFound.length) L.push(notFound.length + ' tâche(s) introuvable(s) parmi les tâches associées ou sélectionnées : ' + list(notFound) + '. Associer ou sélectionner la tâche d\'abord.');
  if (ambiguous.length) L.push(ambiguous.length + ' titre(s) porté(s) par plusieurs tâches, non importé(s) : ' + list(ambiguous) + '. Utiliser une colonne tache_id.');
  if (bad) L.push(bad + ' date(s) illisible(s) ignorée(s) (formats : jj/mm/aaaa ou aaaa-mm-jj).');
  if (order) L.push('⚠ ' + order + ' tâche(s) avec un début après la fin.');
  if (rows.length - 1 > 5000) L.push('Seules les 5000 premières lignes ont été lues.');
  txt('as-dcsv-out', L.join('\n'));
}

/* ---------- stockage ---------- */
function validLink(l) {
  return l && typeof l === 'object' && typeof l.pid === 'string' && typeof l.tid === 'string' && l.pid && l.tid;
}
function cleanLink(l) {
  return {
    pid: clip(l.pid, 80), pkey: str(l.pkey, 700), ptype: str(l.ptype, 40), plabel: str(l.plabel, 120), ppath: str(l.ppath, 400),
    pt: Array.isArray(l.pt) ? l.pt.slice(0, 30).map(function (x) { return str(x, 40); }) : [],
    pl: Array.isArray(l.pl) ? l.pl.slice(0, 30).map(function (x) { return str(x, 120); }) : [],
    pa: Array.isArray(l.pa) ? l.pa.slice(0, 30).map(cleanAttr) : [],
    src: l.src === 'sel' || l.src === 'drop' ? l.src : '',
    tid: clip(l.tid, 80), ttype: str(l.ttype, 40), tlabel: str(l.tlabel, 120), tsrc: str(l.tsrc, 40), tstate: str(l.tstate, 40), plat: str(l.plat, 40), at: str(l.at, 40)
  };
}
function loadStore() {
  try {
    var s = localStorage.getItem(STORE_KEY);
    if (s) {
      var o = JSON.parse(s);
      if (o && Array.isArray(o.links)) {
        links = o.links.filter(validLink).slice(0, MAX_LINKS).map(cleanLink);
        links.forEach(function (l) { if (!l.plat) l.plat = PLAT; });
      }
    }
    var sd = localStorage.getItem(DATES_KEY);
    if (sd) {
      var od = JSON.parse(sd);
      if (od && od.dates && typeof od.dates === 'object') {
        Object.keys(od.dates).slice(0, MAX_LINKS).forEach(function (tid) {
          var d = od.dates[tid], c = {};
          if (d && validDay(d.s)) c.s = d.s;
          if (d && validDay(d.e)) c.e = d.e;
          if (c.s || c.e) taskDates[clip(tid, 80)] = c;
        });
      }
    }
    diag.storage = 'localStorage disponible';
  } catch (e) { diag.storage = 'localStorage indisponible : exporter régulièrement'; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 4, links: links })); }
  catch (e) { diag.storage = 'écriture impossible : exporter pour ne rien perdre'; }
}
function saveDates() {
  try { localStorage.setItem(DATES_KEY, JSON.stringify({ v: 1, dates: taskDates })); }
  catch (e) { diag.storage = 'écriture impossible : exporter pour ne rien perdre'; }
}
function loadPrefs() {
  try {
    var p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (p && MODES[p.mode]) el('as-play-mode').value = p.mode;
    if (p && ['500', '1000', '2000', '3000', '5000'].indexOf(String(p.speed)) >= 0) el('as-play-speed').value = String(p.speed);
    if (p && typeof p.auto === 'boolean') el('as-play-auto').checked = p.auto;
    if (p && typeof p.clear === 'boolean') el('as-play-clear').checked = p.clear;
  } catch (e) { /* ignoré */ }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: el('as-play-mode').value, speed: el('as-play-speed').value, auto: el('as-play-auto').checked, clear: el('as-play-clear').checked }));
  } catch (e) { /* ignoré */ }
}

/* ---------- export / import ---------- */
function csvCell(v) {
  v = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; /* neutralise les formules */
  return '"' + v.replace(/"/g, '""') + '"';
}
function originText(l) { return l.src === 'sel' ? 'sélection' : l.src === 'drop' ? 'dépôt' : 'inconnue'; }
function toCsv() {
  var rows = [['tache_id', 'tache_nom', 'tache_type', 'produit_id', 'produit_type', 'produit_libelle', 'chemin', 'date_association', 'plateforme', 'tache_source', 'chemin_ids', 'tache_etat', 'debut_tache', 'fin_tache', 'chemin_types', 'origine']];
  links.forEach(function (l) {
    var d = taskDates[l.tid] || {};
    rows.push([l.tid, l.tlabel, l.ttype, l.pid, l.ptype, l.plabel, l.ppath, l.at, l.plat, l.tsrc, l.pkey, l.tstate, d.s || '', d.e || '', (l.pt || []).join('|'), originText(l)]);
  });
  return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
}
function toJson() { return JSON.stringify({ format: 'association-4d', version: 6, platform: PLAT, exported: nowIso(), links: links, taskDates: taskDates }, null, 1); }
function download(name, text, mime) {
  try {
    var blob = new Blob([text], { type: mime }), u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  } catch (e) { txt('as-io-msg', 'Téléchargement impossible ici : utiliser « Copier ».'); }
}
function importText(text) {
  var o;
  try { o = JSON.parse(text); } catch (e) { txt('as-io-msg', 'JSON invalide.'); return; }
  var arr = Array.isArray(o) ? o : (o && Array.isArray(o.links) ? o.links : null);
  var dts = o && !Array.isArray(o) && o.taskDates && typeof o.taskDates === 'object' ? o.taskDates : null;
  if (!arr && !dts) { txt('as-io-msg', 'Aucune liste « links » ni « taskDates » trouvée.'); return; }
  var n = 0, dup = 0, bad = 0, other = 0, nd = 0;
  (arr || []).slice(0, MAX_LINKS).forEach(function (l) {
    if (!validLink(l)) { bad++; return; }
    var c = cleanLink(l);
    if (c.plat && PLAT && c.plat.toUpperCase() !== PLAT) { other++; return; }
    if (!c.plat) c.plat = PLAT;
    if (findLink(c) >= 0) { dup++; return; }
    if (links.length >= MAX_LINKS) return;
    links.push(c); n++;
  });
  if (dts) {
    Object.keys(dts).slice(0, MAX_LINKS).forEach(function (tid) {
      var d = dts[tid]; if (!d || typeof d !== 'object') return;
      var cur = taskDates[clip(tid, 80)] || {}, changed = false;
      if (!cur.s && validDay(d.s)) { cur.s = d.s; changed = true; }
      if (!cur.e && validDay(d.e)) { cur.e = d.e; changed = true; }
      if (changed) { taskDates[clip(tid, 80)] = cur; nd++; }
    });
  }
  save(); saveDates(); datesSig = ''; render();
  txt('as-io-msg', n + ' ajoutée(s), ' + dup + ' déjà présente(s), ' + bad + ' ignorée(s)' + (other ? ', ' + other + ' refusée(s) car d\'une autre plateforme que ' + PLAT : '') + (dts ? ' ; dates de ' + nd + ' tâche(s) ajoutée(s)' : '') + '.');
}

/* ---------- publication : mettre en évidence en 3D ---------- */
function linkNodes(l) {
  var ids = l.pkey ? String(l.pkey).split('/') : [l.pid];
  var types = l.pt && l.pt.length === ids.length ? l.pt : ids.map(function (x, i) { return i === ids.length - 1 ? l.ptype : ''; });
  var labels = l.pl && l.pl.length === ids.length ? l.pl : ids.map(function (x, i) { return i === ids.length - 1 ? l.plabel : ''; });
  var attrs = l.pa && l.pa.length === ids.length ? l.pa : null;
  return { ids: ids, types: types, labels: labels, attrs: attrs };
}

var ownOriginUid = uuid();
/* Format observé dans tes rapports (sélection native) : metadata + data{paths, tenant, attributes, version, changeControl, sharedID, focusOn}.
   Attributs : ceux du message d'origine quand on les a gardés ; sinon type et libellé connus. Identité : ce widget. */
function buildSelectMessage(items) {
  var wid = ''; try { wid = str(window.widget && window.widget.id, 40); } catch (e) {}
  var attrs = {}, paths = [];
  items.forEach(function (n) {
    paths.push(n.ids.slice());
    n.ids.forEach(function (id, i) {
      var a = attrs[id] || (attrs[id] = {});
      var src = n.attrs && n.attrs[i] ? n.attrs[i] : {};
      Object.keys(src).forEach(function (k) { if (a[k] === undefined || a[k] === '') a[k] = src[k]; });
      var ty = n.types[i] || typeCache[id] || '', lb = n.labels[i] || labelCache[id] || '';
      if (ty && !a.type) a.type = ty;
      if (lb && !a.label) a.label = lb;
      if (a.i3dx === undefined) a.i3dx = '';
    });
  });
  return {
    metadata: {
      uid: uuid(), originUid: ownOriginUid, timestamp: Date.now(),
      appid: '/' + OWN_APP, xappid: OWN_APP, originWidgetId: wid || 'assoc4d'
    },
    data: {
      paths: paths, tenant: lastTenant, attributes: attrs, version: '1.1',
      changeControl: {
        version: '1.0', AuthoringContextHeader: null,
        change: { id: '', name: '', context: [], title: '', description: '', severity: '' },
        evolution: { id: '', displayExpression: '', expression: '' }, configurationRevision: null
      },
      sharedID: OWN_APP, focusOn: false
    }
  };
}

/* Structure du message publié : identifiants raccourcis, types, présence d'un libellé, noms de champs. Jamais les libellés. */
function describeMsg(msg) {
  var d = msg.data, L = [];
  L.push('métadonnées : ' + Object.keys(msg.metadata).join(','));
  L.push('données : ' + Object.keys(d).join(','));
  if (!d.paths.length) L.push('chemins : aucun (sélection vidée)');
  d.paths.slice(0, 3).forEach(function (p, k) {
    L.push('chemin ' + (k + 1) + ' (' + p.length + ' niveau' + (p.length > 1 ? 'x' : '') + ') :');
    p.forEach(function (id, i) {
      var a = d.attributes[id] || {};
      L.push('  ' + (i + 1) + '. ' + shortId(id) + ' | type : ' + (a.type || '(aucun)') + ' | libellé : ' + (a.label ? 'oui' : 'non') + ' | champs : ' + Object.keys(a).join(','));
    });
  });
  if (d.paths.length > 3) L.push('… +' + (d.paths.length - 3) + ' autre(s) chemin(s) non détaillé(s)');
  return L.join('\n');
}

function setPubMsg(s) { txt('as-pub-msg', s); txt('as-tbl-msg', s); }

/* Publie les produits des associations `ls` en UN message. Retourne un résultat ; hors lecture, écrit aussi le message à l'écran. */
function publishLinks(ls, what, opts) {
  opts = opts || {};
  var seenK = {}, items = [], skipped = 0, unknown = 0, capped = 0;
  ls.forEach(function (l) {
    if (l.src === 'drop') { skipped++; return; }
    var n = linkNodes(l), k = n.ids.join('/');
    if (seenK[k]) return; seenK[k] = 1;
    if (!l.src && n.ids.length === 1) unknown++;
    items.push(n);
  });
  if (items.length > PUB_MAX) { capped = items.length - PUB_MAX; items = items.slice(0, PUB_MAX); }
  var sig = items.map(function (n) { return n.ids.join('/'); }).sort().join('|');
  var emptyClear = false;
  if (!items.length) {
    if (opts.play) {
      if (lastPubSig === null || lastPubSig === '' || !opts.clearEmpty) return { status: 'skip-empty', skipped: skipped };
      emptyClear = true;
    } else {
      setPubMsg(skipped
        ? 'Rien à publier : ' + skipped + ' association(s) créée(s) par dépôt, donc sans emplacement connu. Sélectionner le produit dans l\'arborescence, supprimer la ligne et refaire l\'association.'
        : 'Rien à publier : aucune association correspondante.');
      return { status: 'none' };
    }
  } else if (opts.play && !opts.force && sig === lastPubSig) return { status: 'same', n: items.length, skipped: skipped, capped: capped };
  if (!platform || typeof platform.publish !== 'function') {
    if (!opts.play) setPubMsg('PlatformAPI indisponible : publication impossible.');
    return { status: 'noplat' };
  }
  var msg = buildSelectMessage(items);
  if (ownUidCount > 50) { ownUids = {}; ownUidCount = 0; }
  ownUids[msg.metadata.uid] = 1; ownUidCount++;
  pub = { at: nowIso(), n: items.length, skipped: skipped, capped: capped, echo: 0, reacted: {}, errors: [], what: what, desc: describeMsg(msg) };
  pubUntil = Date.now() + REACT_MS;
  try { platform.publish(PUB_TOPIC, JSON.parse(JSON.stringify(msg))); } catch (e) { pub.errors.push(PUB_TOPIC + ' : ' + clip(e.message, 60)); }
  lastPubSig = sig;
  if (!opts.play) {
    var levels = items.map(function (n) { return n.ids.length; }).join('+');
    setPubMsg(items.length + ' chemin(s) publié(s) (' + levels + ' niveau(x)). Regarder la vue 3D.' +
      (skipped ? ' ' + skipped + ' ligne(s) ignorée(s) : créées par dépôt.' : '') +
      (capped ? ' ' + capped + ' chemin(s) non publié(s) : limite de ' + PUB_MAX + ' par message.' : '') +
      (unknown ? ' ' + unknown + ' ligne(s) d\'un niveau d\'origine inconnue (sélection ou dépôt) publiée(s) quand même.' : ''));
    setTimeout(function () { renderPub(); renderDiag(); }, REACT_MS + 300);
  }
  renderPub(); renderDiag();
  return { status: 'sent', n: items.length, skipped: skipped, capped: capped, cleared: emptyClear };
}

function pubText() {
  if (!pub) return 'aucune publication depuis l\'ouverture du widget.';
  var open = Date.now() < pubUntil;
  var re = Object.keys(pub.reacted).map(function (k) { return k + ' ×' + pub.reacted[k].n + ' (' + pub.reacted[k].paths + ' avec chemin)'; }).join(', ');
  return hhmmss(pub.at) + ' — ' + pub.what + ' : ' + pub.n + ' chemin(s) sur ' + PUB_TOPIC +
    (pub.skipped ? ', ' + pub.skipped + ' ignoré(s) créé(s) par dépôt' : '') +
    (pub.capped ? ', ' + pub.capped + ' non publié(s) (limite)' : '') +
    '\n  écho de notre message : ×' + pub.echo +
    '\n  réactions d\'autres applications' + (open ? ' (fenêtre encore ouverte)' : ' en ' + (REACT_MS / 1000) + ' s') + ' : ' + (re || 'aucune sélection émise') +
    (pub.errors.length ? '\n  erreurs : ' + pub.errors.join(' ; ') : '') +
    (!open && !re ? '\n  Une absence de message en retour ne prouve rien : un surlignage 3D peut avoir lieu sans message.' : '');
}
function renderPub() {
  txt('as-pub-sum', pub ? pubText() : 'Aucune publication.');
  txt('as-pub-last', pub ? pub.desc : 'Aucun message publié.');
}

/* ---------- lecture 4D ---------- */
function curDay() { var d = el('as-simdate').value; return validDay(d) ? d : ''; }
function planBounds() {
  var s = '', e = '', seenT = {};
  links.forEach(function (l) {
    if (seenT[l.tid]) return; seenT[l.tid] = 1;
    var d = taskDates[l.tid];
    if (!d || !d.s || !d.e) return;
    if (!s || d.s < s) s = d.s;
    if (!e || d.e > e) e = d.e;
  });
  return s && e ? { s: s, e: e } : null;
}
function playRange() {
  var f = el('as-play-from').value, t = el('as-play-to').value, b = planBounds();
  var from = validDay(f) ? f : (b ? b.s : ''), to = validDay(t) ? t : (b ? b.e : '');
  if (!from || !to) return null;
  if (from > to) return { err: 'Le début de la plage est après sa fin.' };
  return { from: from, to: to };
}
function daySet(day, mode) {
  var c = { run: 0, done: 0, todo: 0, none: 0 }, sel = [];
  links.forEach(function (l) {
    var st = statusOf(taskDates[l.tid], day);
    c[st]++;
    if (mode === 'run' ? st === 'run' : mode === 'built' ? (st === 'run' || st === 'done') : st === 'todo') sel.push(l);
  });
  return { counts: c, links: sel };
}
function speedMs() { return Math.max(100, Number(el('as-play-speed').value) || 1000); }
function setPlayMsg(s) { play.lastMsg = s; txt('as-play-msg', s); }

function renderTimeline() {
  var day = curDay(), btn = el('as-play');
  btn.textContent = play.on ? '⏸ Pause' : '▶ Lecture';
  btn.className = 'big' + (play.on ? ' on' : '');
  if (!day) { txt('as-sim-sum', 'Choisir une date.'); el('as-play-bar').value = 0; return; }
  var mode = el('as-play-mode').value, ds = daySet(day, mode), c = ds.counts, seenK = {}, n = 0;
  ds.links.forEach(function (l) { if (l.src !== 'drop' && !seenK[l.pkey || l.pid]) { seenK[l.pkey || l.pid] = 1; n++; } });
  txt('as-sim-sum', links.length
    ? 'Au ' + fmtDay(day) + ' : en cours ' + c.run + ' · terminées ' + c.done + ' · à venir ' + c.todo + ' · sans dates ' + c.none + ' (association(s)). Affichage « ' + (MODES[mode] || mode) + ' » : ' + n + ' produit(s).'
    : 'Aucune association enregistrée.');
  var r = playRange(), v = 0;
  if (r && !r.err && r.to > r.from) v = Math.max(0, Math.min(100, Math.round(diffDays(r.from, day) / diffDays(r.from, r.to) * 100)));
  el('as-play-bar').value = v;
}

function publishDay(day, force) {
  var mode = el('as-play-mode').value, ds = daySet(day, mode);
  var res = publishLinks(ds.links, 'lecture au ' + fmtDay(day) + ' (' + (MODES[mode] || mode) + ')', { play: true, force: !!force, clearEmpty: el('as-play-clear').checked });
  var m = fmtDay(day) + ' : ';
  if (res.status === 'sent') m += res.n ? res.n + ' produit(s) publié(s)' : 'sélection vidée (rien à montrer)';
  else if (res.status === 'same') m += 'inchangé (' + res.n + ' produit(s))';
  else if (res.status === 'skip-empty') m += 'rien à montrer' + (res.skipped ? ' (' + res.skipped + ' association(s) créée(s) par dépôt, non publiables)' : '');
  else if (res.status === 'noplat') { pausePlay(); m += 'PlatformAPI indisponible : publication impossible'; setPlayMsg(m); return res; }
  if (res.skipped && res.status !== 'skip-empty') m += ' ; ' + res.skipped + ' ignoré(s) (dépôt)';
  if (res.capped) m += ' ; ' + res.capped + ' non publié(s) : limite de ' + PUB_MAX;
  setPlayMsg(m + (play.on ? ' — lecture en cours' : ''));
  return res;
}
function setDay(day, publish) {
  el('as-simdate').value = day;
  renderTimeline();
  if (publish) publishDay(day);
}
function pausePlay(msg) {
  if (play.timer) { clearTimeout(play.timer); play.timer = null; }
  var was = play.on;
  play.on = false;
  renderTimeline();
  if (msg && was) setPlayMsg(msg);
}
function playTick() {
  play.timer = null;
  if (!play.on) return;
  var r = playRange(), cur = curDay();
  if (!r || r.err || !cur) { pausePlay(); return; }
  var next = addDays(cur, 1);
  if (next > r.to) { pausePlay('Fin de la plage atteinte (' + fmtDay(r.to) + ').'); return; }
  setDay(next, false);
  var res = publishDay(next);
  if (!play.on || (res && res.status === 'noplat')) return;
  play.timer = setTimeout(playTick, speedMs());
}
function startPlay() {
  var r = playRange();
  if (!r) { setPlayMsg('Saisir des dates de début et de fin pour au moins une tâche associée, ou renseigner la plage ci-dessus.'); return; }
  if (r.err) { setPlayMsg(r.err); return; }
  if (!platform || typeof platform.publish !== 'function') { setPlayMsg('PlatformAPI indisponible : publication impossible.'); return; }
  var cur = curDay();
  if (!cur || cur < r.from || cur >= r.to) cur = r.from;
  play.on = true;
  setDay(cur, false);
  var res = publishDay(cur);
  if (!play.on || (res && res.status === 'noplat')) return;
  if (cur >= r.to) { pausePlay('Fin de la plage atteinte (' + fmtDay(r.to) + ').'); return; }
  play.timer = setTimeout(playTick, speedMs());
}
function fitRange() {
  var b = planBounds();
  if (!b) { setPlayMsg('Aucune tâche associée n\'a à la fois un début et une fin.'); return; }
  el('as-play-from').value = b.s; el('as-play-to').value = b.e;
  setPlayMsg('Plage calée sur les tâches associées : du ' + fmtDay(b.s) + ' au ' + fmtDay(b.e) + '.');
  renderTimeline();
}
function jump(which) {
  var r = playRange();
  if (!r || r.err) { setPlayMsg(r && r.err ? r.err : 'Saisir des dates pour définir la plage.'); return; }
  pausePlay();
  setDay(which === 'first' ? r.from : r.to, el('as-play-auto').checked);
}
function stepDay(n) {
  pausePlay();
  var day = curDay() || todayIso();
  setDay(addDays(day, n), el('as-play-auto').checked);
}

/* ---------- comparaison de deux produits ---------- */
function compareProducts(a, b) {
  var lines = [], n = Math.max(a.pathIds.length, b.pathIds.length), diffLv = [];
  lines.push('A : ' + (prodLabel(a) || '(sans libellé)') + ' — ' + a.pathIds.length + ' niveau(x)');
  lines.push('B : ' + (prodLabel(b) || '(sans libellé)') + ' — ' + b.pathIds.length + ' niveau(x)');
  for (var i = 0; i < n; i++) {
    var ia = a.pathIds[i], ib = b.pathIds[i];
    var lab = (a.pathLabels[i] || labelCache[ia] || b.pathLabels[i] || labelCache[ib] || '');
    var st = !ia || !ib ? 'absent d\'un côté' : ia === ib ? 'identique' : 'DIFFÉRENT';
    if (ia && ib && ia !== ib) diffLv.push(i + 1);
    lines.push('  niveau ' + (i + 1) + ' : ' + shortId(ia || '-') + ' | ' + shortId(ib || '-') + ' → ' + st + (lab ? ' (' + lab + ')' : ''));
  }
  var v;
  if (prodKey(a) === prodKey(b)) v = 'Même emplacement : chemins d\'identifiants identiques.';
  else if (a.id === b.id) v = 'Même référence, emplacements différents : distingués par le chemin' + (diffLv.length ? ' (niveau(x) ' + diffLv.join(', ') + ')' : '') + '. Le widget crée bien deux associations distinctes.';
  else v = 'Références différentes (dernier identifiant différent).';
  if (noLocation(a) || noLocation(b)) v += ' ⚠ Au moins un des deux vient d\'un dépôt (emplacement inconnu) : comparaison peu informative.';
  lines.push('→ ' + v);
  cmpText = lines.join('\n');
  txt('as-cmp', cmpText);
  renderDiag();
}

/* ---------- affichage ---------- */
function renderSel(boxId, noteId, items, isTask, desel, at) {
  var box = el(boxId); clearEl(box);
  if (!items.length) {
    add(box, 'div', isTask ? 'Ouvrir une tâche du Gantt dans Collaborative Tasks, ou la glisser dans ce widget.' : 'Sélectionner un produit dans l\'arborescence ou la vue 3D.', 'hint');
    txt(noteId, '');
    return;
  }
  items.slice(0, 6).forEach(function (it) {
    var d = add(box, 'div', null, 'it' + (isTask ? ' t' : '') + (isTask && isCollabType(it) ? ' off' : ''));
    var label = isTask ? it.label : prodLabel(it);
    add(d, 'b', (it.type ? it.type + ' · ' : '') + (label || '(libellé inconnu)'));
    var sub = isTask
      ? 'Source : ' + (it.source || '?') + ' (' + (it.via || 'sélection') + ')' + (it.state ? ' · état : ' + it.state : '') + ' — ' + shortId(it.id)
      : prodPath(it) + ' — ' + shortId(it.id) + (noLocation(it) ? ' (emplacement inconnu : dépôt)' : (it.pathIds.length === 1 ? ' (racine)' : ''));
    add(d, 'div', sub, 'sub');
  });
  if (items.length > 6) add(box, 'div', '+ ' + (items.length - 6) + ' autre(s)', 'hint');
  var note = el(noteId);
  clearEl(note);
  if (isTask && items.some(envMismatch)) add(note, 'span', '⚠ Plateforme de la tâche (' + items.filter(envMismatch)[0].env + ') différente de celle de la page (' + PLAT + '). ', 'warn');
  if (isTask && items.some(isCollabType)) add(note, 'span', '⚠ Type dsplan:Task : tâche probablement créée dans Collaborative Tasks, donc hors planning du Gantt. ', 'warn');
  note.appendChild(document.createTextNode((desel ? 'Désélectionné — dernier choix conservé. ' : '') + 'Reçu à ' + hhmmss(at) + (items.length > 1 ? ' · ' + items.length + ' éléments' : '')));
}

/* « Pieu guide (Semelle P2) » : distingue les emplacements d'une même référence */
function whereLabel(l) {
  var name = l.plabel || shortId(l.pid), parts = String(l.ppath || '').split(' › ');
  return parts.length > 1 && parts[parts.length - 2] && parts[parts.length - 2] !== '…' ? name + ' (' + parts[parts.length - 2] + ')' : name;
}

function renderLinks() {
  var box = el('as-links'); clearEl(box);
  var any = false;
  state.products.slice(0, 5).forEach(function (p) {
    var ls = links.filter(function (l) { return prodMatches(l, p); });
    var others = links.filter(function (l) { return l.pid === p.id && !prodMatches(l, p); }).length;
    var t = ls.length ? 'lié à ' + ls.length + ' tâche(s) : ' + ls.slice(0, 4).map(function (l) { return l.tlabel || shortId(l.tid); }).join(', ') + (ls.length > 4 ? '…' : '') : 'aucune association';
    if (others) t += ' (+' + others + ' lien(s) sur d\'autres emplacements de la même référence)';
    add(box, 'div', '🔹 ' + (prodLabel(p) || shortId(p.id)) + ' → ' + t); any = true;
  });
  state.tasks.slice(0, 5).forEach(function (tk) {
    var ls = links.filter(function (l) { return l.tid === tk.id; });
    var t = ls.length ? ls.length + ' produit(s) : ' + ls.slice(0, 6).map(whereLabel).join(', ') + (ls.length > 6 ? '…' : '') : 'aucun produit associé';
    add(box, 'div', '🔸 ' + (tk.label || shortId(tk.id)) + ' → ' + t); any = true;
  });
  if (!any) add(box, 'span', '—', 'hint');
}

function renderTable() {
  var tb = el('as-rows'); clearEl(tb);
  var curT = {};
  state.tasks.forEach(function (t) { curT[t.id] = 1; });
  var sorted = links.slice().sort(function (a, b) { return (a.tlabel || '').localeCompare(b.tlabel || '') || (a.plabel || '').localeCompare(b.plabel || '') || (a.ppath || '').localeCompare(b.ppath || ''); });
  txt('as-count', '(' + links.length + ')');
  if (!sorted.length) {
    var tr0 = add(tb, 'tr'); var td0 = add(tr0, 'td', 'Aucune association pour l\'instant.', 'hint'); td0.colSpan = 7; return;
  }
  sorted.slice(0, 300).forEach(function (l) {
    var cur = curT[l.tid] || state.products.some(function (p) { return prodMatches(l, p); });
    var tr = add(tb, 'tr', null, cur ? 'cur' : '');
    add(tr, 'td', (l.tlabel || shortId(l.tid)) + (/^dsplan:/i.test(l.ttype || '') ? ' ⚠' : ''));
    add(tr, 'td', l.plabel || shortId(l.pid));
    add(tr, 'td', l.ptype);
    add(tr, 'td', l.ppath + (l.src === 'drop' ? ' (dépôt)' : ''));
    add(tr, 'td', datesText(l.tid));
    add(tr, 'td', localDt(l.at));
    var td = add(tr, 'td');
    var eye = add(td, 'button', '👁', 'eye'); eye.title = 'Mettre en évidence ce produit dans les vues 3D';
    eye.onclick = function () { publishLinks([l], 'une association'); };
    var b = add(td, 'button', '✕', 'del'); b.title = 'Supprimer cette association';
    b.onclick = function () { removeLink(l); };
  });
  if (sorted.length > 300) { var tr1 = add(tb, 'tr'); var td1 = add(tr1, 'td', '… ' + (sorted.length - 300) + ' autres (visibles dans l\'export)', 'hint'); td1.colSpan = 7; }
}

function renderDates() {
  var map = {}, rows = [];
  links.forEach(function (l) {
    if (!map[l.tid]) { map[l.tid] = { id: l.tid, label: l.tlabel, type: l.ttype, n: 0 }; rows.push(map[l.tid]); }
    map[l.tid].n++;
  });
  state.tasks.forEach(function (t) {
    if (!map[t.id]) { map[t.id] = { id: t.id, label: t.label, type: t.type, n: 0 }; rows.push(map[t.id]); }
  });
  rows.sort(function (a, b) { return (a.label || '').localeCompare(b.label || ''); });
  var sig = rows.map(function (r) { var d = taskDates[r.id] || {}; return r.id + '|' + r.n + '|' + (d.s || '') + '~' + (d.e || ''); }).join(';');
  var ae = document.activeElement;
  if (ae && ae.getAttribute && ae.getAttribute('data-date')) return; /* ne pas reconstruire pendant une saisie */
  if (sig === datesSig) return;
  datesSig = sig;
  var tb = el('as-dates'); clearEl(tb);
  if (!rows.length) { var tr0 = add(tb, 'tr'); var td0 = add(tr0, 'td', 'Associer ou sélectionner une tâche pour saisir ses dates.', 'hint'); td0.colSpan = 5; return; }
  rows.slice(0, 200).forEach(function (r) {
    var d = taskDates[r.id] || {}, tr = add(tb, 'tr');
    add(tr, 'td', (r.label || shortId(r.id)) + (/^dsplan:/i.test(r.type || '') ? ' ⚠' : ''));
    add(tr, 'td', String(r.n));
    var warnTd = null;
    function mk(k) {
      var td = add(tr, 'td'), inp = add(td, 'input');
      inp.type = 'date'; inp.value = d[k] || ''; inp.setAttribute('data-date', r.id + '|' + k);
      inp.onchange = function () {
        if (!setTaskDate(r.id, k, inp.value)) inp.value = (taskDates[r.id] || {})[k] || '';
        if (warnTd) warnTd.textContent = datesWarn(taskDates[r.id]);
      };
    }
    mk('s'); mk('e');
    warnTd = add(tr, 'td', datesWarn(d), 'warn');
  });
}

function renderDiag() {
  var uk = Object.keys(unhandled).sort(function (a, b) { return unhandled[b].last < unhandled[a].last ? -1 : 1; }).slice(0, 14);
  txt('as-diag', [
    'Version du script : v' + VERSION,
    'Glisser-déposer (depuis la dernière observation) : dragenter ×' + dnd.enter + ', dragover ×' + dnd.over + ', drop ×' + dnd.drop + ' ; appels du module de la plateforme ×' + dnd.mod,
    'Dernier glissement au-dessus du widget : ' + (dnd.lastEnterAt ? hhmmss(dnd.lastEnterAt) + ', types : ' + (dnd.lastTypes || '(aucun type)') : '(aucun)'),
    'Dépôts reçus : ' + drops + ' ; dernier : ' + (dnd.last || '(aucun)'),
    'Module de dépôt de la plateforme : ' + dnd.platform,
    '',
    'Lecture 4D : ' + (play.on ? 'en cours' : 'arrêtée') + (play.lastMsg ? ' ; dernier pas : ' + play.lastMsg : ''),
    'Mise en évidence 3D : ' + pubText(),
    'Dernier message publié :\n' + (pub ? pub.desc : '(aucun)'),
    'Comparaison de deux produits : ' + (cmpText ? '\n' + cmpText : '(aucune)'),
    '',
    'widget : ' + typeof window.widget + ' ; require : ' + typeof window.require + ' ; iframe : ' + (window !== window.parent),
    'Origine de la page : ' + location.origin + ' ; plateforme déduite : ' + (PLAT || '(inconnue)'),
    'PlatformAPI : ' + diag.platform + ' (publish : ' + (platform && typeof platform.publish === 'function' ? 'oui' : 'non') + ')',
    'Abonnements PlatformAPI : ' + (subs.join(', ') || 'aucun'),
    'Messages reçus : ' + diag.msgs + ' ; ignorés (origine inattendue) : ' + diag.ignored,
    'Messages de sélection traités : ' + diag.sel + ' ; messages tâche : ' + diag.task,
    'Dernier message tâche — champs : ' + (diag.taskShape || '(aucun)'),
    'Dernier élément tâche — champs : ' + (diag.taskItemShape || '(aucun)'),
    'Stockage : ' + diag.storage + ' ; associations : ' + links.length + ' (sélection : ' + links.filter(function (l) { return l.src === 'sel'; }).length + ', dépôt : ' + links.filter(function (l) { return l.src === 'drop'; }).length + ', origine inconnue : ' + links.filter(function (l) { return !l.src; }).length + ') ; tâches avec dates : ' + Object.keys(taskDates).length,
    '3DSpace : ' + (diag.space ? 'adresse détectée (' + diag.spaceSource + ')' : 'non détectée') + ' ; service plateforme : ' + diag.compass,
    '',
    'Messages reçus non utilisés depuis l\'observation (' + Object.keys(unhandled).length + ') :',
    uk.length ? uk.map(function (k) { return '  ' + k + ' ×' + unhandled[k].count + (unhandled[k].shape ? ' — ' + clip(unhandled[k].shape, 160) : ''); }).join('\n') : '  (aucun)',
    '',
    'Observation complète : ' + (full.text ? '\n' + full.text : '(aucune)')
  ].join('\n'));
}

function render() {
  renderSel('as-prod', 'as-prod-note', state.products, false, state.prodDesel, state.prodAt);
  renderSel('as-task', 'as-task-note', state.tasks, true, state.taskDesel, state.taskAt);
  el('as-assoc').disabled = !(state.products.length && state.tasks.length);
  el('as-cmp-two').disabled = state.products.length < 2;
  renderLinks(); renderTable(); renderDates(); renderTimeline(); renderDiag(); renderPub();
  txt('as-store', diag.storage);
}

/* ---------- PlatformAPI / require ---------- */
function getReq() {
  var arr = [window];
  try { if (window.parent !== window) arr.push(window.parent); } catch (e) {}
  try { if (window.top !== window.parent) arr.push(window.top); } catch (e) {}
  for (var i = 0; i < arr.length; i++) { try { if (typeof arr[i].require === 'function') return arr[i].require.bind(arr[i]); } catch (e) {} }
  return null;
}
function load(name, ok, err) {
  var req = getReq();
  if (!req) { err('require indisponible'); return; }
  try { req([name], ok, function (e) { err(clip(e && e.message || e, 160)); }); } catch (e) { err(e.message); }
}

/* ---------- adresse 3DSpace ---------- */
function setSpace(base, source) {
  base = String(base || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\/]+\.3dexperience\.3ds\.com/i.test(base)) return false;
  if (!/\/enovia$/i.test(base)) base += '/enovia';
  diag.space = base; diag.spaceSource = source;
  if (el('as-ws-base')) el('as-ws-base').value = base;
  return true;
}
function pickUrl(r, pid) {
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) {
    var hit = ''; r.forEach(function (x) { if (x && x.platformId === pid && x.url) hit = x.url; });
    return hit || (r[0] && r[0].url) || '';
  }
  return r && r.url ? r.url : '';
}
/* Forme de la réponse du service (noms de champs seulement), pour comprendre un échec */
function respShape(r) {
  try {
    if (Array.isArray(r)) return 'liste de ' + r.length + (r[0] && typeof r[0] === 'object' ? ' ; champs : ' + shape(r[0], 0) : '');
    return r && typeof r === 'object' ? 'objet ; champs : ' + shape(r, 1) : typeof r;
  } catch (e) { return '?'; }
}
/* Observé sur ta plateforme : la page est en « …-ifwe.… » et 3DSpace en « …-space.… » sur le même préfixe. */
function deriveSpaceFromPage() {
  var h = location.hostname || '';
  if (/-ifwe\.3dexperience\.3ds\.com$/i.test(h)) return setSpace('https://' + h.replace(/-ifwe\./i, '-space.') + '/enovia', 'déduite de l\'adresse de la page');
  return false;
}
function detectSpace() {
  var done = false;
  function finish(found) {
    if (done) return; done = true;
    if (!found) found = deriveSpaceFromPage();
    if (!found && lastDropHost && /-space\./i.test(lastDropHost)) found = setSpace('https://' + lastDropHost + '/enovia', 'dernier dépôt');
    renderDiag();
  }
  var pid = '';
  try { pid = window.widget && typeof window.widget.getValue === 'function' ? window.widget.getValue('x3dPlatformId') || '' : ''; } catch (e) {}
  load('DS/i3DXCompassServices/i3DXCompassServices', function (S) {
    var timer = setTimeout(function () { diag.compass = 'pas de réponse (8 s)'; finish(false); }, 8000);
    try {
      var opts = {
        serviceName: '3DSpace',
        onComplete: function (r) {
          clearTimeout(timer);
          var u = pickUrl(r, pid);
          if (u && setSpace(u, 'service de la plateforme')) { diag.compass = 'ok'; finish(true); }
          else { diag.compass = 'réponse inutilisable (' + respShape(r) + ')'; finish(false); }
        },
        onFailure: function () { clearTimeout(timer); diag.compass = 'échec de l\'appel'; finish(false); }
      };
      if (pid) opts.platformId = pid;
      S.getServiceUrl(opts);
    } catch (e) { clearTimeout(timer); diag.compass = 'erreur : ' + clip(e.message, 80); finish(false); }
  }, function (e) { diag.compass = 'module indisponible : ' + e; finish(false); });
}

/* ---------- lecture 3DSpace (GET) ---------- */
var DATE_KEY = /date|start|end|due|finish|duration|title|name|state|status|percent|complet/i;
function pickValues(o, path, out, depth) {
  if (out.length >= 40 || depth > 4 || o == null) return;
  if (Array.isArray(o)) { o.slice(0, 3).forEach(function (x, i) { pickValues(x, path + '[' + i + ']', out, depth + 1); }); return; }
  if (typeof o === 'object') { Object.keys(o).slice(0, 60).forEach(function (k) { pickValues(o[k], path ? path + '.' + k : k, out, depth + 1); }); return; }
  var last = path.split('.').pop().replace(/\[\d+\]$/, '');
  if (DATE_KEY.test(last)) out.push(path + ' = ' + clip(o, 80));
}
function runGet() {
  var base = el('as-ws-base').value.trim().replace(/\/+$/, ''), path = el('as-ws-path').value.trim(), url;
  var which = el('as-ws-id').value, src = which === 'prod' ? state.products[0] : state.tasks[0];
  try {
    if (path.indexOf('{id}') >= 0) {
      if (!src) throw new Error('aucun élément sélectionné pour {id}');
      path = path.replace(/\{id\}/g, encodeURIComponent(src.id));
    }
    if (path.charAt(0) !== '/' || path.indexOf('..') >= 0) throw new Error('le chemin doit commencer par / et ne pas contenir ..');
    var u = new URL(base + path);
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error('HTTPS sans identifiants requis');
    if (!/\.3dexperience\.3ds\.com$/i.test(u.hostname)) throw new Error('domaine 3dexperience.3ds.com attendu');
    url = u.href;
  } catch (e) { txt('as-ws-out', 'Adresse invalide : ' + e.message); return; }
  var headers = {}, sc = el('as-ws-sc').value.trim();
  if (sc) headers.SecurityContext = sc;
  txt('as-ws-out', 'Requête GET en cours…');
  load('DS/WAFData/WAFData', function (W) {
    try {
      W.authenticatedRequest(url, {
        method: 'GET', type: 'json', timeout: 15000, headers: headers,
        onComplete: function (r) {
          var vals = []; pickValues(r, '', vals, 0);
          txt('as-ws-out', 'Réponse reçue.\nChamps : ' + (r && typeof r === 'object' ? shape(r, 2) : typeof r) + '\n\nValeurs utiles :\n' + (vals.join('\n') || '(aucune)'));
        },
        onFailure: function (err) { txt('as-ws-out', 'Échec : ' + clip(err && err.message || err, 160)); },
        onTimeout: function () { txt('as-ws-out', 'Délai dépassé.'); }
      });
    } catch (e) { txt('as-ws-out', 'Erreur : ' + clip(e.message, 100)); }
  }, function (e) { txt('as-ws-out', 'WAFData indisponible : ' + e); });
}

/* ---------- dépôt (glisser-déposer) ----------
   Tout ce qui arrive est compté et décrit dans le diagnostic ; tous les types de données sont essayés ;
   le dépôt est accepté partout dans le widget, sauf dans un champ de saisie. */
function typesOf(dt) { try { return dt && dt.types ? Array.prototype.slice.call(dt.types) : []; } catch (e) { return []; } }
function itemsOf(o) {
  if (!o || typeof o !== 'object') return [];
  if (Array.isArray(o)) return o.filter(function (x) { return x && typeof x === 'object'; });
  if (o.data && Array.isArray(o.data.items)) return o.data.items;
  if (Array.isArray(o.items)) return o.items;
  return [];
}
function describeTried(tried) {
  return tried.map(function (x) {
    return x.t + ' (' + x.n + ' car., ' + (x.json ? 'JSON, ' + x.items + ' élément(s)' + (x.items ? '' : ' ; champs : ' + (x.shape || '?')) : 'non JSON') + ')';
  }).join(' ; ') || 'aucun type';
}

function processDrop(dt, via) {
  drops++;
  var types = typesOf(dt);
  if (!types.length) types = ['text/plain', 'text/searchitems', 'application/json'];
  var tried = [], found = null;
  types.forEach(function (t) {
    if (t === 'Files') return;
    var v = '';
    try { v = dt.getData(t) || ''; } catch (e) {}
    var inf = { t: clip(t, 40), n: v.length, json: false, items: 0, shape: '' };
    if (v) {
      try {
        var o = JSON.parse(v), its = itemsOf(o);
        inf.json = true; inf.items = its.length; inf.shape = shape(o, 1);
        if (!found && its.length) found = { obj: o, items: its };
      } catch (e) { /* type non JSON : on essaie le suivant */ }
    }
    tried.push(inf);
  });
  finishDrop(found, tried, via);
}

/* Données déjà extraites (module de la plateforme) */
function processPayload(data, via) {
  drops++; dnd.mod++;
  var tried = [], found = null;
  try {
    var o = typeof data === 'string' ? JSON.parse(data) : data, its = itemsOf(o);
    tried.push({ t: 'données', n: typeof data === 'string' ? data.length : 0, json: !!o && typeof o === 'object', items: its.length, shape: shape(o, 1) });
    if (its.length) found = { obj: o, items: its };
  } catch (e) { tried.push({ t: 'données', n: String(data || '').length, json: false, items: 0, shape: '' }); }
  finishDrop(found, tried, via);
}

function finishDrop(found, tried, via) {
  dnd.last = hhmmss(nowIso()) + ' via ' + via + ' : ' + describeTried(tried);
  if (!found) { setMsg('Dépôt reçu mais aucun élément reconnu (voir « Dernier » dans le diagnostic).'); render(); return; }
  /* le même dépôt peut arriver par deux chemins presque en même temps */
  var sig = found.items.map(idOf).join(',');
  if (sig && sig === lastDropSig && Date.now() - lastDropAt < 1500) return;
  lastDropSig = sig; lastDropAt = Date.now();
  applyDropped(found.obj, found.items, via);
}

function applyDropped(obj, items, via) {
  var osrc = obj && !Array.isArray(obj) ? str(obj.source, 40) : '';
  var tasks = [], prods = [], srcs = {};
  items.slice(0, PROD_MAX).forEach(function (it) {
    try { if (it.image) { var h = new URL(it.image).host; if (h) lastDropHost = h; } } catch (z) {}
    var id = idOf(it); if (!id) return;
    var s = str(it.source || osrc, 40); if (s) srcs[s] = 1;
    if (isTaskItem(it) || s === 'ENOTASK_AP') tasks.push(taskOf(it, { source: osrc }, 'dépôt'));
    else {
      var label = str(it.displayName || it.label, 120), type = str(it.objectType || it.type, 40);
      if (label) labelCache[id] = label;
      if (type) typeCache[id] = type;
      /* Un dépôt ne transporte pas l'emplacement : la clé est la référence seule. */
      prods.push({ id: id, key: id, fromSel: false, type: type, label: label, pathIds: [id], pathLabels: [label], pathTypes: [type], pathAttrs: [cleanAttr({ type: type, label: label })] });
    }
  });
  if (tasks.length) { state.tasks = tasks.slice(0, TASK_MAX); state.taskDesel = false; state.taskAt = nowIso(); }
  if (prods.length) { state.products = prods; state.prodDesel = false; state.prodAt = nowIso(); }
  if (!diag.space && lastDropHost) detectSpace();
  setMsg(tasks.length + ' tâche(s), ' + prods.length + ' produit(s) déposé(s) (via ' + via + (Object.keys(srcs).length ? ' ; source : ' + Object.keys(srcs).join(', ') : '') + ').');
  render();
}

function isFormField(t) { return !!(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
function dropUsable(e) {
  var t = typesOf(e.dataTransfer);
  return t.length > 0 && t.indexOf('Files') < 0 && !isFormField(e.target);
}
function installDrop() {
  var zone = el('as-drop');
  function seeTypes(e) {
    var t = typesOf(e.dataTransfer);
    t.forEach(function (x) { if (Object.keys(dnd.types).length < 10) dnd.types[clip(x, 40)] = 1; });
    dnd.lastTypes = t.join(', '); dnd.lastEnterAt = nowIso();
  }
  /* en phase de capture : on voit l'événement même si un autre élément du widget l'intercepte */
  document.addEventListener('dragenter', function (e) {
    dnd.enter++; seeTypes(e);
    if (dropUsable(e)) { e.preventDefault(); zone.classList.add('over'); }
    scheduleDiag();
  }, true);
  document.addEventListener('dragover', function (e) {
    dnd.over++;
    if (dropUsable(e)) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (x) {} zone.classList.add('over'); }
    scheduleDiag();
  }, true);
  document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) zone.classList.remove('over'); }, true);
  document.addEventListener('drop', function (e) {
    dnd.drop++; seeTypes(e); zone.classList.remove('over');
    if (dropUsable(e)) { e.preventDefault(); processDrop(e.dataTransfer, 'glisser-déposer du navigateur'); }
    else scheduleDiag();
  }, true);

  /* Module de glisser-déposer de la plateforme (présent sur ta plateforme : draggable, droppable, clean, on, off). */
  load('DS/DataDragAndDrop/DataDragAndDrop', function (D) {
    dnd.platform = 'module chargé (' + keys(D) + ')';
    try {
      if (D && typeof D.droppable === 'function') {
        D.droppable(zone, { drop: function (data) { processPayload(data, 'module de la plateforme'); } });
        dnd.platform += ' ; zone déclarée droppable';
      } else dnd.platform += ' ; pas de fonction droppable';
    } catch (e) { dnd.platform += ' ; erreur : ' + clip(e.message, 80); }
    scheduleDiag();
  }, function (e) { dnd.platform = 'module indisponible : ' + e; scheduleDiag(); });
}

/* ---------- construction de l'interface ---------- */
/* Page chargeur, ou page HTML d'une ancienne version : on reconstruit toujours l'interface complète de cette version. */
function ensureUi() {
  var ui = document.getElementById('as-ui');
  if (ui && ui.getAttribute('data-v') === VERSION) return;
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var m = document.createElement('main'); m.id = 'as-ui'; m.setAttribute('data-v', VERSION);
  m.innerHTML = HTML; /* contenu statique du script, aucune donnée externe */
  document.body.appendChild(m);
}

/* ---------- initialisation ---------- */
function copyPre(preId, msgId) {
  var t = el(preId).textContent;
  function fallback() {
    try { var r = document.createRange(); r.selectNodeContents(el(preId)); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
    txt(msgId, ' Texte sélectionné : Ctrl+C pour copier.');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { txt(msgId, ' Copié.'); }, fallback);
  else fallback();
}

function init() {
  loadStore();
  var inFrame = typeof window.require === 'function' || (function () { try { return window.parent !== window && typeof window.parent.require === 'function'; } catch (e) { return false; } })();
  txt('as-banner', (inFrame ? 'Association 4D v' + VERSION + ' prête : en écoute des sélections.' : 'Hors dashboard : les sélections de la plateforme ne seront pas reçues. Seul le dépôt fonctionne.') + (PLAT ? ' Plateforme : ' + PLAT + '.' : ''));
  el('as-banner').className = 'status ' + (inFrame ? 'ok' : 'bad');
  loadPrefs();
  var b0 = planBounds();
  if (b0) { el('as-play-from').value = b0.s; el('as-play-to').value = b0.e; el('as-simdate').value = b0.s; }
  else el('as-simdate').value = todayIso();

  window.addEventListener('message', onMessage);

  load('DS/PlatformAPI/PlatformAPI', function (P) {
    platform = P; diag.platform = 'chargé';
    ['DS/ENO/select', 'ENOTASK_AP.select', 'ENOTASK_AP.unselect'].forEach(function (t) {
      try { platform.subscribe(t, function (p) { route(t, p); }); subs.push(t); } catch (e) { /* ignoré */ }
    });
    detectSpace(); render();
  }, function (e) { diag.platform = 'échec : ' + e; detectSpace(); render(); });

  el('as-assoc').onclick = associate;
  el('as-clear').onclick = function () { state.products = []; state.tasks = []; state.prodDesel = state.taskDesel = false; setMsg('Sélection vidée (les associations enregistrées sont conservées).'); render(); };
  el('as-obs').onclick = function () {
    unhandled = {};
    dnd.enter = 0; dnd.over = 0; dnd.drop = 0; dnd.mod = 0; dnd.types = {}; dnd.lastTypes = ''; dnd.lastEnterAt = ''; dnd.last = ''; drops = 0;
    renderDiag();
  };
  el('as-copy-diag').onclick = function () { copyPre('as-diag', 'as-diag-msg'); };

  /* observation complète */
  el('as-full-go').onclick = fullStart;
  el('as-full-stop').onclick = function () { fullStop(false); };
  el('as-full-copy').onclick = function () { copyPre('as-full-out', 'as-full-msg'); };

  /* dates : import CSV */
  el('as-dcsv-file').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (f.size > 2000000) { txt('as-dcsv-out', 'Fichier trop volumineux (2 Mo max).'); return; }
    var r = new FileReader(); r.onload = function () { el('as-dcsv').value = String(r.result); txt('as-dcsv-out', 'Fichier lu (' + f.size + ' octets). Cliquer sur « Importer les dates ».'); }; r.readAsText(f);
  };
  el('as-dcsv-go').onclick = function () { importDatesCsv(el('as-dcsv').value, el('as-dcsv-over').checked); };

  /* lecture 4D */
  el('as-play').onclick = function () { if (play.on) pausePlay('Pause.'); else startPlay(); };
  el('as-play-first').onclick = function () { jump('first'); };
  el('as-play-last').onclick = function () { jump('last'); };
  el('as-sim-prev').onclick = function () { stepDay(-1); };
  el('as-sim-next').onclick = function () { stepDay(1); };
  el('as-play-fit').onclick = fitRange;
  el('as-simdate').onchange = function () { var d = curDay(); renderTimeline(); if (d && el('as-play-auto').checked) { pausePlay(); publishDay(d); } };
  el('as-play-from').onchange = renderTimeline;
  el('as-play-to').onchange = renderTimeline;
  el('as-play-mode').onchange = function () { savePrefs(); renderTimeline(); };
  el('as-play-speed').onchange = savePrefs;
  el('as-play-auto').onchange = savePrefs;
  el('as-play-clear').onchange = savePrefs;
  el('as-sim-go').onclick = function () { var d = curDay(); if (!d) { setPlayMsg('Choisir une date.'); return; } pausePlay(); publishDay(d, true); };

  /* mise en évidence 3D : produits de la tâche sélectionnée */
  el('as-pub-task').onclick = function () {
    if (!state.tasks.length) { setPubMsg('Sélectionner d\'abord une tâche.'); return; }
    var ids = {}; state.tasks.forEach(function (t) { ids[t.id] = 1; });
    var ls = links.filter(function (l) { return ids[l.tid]; });
    if (!ls.length) { setPubMsg('Aucune association pour la tâche sélectionnée.'); return; }
    publishLinks(ls, 'produits de la tâche sélectionnée');
  };

  /* comparaison */
  el('as-cmp-a').onclick = function () {
    if (!state.products.length) { txt('as-cmp', 'Sélectionner d\'abord un produit.'); return; }
    cmpA = state.products[0];
    txt('as-cmp', 'A mémorisé : ' + (prodLabel(cmpA) || shortId(cmpA.id)) + ' (' + cmpA.pathIds.length + ' niveau(x)). Sélectionner maintenant un autre produit, puis « Comparer la sélection avec A ».');
  };
  el('as-cmp-go').onclick = function () {
    if (!cmpA) { txt('as-cmp', 'Mémoriser d\'abord A.'); return; }
    if (!state.products.length) { txt('as-cmp', 'Sélectionner un produit à comparer avec A.'); return; }
    compareProducts(cmpA, state.products[0]);
  };
  el('as-cmp-two').onclick = function () {
    if (state.products.length < 2) { txt('as-cmp', 'Sélectionner deux produits (Ctrl + clic).'); return; }
    compareProducts(state.products[0], state.products[1]);
  };

  el('as-exp-csv').onclick = function () { var t = toCsv(); el('as-io').value = t; download('associations_4D.csv', t, 'text/csv;charset=utf-8'); txt('as-io-msg', links.length + ' association(s) exportée(s) en CSV.'); };
  el('as-exp-json').onclick = function () { var t = toJson(); el('as-io').value = t; download('associations_4D.json', t, 'application/json'); txt('as-io-msg', links.length + ' association(s) exportée(s) en JSON.'); };
  el('as-copy').onclick = function () {
    var t = el('as-io'); if (!t.value) t.value = toJson();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(function () { txt('as-io-msg', 'Copié.'); }, function () { t.select(); txt('as-io-msg', 'Sélectionné : Ctrl+C pour copier.'); });
    else { t.select(); txt('as-io-msg', 'Sélectionné : Ctrl+C pour copier.'); }
  };
  el('as-imp').onclick = function () { importText(el('as-io').value); };
  el('as-file').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (f.size > 5000000) { txt('as-io-msg', 'Fichier trop volumineux (5 Mo max).'); return; }
    var r = new FileReader(); r.onload = function () { importText(String(r.result)); }; r.readAsText(f);
  };
  var erasePending = false;
  el('as-erase').onclick = function () {
    var b = el('as-erase');
    if (!erasePending) { erasePending = true; b.textContent = 'Confirmer : tout effacer (associations et dates) ?'; setTimeout(function () { erasePending = false; b.textContent = 'Tout effacer'; }, 4000); return; }
    erasePending = false; b.textContent = 'Tout effacer'; pausePlay(); links = []; taskDates = {}; datesSig = ''; lastPubSig = null; save(); saveDates(); setMsg('Toutes les associations et dates ont été effacées.'); render();
  };

  installDrop();
  el('as-ws-go').onclick = runGet;
  render();
}

function start() {
  if (!document.body) { setTimeout(start, 100); return; }
  ensureUi();
  try { init(); } catch (e) { txt('as-banner', 'Erreur : ' + e.message); el('as-banner').className = 'status bad'; }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

(function () {
  "use strict";

  var script = document.currentScript;
  var root = document;
  var rootKind = "document de la page";
  try {
    if (script && script.getRootNode) {
      var r = script.getRootNode();
      if (r && r.querySelector) {
        root = r;
        if (r !== document) rootKind = "arbre isolé (shadow DOM)";
      }
    }
  } catch (e) {}

  function $(id) {
    return root.querySelector("#" + id) || document.getElementById(id);
  }
  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }
  function setTag(id, text, kind) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = "bd-tag" + (kind ? " " + kind : "");
  }
  function fail(msg) {
    var b = $("bd-banner");
    if (b) {
      b.className = "bd-banner ko";
      b.textContent = "Fichier main.js : erreur : " + msg;
    }
  }

  window.addEventListener("error", function (e) { fail(e.message); });

  var results = { script: "", env: "", messages: "Aucun message reçu", ws: "Non testé" };
  var messageLog = [];

  function setReport(text) {
    var el = $("bd-report");
    if (el) el.value = text;
  }
  function updateReport() {
    var inline = $("bd-inline");
    setReport(
      "RAPPORT DE DIAGNOSTIC (v4)\n" +
      "0. Script en-tête : " + (($("bd-head") && $("bd-head").className.indexOf("ok") !== -1) ? "exécuté" : "non exécuté") + " ; script fin de page : " + (inline && inline.className.indexOf("ok") !== -1 ? "exécuté" : "non exécuté") + "\n" +
      "1. main.js : " + results.script + "\n" +
      "2. Environnement : " + results.env + "\n" +
      "3. Messages : " + results.messages + "\n" +
      "4. WAFData : " + results.ws + "\n"
    );
  }

  function main() {
    var b = $("bd-banner");
    if (b) {
      b.className = "bd-banner ok";
      b.textContent = "Fichier main.js : exécuté à " + new Date().toLocaleTimeString("fr-FR") + ".";
    }

    var inFrame;
    try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
    setText("bd-frame", inFrame ? "Oui" : "Non (page ouverte seule)");
    setText("bd-url", location.href);
    setText("bd-root", rootKind);
    setText("bd-time", new Date().toLocaleString("fr-FR"));

    var parentInfo;
    try {
      parentInfo = window.parent.location.href + " (même origine)";
    } catch (e) {
      parentInfo = document.referrer
        ? "Origine différente, référent : " + document.referrer
        : "Origine différente (adresse non lisible)";
    }
    setText("bd-parent", parentInfo);

    var storage;
    try {
      localStorage.setItem("bd-test", "1");
      localStorage.removeItem("bd-test");
      storage = "Disponible";
    } catch (e) {
      storage = "Bloqué";
    }
    setText("bd-storage", storage);

    results.script = "exécuté ; " + (inFrame ? "dans un cadre" : "hors cadre") +
      " ; position : " + rootKind + " ; parent : " + parentInfo + " ; stockage : " + storage;
    setTag("bd-t1", "Script exécuté", "ok");

    var names = ["widget", "UWA", "require", "requirejs", "define", "curl", "PlatformAPI"];
    var found = [];
    var table = $("bd-env");
    names.forEach(function (n) {
      var present = false;
      try { present = typeof window[n] !== "undefined"; } catch (e) {}
      if (present) found.push(n);
      var tr = document.createElement("tr");
      var td1 = document.createElement("td");
      var td2 = document.createElement("td");
      td1.textContent = n;
      td2.textContent = present ? "Détecté" : "Absent";
      tr.appendChild(td1);
      tr.appendChild(td2);
      if (table) table.appendChild(tr);
    });
    setTag("bd-t2", found.length ? "Objets détectés" : "Aucun objet de la plateforme", found.length ? "ok" : "ko");
    results.env = found.length ? "Détectés : " + found.join(", ") : "Aucun objet détecté (" + names.join(", ") + ")";

    var topics = {};
    var topicOrder = [];
    var rawLog = [];
    function short(v, n) {
      var t;
      try { t = typeof v === "string" ? v : JSON.stringify(v); } catch (e) { t = "[non affichable]"; }
      if (t === undefined) t = "";
      return t.length > n ? t.slice(0, n) + "…" : t;
    }
    window.addEventListener("message", function (event) {
      var d = event.data;
      var key, info = "";
      if (d && typeof d === "object" && d.type === "MessageBus:publish" && d.options) {
        key = (d.options.channel || "?") + " / " + (d.options.topic || "?");
        info = short(d.options.data, 120);
      } else if (d && typeof d === "object" && d.type) {
        key = "type : " + d.type;
        info = short(d, 120);
      } else {
        key = "autre";
        info = short(d, 120);
      }
      if (!topics[key]) { topics[key] = { n: 0, last: "", at: "" }; topicOrder.push(key); }
      topics[key].n++;
      topics[key].last = info;
      topics[key].at = new Date().toLocaleTimeString("fr-FR");
      rawLog.push("[" + topics[key].at + "] " + event.origin + "\n" + short(d, 250));
      if (rawLog.length > 6) rawLog.shift();

      var lines = topicOrder.map(function (k) {
        return topics[k].n + " x  " + k + "  (dernier " + topics[k].at + ", données : " + topics[k].last + ")";
      });
      setText("bd-msgs", "SUJETS REÇUS\n" + lines.join("\n") + "\n\nDERNIERS MESSAGES BRUTS\n" + rawLog.join("\n\n"));
      var total = 0;
      topicOrder.forEach(function (k) { total += topics[k].n; });
      setTag("bd-t3", total + " message(s), " + topicOrder.length + " sujet(s)", "ok");
      results.messages = total + " message(s), " + topicOrder.length + " sujet(s) :\n   " + lines.join("\n   ");
      updateReport();
    });

    var go = $("bd-ws-go");
    if (go) {
      go.addEventListener("click", function () {
        var input = $("bd-ws-url");
        var url = input ? input.value.replace(/^\s+|\s+$/g, "") : "";
        if (!/^https:\/\//i.test(url)) {
          setTag("bd-t4", "Adresse invalide", "ko");
          setText("bd-ws", "Saisissez une adresse qui commence par https://");
          return;
        }
        if (typeof window.require !== "function") {
          setTag("bd-t4", "require absent", "ko");
          setText("bd-ws", "Le chargeur de modules de la plateforme (require) n’est pas disponible : WAFData ne peut pas être utilisé depuis cette page.");
          results.ws = "require absent";
          updateReport();
          return;
        }
        setTag("bd-t4", "En cours…", "");
        setText("bd-ws", "Requête en cours…");
        window.require(["DS/WAFData/WAFData"], function (WAFData) {
          try {
            WAFData.authenticatedRequest(url, {
              method: "GET",
              onComplete: function (response) {
                var text = typeof response === "string" ? response : JSON.stringify(response);
                setText("bd-ws", "Réponse reçue.\n\n" + String(text).slice(0, 300));
                setTag("bd-t4", "Réponse reçue", "ok");
                results.ws = "réponse reçue";
                updateReport();
              },
              onFailure: function (error) {
                var msg = error && error.message ? error.message : String(error);
                setText("bd-ws", "La requête a échoué : " + msg);
                setTag("bd-t4", "Échec", "ko");
                results.ws = "échec (" + msg + ")";
                updateReport();
              }
            });
          } catch (e) {
            setText("bd-ws", "Erreur lors de l’appel : " + e.message);
            setTag("bd-t4", "Erreur", "ko");
            results.ws = "erreur (" + e.message + ")";
            updateReport();
          }
        }, function (err) {
          var msg = err && err.message ? err.message : String(err);
          setText("bd-ws", "Module DS/WAFData/WAFData introuvable : " + msg);
          setTag("bd-t4", "Module introuvable", "ko");
          results.ws = "module WAFData introuvable";
          updateReport();
        });
      });
    }

    updateReport();
  }

  if (window.__bdMain) return;
  window.__bdMain = true;
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if ($("bd-banner")) {
      clearInterval(timer);
      try { main(); } catch (e) { fail(e && e.message ? e.message : String(e)); }
    } else if (tries > 80) {
      clearInterval(timer);
    }
  }, 150);
})();

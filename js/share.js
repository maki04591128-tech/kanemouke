(function () {
  "use strict";

  // Restores input values from URL query parameters, and lets users copy a
  // URL that reproduces the currently entered conditions. Works generically
  // across every tool page: every page's calculation inputs live inside a
  // single <div class="panel"> and are unique <input>/<select> elements with
  // an id, so this script never needs page-specific field names.

  function getPanelFields() {
    var nodes = document.querySelectorAll(".panel input[id], .panel select[id]");
    return Array.prototype.slice.call(nodes);
  }

  function dispatch(el, type) {
    var evt;
    try {
      evt = new Event(type, { bubbles: true });
    } catch (e) {
      evt = document.createEvent("Event");
      evt.initEvent(type, true, true);
    }
    el.dispatchEvent(evt);
  }

  function applyParamsFromUrl(fields) {
    var query = window.location.search;
    if (!query || query.length < 2) return;

    var params = new URLSearchParams(query);
    var applied = [];

    fields.forEach(function (el) {
      if (!params.has(el.id)) return;
      var value = params.get(el.id);
      if (el.tagName === "SELECT") {
        var hasOption = Array.prototype.some.call(el.options, function (opt) {
          return opt.value === value;
        });
        if (!hasOption) return;
      }
      el.value = value;
      applied.push(el);
    });

    // Fire events after every value is set, so calculators that read
    // multiple fields at once (most render() functions do) see the full,
    // consistent set of restored inputs rather than a half-updated state.
    applied.forEach(function (el) {
      dispatch(el, "input");
      dispatch(el, "change");
    });
  }

  function buildShareUrl(fields) {
    var params = new URLSearchParams();
    fields.forEach(function (el) {
      params.set(el.id, el.value);
    });
    var base = window.location.origin && window.location.origin !== "null"
      ? window.location.origin + window.location.pathname
      : window.location.pathname;
    return base + "?" + params.toString();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var temp = document.createElement("textarea");
      temp.value = text;
      temp.setAttribute("readonly", "");
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand("copy") ? resolve() : reject();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(temp);
      }
    });
  }

  function initShareBox(fields) {
    var box = document.getElementById("share-box");
    var urlInput = document.getElementById("share-url-input");
    var btn = document.getElementById("share-url-btn");
    var feedback = document.getElementById("share-url-feedback");
    if (!box || !urlInput || !btn) return;

    var feedbackTimer = null;

    function refresh() {
      urlInput.value = buildShareUrl(fields);
    }

    fields.forEach(function (el) {
      el.addEventListener("input", refresh);
      el.addEventListener("change", refresh);
    });
    refresh();

    btn.addEventListener("click", function () {
      refresh();
      copyText(urlInput.value).then(
        function () {
          if (!feedback) return;
          feedback.textContent = "URLをコピーしました。";
          clearTimeout(feedbackTimer);
          feedbackTimer = setTimeout(function () {
            feedback.textContent = "";
          }, 3000);
        },
        function () {
          urlInput.removeAttribute("readonly");
          urlInput.focus();
          urlInput.select();
          if (feedback) {
            feedback.textContent = "コピーできませんでした。表示中のURLを選択してコピーしてください。";
          }
        }
      );
    });
  }

  var panelFields = getPanelFields();
  applyParamsFromUrl(panelFields);
  initShareBox(panelFields);
})();

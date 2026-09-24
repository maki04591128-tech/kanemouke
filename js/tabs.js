(function () {
  "use strict";

  // 統合ハブページ（複数シミュレーターをタブ切り替えでまとめたページ）
  // 共通のタブ切り替えロジック。ARIA tabs パターンに準拠し、
  // ?tool=<slug> でのディープリンク、localStorage による最終選択タブの
  // 記憶、非表示タブ内の Chart.js グラフをタブ表示時にリサイズする
  // 処理を提供する。タブが存在しないページでは何もしない。

  var tabList = document.getElementById("hub-tabs");
  if (!tabList) return;

  var tabs = Array.prototype.slice.call(tabList.querySelectorAll(".hub-tab"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".tab-panel"));
  if (tabs.length === 0 || panels.length === 0) return;

  var storageKey = "hubTab:" + window.location.pathname;

  function panelFor(slug) {
    return panels.filter(function (p) { return p.dataset.tool === slug; })[0];
  }

  function activate(slug, opts) {
    var options = opts || {};
    var found = false;
    tabs.forEach(function (tab) {
      var isActive = tab.dataset.tool === slug;
      if (isActive) found = true;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    if (!found) return false;

    panels.forEach(function (panel) {
      if (panel.dataset.tool === slug) {
        panel.hidden = false;
      } else {
        panel.hidden = true;
      }
    });

    try {
      window.localStorage.setItem(storageKey, slug);
    } catch (e) {
      // localStorage が使えない環境（プライベートブラウズ等）では無視する。
    }

    if (!options.skipHistory) {
      var params = new URLSearchParams(window.location.search);
      params.set("tool", slug);
      var newUrl = window.location.pathname + "?" + params.toString();
      window.history.replaceState(null, "", newUrl);
    }

    // 非表示だったタブの Chart.js グラフは幅0で初期化されていることがある
    // ため、表示切り替え後に resize イベントを発火してレイアウトを合わせる。
    window.requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });

    document.dispatchEvent(new CustomEvent("hubtabchange", { detail: { tool: slug } }));
    return true;
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      activate(tab.dataset.tool);
    });
    tab.addEventListener("keydown", function (event) {
      var targetIndex = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        targetIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        targetIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = tabs.length - 1;
      }
      if (targetIndex !== null) {
        event.preventDefault();
        tabs[targetIndex].focus();
        activate(tabs[targetIndex].dataset.tool);
      }
    });
  });

  var initialSlug = null;
  var fromUrl = new URLSearchParams(window.location.search).get("tool");
  if (fromUrl && panelFor(fromUrl)) {
    initialSlug = fromUrl;
  } else {
    try {
      var stored = window.localStorage.getItem(storageKey);
      if (stored && panelFor(stored)) initialSlug = stored;
    } catch (e) {
      // ignore
    }
  }
  if (!initialSlug) initialSlug = tabs[0].dataset.tool;

  activate(initialSlug, { skipHistory: !!fromUrl && fromUrl === initialSlug });

  window.getActiveHubTool = function () {
    var current = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0];
    return current ? current.dataset.tool : null;
  };
})();

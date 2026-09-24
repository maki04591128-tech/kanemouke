(function () {
  "use strict";

  // 「前回の続きから」機能。
  // ツール（統合ハブページの各タブ）・解説記事を訪れた履歴をlocalStorageに
  // 最大8件まで保存し、トップページ（#recent-tools-grid があるページ）では
  // その履歴を新しい順にカード表示する。履歴の記録自体はトップページ以外の
  // 全ページ（ハブページ・解説記事）で行う。

  var STORAGE_KEY = "fn_recent_tools";
  var MAX_ITEMS = 8;

  function readList() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeList(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // localStorageが使えない環境（プライベートブラウズ等）では履歴を諦める。
    }
  }

  function cleanTitle(title) {
    return String(title || "").replace(/\s*\|\s*ふやすノート\s*$/, "").trim();
  }

  function recordVisit(entry) {
    if (!entry || !entry.url || !entry.title) return;
    var list = readList().filter(function (item) {
      return item.url !== entry.url;
    });
    list.unshift(entry);
    if (list.length > MAX_ITEMS) list.length = MAX_ITEMS;
    writeList(list);
  }

  function recordCurrentPage() {
    var isGuide = /-guide\.html/.test(window.location.pathname);
    recordVisit({
      url: window.location.pathname + window.location.search,
      title: cleanTitle(document.title),
      category: isGuide ? "ガイド" : "",
      time: Date.now()
    });
  }

  function recordHubTab(slug) {
    var tab = document.querySelector('.hub-tab[data-tool="' + slug + '"]');
    if (!tab) return;
    var params = new URLSearchParams(window.location.search);
    params.set("tool", slug);
    recordVisit({
      url: window.location.pathname + "?" + params.toString(),
      title: tab.textContent.trim(),
      category: cleanTitle(document.title).replace(/\s*まとめ$/, ""),
      time: Date.now()
    });
  }

  var tabList = document.getElementById("hub-tabs");
  var grid = document.getElementById("recent-tools-grid");

  if (tabList) {
    // 初期表示時もtabs.jsがhubtabchangeを発火するため、記録はこのイベントに任せる。
    document.addEventListener("hubtabchange", function (e) {
      recordHubTab(e.detail.tool);
    });
  } else if (!grid) {
    recordCurrentPage();
  }

  if (!grid) return;

  var section = document.getElementById("recent-tools-section");
  var list = readList();
  if (list.length === 0) return;

  list.forEach(function (item) {
    var link = document.createElement("a");
    link.className = "tool-card recent-tool-card";
    link.href = item.url;

    if (item.category) {
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = item.category;
      link.appendChild(badge);
    }

    var h3 = document.createElement("h3");
    h3.textContent = item.title;
    link.appendChild(h3);

    grid.appendChild(link);
  });

  if (section) section.hidden = false;

  var clearBtn = document.getElementById("recent-tools-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      writeList([]);
      grid.innerHTML = "";
      if (section) section.hidden = true;
    });
  }
})();

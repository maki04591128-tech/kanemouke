(function () {
  "use strict";

  // 複数の試算パターン（積立額・利回り等を変えた「もしこうだったら」比較）を
  // 手元に残しておきたいという需要に対して、既存のURL共有機能
  // （js/share.js）は「今の1件」を都度コピーする手段しか提供しておらず、
  // 複数パターンを見比べるには利用者自身がメモ帳等に貼り付けて管理する
  // 必要があった。ここでは、URL共有機能が組み立てるのと同じ形式のURLに
  // 見出し（診断結果・主要な結果カードの値）を添えてlocalStorageへ保存し、
  // この端末で後から一覧・再訪・削除できるようにする。

  var STORAGE_KEY = "kanemouke:result_history";
  // 端末全体（全ハブページ共通）での保存上限。古いものから自動的に
  // 削除する。ページ単体の表示件数はこの上限で自然に絞られるため、
  // 別途の表示上限は設けない。
  var MAX_ITEMS = 20;

  var saveBtn = document.getElementById("history-save-btn");
  var section = document.getElementById("result-history");
  var list = document.getElementById("result-history-list");
  if (!saveBtn || !section || !list) return;

  var feedback = document.getElementById("share-url-feedback");
  var feedbackTimer = null;
  function showFeedback(message) {
    if (!feedback) return;
    feedback.textContent = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () {
      feedback.textContent = "";
    }, 4000);
  }

  function storageAvailable() {
    try {
      var testKey = "__kanemouke_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      // プライベートブラウズ等でlocalStorageが使えない環境では保存を諦める。
      return false;
    }
  }
  var canUseStorage = storageAvailable();

  function readAll() {
    if (!canUseStorage) return [];
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(items) {
    if (!canUseStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // 保存に失敗しても表示中の一覧は更新済みのままにし、エラーにはしない。
    }
  }

  // js/share.js の getPanelFields() と同じロジック（統合ハブページでは
  // 現在表示中のタブの.panelのみを対象にする）を、依存を増やさないため
  // ここでも独立して実装している。
  function getPanelFields() {
    var hiddenPanel = document.querySelector(".tab-panel[hidden]");
    var scope;
    if (hiddenPanel) {
      var visiblePanel = document.querySelector(".tab-panel:not([hidden])");
      scope = visiblePanel || document;
    } else {
      scope = document;
    }
    var nodes = scope.querySelectorAll(".panel input[id], .panel select[id]");
    return Array.prototype.slice.call(nodes);
  }

  function buildUrl() {
    var params = new URLSearchParams();
    if (window.getActiveHubTool) {
      var activeTool = window.getActiveHubTool();
      if (activeTool) params.set("tool", activeTool);
    }
    getPanelFields().forEach(function (el) {
      params.set(el.id, el.value);
    });
    return window.location.pathname + "?" + params.toString();
  }

  // js/result-text.js と同じ「現在表示中タブの結果カラム」の探し方。
  function activeResultColumn() {
    var scope = document.querySelector(".tab-panel:not([hidden])") || document;
    var layout = scope.querySelector(".calc-layout");
    if (!layout) return null;
    var panel = layout.querySelector(".panel");
    return panel ? panel.nextElementSibling : null;
  }

  function activeToolLabel() {
    var tab = document.querySelector('.hub-tab[aria-selected="true"]');
    return tab ? tab.textContent.trim() : "";
  }

  // 一覧に出す見出し文言：診断バナー（達成/未達成等の判定があるツール）が
  // あれば優先し、なければ最初の（多くはaccent強調の）結果カードの
  // ラベル＋値を使う。
  function buildHeadline(resultCol) {
    var banner = resultCol.querySelector(".verdict-banner");
    var verdictEl = banner ? banner.querySelector("span[id]") : null;
    var verdictText = verdictEl ? verdictEl.textContent.trim() : "";
    if (verdictText && verdictText !== "-") return verdictText;

    var card = resultCol.querySelector(".result-card.accent") || resultCol.querySelector(".result-card");
    if (!card) return null;
    var labelEl = card.querySelector(".label");
    var valueEl = card.querySelector(".value");
    if (!valueEl) return null;
    var value = valueEl.textContent.replace(/\s+/g, " ").trim();
    if (!value || value === "-") return null;
    return (labelEl ? labelEl.textContent.trim() + "：" : "") + value;
  }

  function formatSavedAt(timestamp) {
    try {
      return new Date(timestamp).toLocaleString("ja-JP", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return "";
    }
  }

  function removeItem(id) {
    var all = readAll().filter(function (item) {
      return item.id !== id;
    });
    writeAll(all);
    render();
    showFeedback("保存した結果を削除しました。");
  }

  function render() {
    var here = readAll().filter(function (item) {
      return item.path === window.location.pathname;
    });
    list.innerHTML = "";
    if (here.length === 0) {
      section.hidden = true;
      return;
    }
    here.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "result-history-item";

      var link = document.createElement("a");
      link.className = "result-history-link";
      link.href = item.url;

      var time = document.createElement("span");
      time.className = "result-history-time";
      time.textContent = formatSavedAt(item.savedAt);
      link.appendChild(time);

      var summary = document.createElement("span");
      summary.className = "result-history-summary";
      summary.textContent = (item.toolLabel ? "[" + item.toolLabel + "] " : "") + item.headline;
      link.appendChild(summary);

      li.appendChild(link);

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "result-history-delete";
      delBtn.setAttribute("aria-label", "この保存結果を削除");
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", function () {
        removeItem(item.id);
      });
      li.appendChild(delBtn);

      list.appendChild(li);
    });
    section.hidden = false;
  }

  saveBtn.addEventListener("click", function () {
    if (!canUseStorage) {
      showFeedback("この端末では保存機能を利用できません（プライベートブラウズ等）。");
      return;
    }
    var resultCol = activeResultColumn();
    var headline = resultCol ? buildHeadline(resultCol) : null;
    if (!headline) {
      showFeedback("保存できる試算結果がありません。");
      return;
    }
    var item = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      path: window.location.pathname,
      url: buildUrl(),
      savedAt: Date.now(),
      toolLabel: activeToolLabel(),
      headline: headline
    };
    var all = readAll();
    all.unshift(item);
    if (all.length > MAX_ITEMS) all = all.slice(0, MAX_ITEMS);
    writeAll(all);
    render();
    showFeedback("この結果を保存しました。下の「保存した試算結果」から後で見比べられます。");
  });

  render();
})();

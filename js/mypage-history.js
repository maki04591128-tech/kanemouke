(function () {
  "use strict";

  // マイページ（mypage.html）専用：保存した試算結果（全ツール）セクション。
  // js/result-history.js は各ツールページ（統合ハブページ等）でそのページの
  // pathに一致する保存結果だけを表示する設計で、history-save-btn等が無い
  // ページでは何もせず終了する（ファイル先頭のガード）ため、このページでは
  // 流用できない。ここでは同じlocalStorageキー・同じデータ形式
  // （{id, path, url, savedAt, toolLabel, headline, inputs, results}）を
  // そのまま読み書きし、全ツール分の保存結果をpathで絞らずに新しい順へ
  // 一覧表示する専用のロジックを持つ。

  var STORAGE_KEY = "kanemouke:result_history";

  var section = document.getElementById("mypage-history-section");
  var list = document.getElementById("mypage-history-list");
  if (!section || !list) return;

  function readAll() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(items) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // 保存に失敗しても表示中の一覧は更新済みのままにし、エラーにはしない。
    }
  }

  // js/result-history.js の formatSavedAt() と同じ書式。
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

  // toolLabelを持たない古い形式の保存データ（比較機能の追加より前に保存
  // されたもの）に対する簡易的な表示名のフォールバック。完璧な名寄せは
  // 狙わず、pathの末尾ファイル名から拡張子を除き、ハイフンをスペースに
  // 変えるだけの単純な処理にしている。
  function fallbackLabel(path) {
    try {
      var file = String(path || "").split("/").pop() || "";
      file = file.replace(/\.html?$/i, "").replace(/-/g, " ").trim();
      return file || "ツール";
    } catch (e) {
      return "ツール";
    }
  }

  function removeItem(id) {
    var remaining = readAll().filter(function (item) {
      return item.id !== id;
    });
    writeAll(remaining);
    render();
  }

  function render() {
    var all = readAll().slice().sort(function (a, b) {
      return (b.savedAt || 0) - (a.savedAt || 0);
    });

    list.innerHTML = "";

    if (all.length === 0) {
      section.hidden = true;
      updateEmptyState();
      return;
    }

    all.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "result-history-item";

      var link = document.createElement("a");
      link.className = "result-history-link";
      link.href = item.url || item.path || "#";

      var time = document.createElement("span");
      time.className = "result-history-time";
      time.textContent = formatSavedAt(item.savedAt);
      link.appendChild(time);

      var label = item.toolLabel || fallbackLabel(item.path);
      var summary = document.createElement("span");
      summary.className = "result-history-summary";
      summary.textContent = "[" + label + "] " + (item.headline || "");
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
    updateEmptyState();
  }

  var clearBtn = document.getElementById("mypage-history-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (!window.confirm("保存した試算結果をすべて削除します。よろしいですか？")) return;
      writeAll([]);
      render();
    });
  }

  // お気に入り（js/favorites.js）・前回の続きから（js/recent-tools.js）・
  // この保存した試算結果の3セクションが全てhiddenになった場合にだけ、
  // 共通の空状態メッセージを表示する。このスクリプトは他の2つより後に
  // 読み込まれ、render()はここまでの処理を全て同期的に終えた後に呼ばれる
  // ため、呼び出し時点でこの判定に必要な3つのセクションのhidden属性は
  // 確定している。
  function updateEmptyState() {
    var empty = document.getElementById("mypage-empty-state");
    if (!empty) return;
    var favSection = document.getElementById("favorite-tools-section");
    var recentSection = document.getElementById("recent-tools-section");
    var favHidden = !favSection || favSection.hidden;
    var recentHidden = !recentSection || recentSection.hidden;
    var historyHidden = section.hidden;
    empty.hidden = !(favHidden && recentHidden && historyHidden);
  }

  render();
})();

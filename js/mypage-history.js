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
  //
  // 比較表（チェックボックスで2件以上選んで入力条件・試算結果を並べる機能）は
  // js/result-history.js が各ツールページ内で「同じツール内の保存結果どうし」を
  // 比較する機能として既に提供しているが、マイページは全ツール分を横断して
  // 一覧する場所のため、ツールをまたいだ比較ができないと「この結果を保存して
  // 比較」という導線の文言に対してマイページ側の機能が追いついていなかった。
  // ここでは同じ比較ロジック（ラベルの和集合を取り、値が食い違う項目だけ強調し、
  // 2件限定で単位が一致する数値には差分も出す）を、pathで絞らない前提に合わせて
  // 独立して実装する（他ページへの依存を増やさないため、意図的に重複させている）。

  var STORAGE_KEY = "kanemouke:result_history";

  var section = document.getElementById("mypage-history-section");
  var list = document.getElementById("mypage-history-list");
  if (!section || !list) return;

  var compareControls = document.getElementById("mypage-compare-controls");
  var compareBtn = document.getElementById("mypage-compare-btn");
  var comparePanel = document.getElementById("mypage-compare");
  var feedback = document.getElementById("mypage-history-feedback");
  var feedbackTimer = null;

  function showFeedback(message) {
    if (!feedback) return;
    feedback.textContent = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () {
      feedback.textContent = "";
    }, 4000);
  }

  function readAll() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      // 比較機能の追加より前に保存された古いデータはinputs/resultsを
      // 持たないため、比較表が空欄だらけにならないよう見出し文言だけを
      // 1行の結果として補う（js/result-history.jsの同名処理と同じ後方互換）。
      parsed.forEach(function (item) {
        if (!Array.isArray(item.inputs)) item.inputs = [];
        if (!Array.isArray(item.results) || item.results.length === 0) {
          item.results = item.headline
            ? [{ label: "保存時の結果", value: item.headline }]
            : [];
        }
      });
      return parsed;
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

  // 比較表の行見出しに使う、保存時のラベル群の和集合（js/result-history.jsの
  // 同名関数と同じロジック）。
  function unionLabels(items, key) {
    var seen = [];
    var index = {};
    items.forEach(function (item) {
      (item[key] || []).forEach(function (row) {
        if (!Object.prototype.hasOwnProperty.call(index, row.label)) {
          index[row.label] = true;
          seen.push(row.label);
        }
      });
    });
    return seen;
  }

  function valueForLabel(item, key, label) {
    var rows = item[key] || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].label === label) return rows[i].value;
    }
    return null;
  }

  // 値の先頭にある数値部分と、それに続く単位表記を取り出す（js/result-history.js
  // の同名関数と同じロジック）。ツールをまたいだ比較では単位が異なる項目が
  // 同じラベル名で並ぶことは想定していないが、万一一致しない場合は差分を
  // 算出せずnullを返す。
  function parseLeadingNumber(value) {
    var m = /^(-?[\d,]+(?:\.\d+)?)\s*(.*)$/.exec(String(value == null ? "" : value).trim());
    if (!m) return null;
    var num = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(num)) return null;
    var unit = m[2].trim();
    if (unit.length > 12) return null;
    return { num: num, unit: unit };
  }

  function formatDiffNumber(diff, unit) {
    var sign = diff > 0 ? "+" : diff < 0 ? "-" : "±";
    var formatted = Math.abs(diff).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
    return sign + formatted + (unit ? " " + unit : "");
  }

  function computeDiff(before, after) {
    if (before === null || after === null) return null;
    var a = parseLeadingNumber(before);
    var b = parseLeadingNumber(after);
    if (!a || !b || a.unit !== b.unit) return null;
    return formatDiffNumber(b.num - a.num, b.unit);
  }

  function addCompareSection(tbody, columnCount, title, items, key, showDiff) {
    var labels = unionLabels(items, key);
    if (labels.length === 0) return;

    var sectionRow = document.createElement("tr");
    sectionRow.className = "result-compare-section";
    var sectionTh = document.createElement("th");
    sectionTh.setAttribute("colspan", String(columnCount + (showDiff ? 2 : 1)));
    sectionTh.textContent = title;
    sectionRow.appendChild(sectionTh);
    tbody.appendChild(sectionRow);

    labels.forEach(function (label) {
      var values = items.map(function (item) {
        return valueForLabel(item, key, label);
      });
      var allSame = values.every(function (v) {
        return v === values[0];
      });
      var tr = document.createElement("tr");
      var rowTh = document.createElement("th");
      rowTh.scope = "row";
      rowTh.textContent = label;
      tr.appendChild(rowTh);
      values.forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v === null ? "（該当なし）" : v;
        if (!allSame) td.className = "result-compare-diff";
        tr.appendChild(td);
      });
      if (showDiff) {
        var diffTd = document.createElement("td");
        diffTd.className = "result-compare-diffcol";
        if (allSame) {
          diffTd.textContent = "";
        } else {
          var diff = computeDiff(values[0], values[1]);
          diffTd.textContent = diff === null ? "—" : diff;
        }
        tr.appendChild(diffTd);
      }
      tbody.appendChild(tr);
    });
  }

  // js/csv-export.js と同じRFC4180準拠のフィールドエスケープ・UTF-8 BOM付与の
  // ロジックを、依存を増やさないためここでも独立して実装している。
  function csvField(text) {
    var value = String(text == null ? "" : text).replace(/\r\n|\r|\n/g, " ").trim();
    if (/[",]/.test(value)) {
      value = '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  function todayStamp() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function buildCompareCsv(items) {
    var showDiff = items.length === 2;

    var rows = [];
    rows.push(csvField("ふやすノート マイページ（ツールをまたいだ保存結果の比較）"));
    rows.push(csvField("https://maki04591128-tech.github.io/kanemouke/mypage.html"));
    rows.push(csvField("※本試算結果は入力条件に基づく参考値です。将来の成果を保証するものではありません。"));
    rows.push("");

    var header = ["項目"];
    items.forEach(function (item) {
      var col = formatSavedAt(item.savedAt);
      var label = item.toolLabel || fallbackLabel(item.path);
      header.push(csvField(col + " [" + label + "]"));
    });
    header.push(csvField(showDiff ? "差分（後－前）" : "値が異なる"));
    rows.push(header.join(","));

    [
      { title: "■ 入力条件", key: "inputs" },
      { title: "■ 試算結果", key: "results" }
    ].forEach(function (section) {
      var labels = unionLabels(items, section.key);
      if (labels.length === 0) return;
      rows.push(csvField(section.title));
      labels.forEach(function (label) {
        var values = items.map(function (item) {
          return valueForLabel(item, section.key, label);
        });
        var allSame = values.every(function (v) {
          return v === values[0];
        });
        var line = [csvField(label)];
        values.forEach(function (v) {
          line.push(csvField(v === null ? "（該当なし）" : v));
        });
        if (allSame) {
          line.push(csvField(""));
        } else if (showDiff) {
          var diff = computeDiff(values[0], values[1]);
          line.push(csvField(diff === null ? "○" : diff));
        } else {
          line.push(csvField("○"));
        }
        rows.push(line.join(","));
      });
    });

    return rows.join("\r\n");
  }

  function hideComparePanel() {
    if (!comparePanel) return;
    comparePanel.hidden = true;
    comparePanel.innerHTML = "";
  }

  function renderCompareTable(items) {
    if (!comparePanel) return;
    comparePanel.innerHTML = "";

    var showDiff = items.length === 2;

    var wrap = document.createElement("div");
    wrap.className = "table-wrap";
    var table = document.createElement("table");
    table.className = "data-table result-compare-table";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var cornerTh = document.createElement("th");
    var cornerLabel = document.createElement("span");
    cornerLabel.className = "sr-only";
    cornerLabel.textContent = "比較項目";
    cornerTh.appendChild(cornerLabel);
    headRow.appendChild(cornerTh);
    items.forEach(function (item) {
      var th = document.createElement("th");
      var time = document.createElement("span");
      time.className = "result-compare-col-time";
      time.textContent = formatSavedAt(item.savedAt);
      th.appendChild(time);
      th.appendChild(document.createElement("br"));
      var toolSpan = document.createElement("span");
      toolSpan.className = "result-compare-col-label";
      toolSpan.textContent = item.toolLabel || fallbackLabel(item.path);
      th.appendChild(toolSpan);
      headRow.appendChild(th);
    });
    if (showDiff) {
      var diffTh = document.createElement("th");
      diffTh.textContent = "差分（後－前）";
      headRow.appendChild(diffTh);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    addCompareSection(tbody, items.length, "入力条件", items, "inputs", showDiff);
    addCompareSection(tbody, items.length, "試算結果", items, "results", showDiff);
    table.appendChild(tbody);

    wrap.appendChild(table);
    if (window.enhanceTableWrapA11y) window.enhanceTableWrapA11y(wrap, "保存した試算結果の比較表");
    comparePanel.appendChild(wrap);

    var note = document.createElement("p");
    note.className = "result-compare-note";
    note.textContent = showDiff
      ? "色が付いたセルは、選択した保存結果の間で値が異なる項目です。「差分」列は後の結果から前の結果を引いた増減幅です（「—」は単位が異なる等で算出できなかった項目、「（該当なし）」はもう一方のツールにその項目が無いことを示します）。"
      : "色が付いたセルは、選択した保存結果の間で値が異なる項目です。「（該当なし）」は他のツールにその項目が無いことを示します。";
    comparePanel.appendChild(note);

    var actions = document.createElement("div");
    actions.className = "result-compare-actions";

    var csvBtn = document.createElement("button");
    csvBtn.type = "button";
    csvBtn.className = "share-btn secondary";
    csvBtn.textContent = "比較表をCSVでダウンロード";
    csvBtn.addEventListener("click", function () {
      var csv = buildCompareCsv(items);
      var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      var blobUrl = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = blobUrl;
      link.download = "kanemouke_mypage_compare_" + todayStamp() + ".csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
      showFeedback("比較表をCSVでダウンロードしました。");
    });
    actions.appendChild(csvBtn);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "share-btn secondary";
    closeBtn.textContent = "比較表を閉じる";
    closeBtn.addEventListener("click", hideComparePanel);
    actions.appendChild(closeBtn);
    comparePanel.appendChild(actions);

    comparePanel.hidden = false;
    comparePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // チェックボックスの選択状態はrender()を呼ぶたび（削除・初回表示）にリセット
  // する（js/result-history.jsと同じ単純化：削除された項目のidが選択状態に
  // 残ってゴミになる状態を避ける）。
  var selectedIds = {};

  function updateCompareButton() {
    if (!compareBtn) return;
    var count = Object.keys(selectedIds).length;
    compareBtn.disabled = count < 2;
  }

  function removeItem(id) {
    var remaining = readAll().filter(function (item) {
      return item.id !== id;
    });
    writeAll(remaining);
    render();
  }

  function render() {
    selectedIds = {};
    updateCompareButton();
    hideComparePanel();

    var all = readAll().slice().sort(function (a, b) {
      return (b.savedAt || 0) - (a.savedAt || 0);
    });

    list.innerHTML = "";

    if (all.length === 0) {
      section.hidden = true;
      if (compareControls) compareControls.hidden = true;
      updateEmptyState();
      return;
    }

    all.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "result-history-item";

      var checkLabel = document.createElement("label");
      checkLabel.className = "result-history-check";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      var checkboxLabelText = (item.toolLabel ? "[" + item.toolLabel + "] " : "") + (item.headline || "");
      checkbox.setAttribute("aria-label", "比較用に選択（" + checkboxLabelText + "）");
      checkbox.addEventListener("change", function () {
        if (checkbox.checked) {
          selectedIds[item.id] = true;
        } else {
          delete selectedIds[item.id];
        }
        updateCompareButton();
      });
      checkLabel.appendChild(checkbox);
      li.appendChild(checkLabel);

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
    if (compareControls) compareControls.hidden = all.length < 2;
    updateEmptyState();
  }

  if (compareBtn) {
    compareBtn.addEventListener("click", function () {
      var chosen = readAll()
        .filter(function (item) {
          return selectedIds[item.id];
        })
        .sort(function (a, b) {
          return a.savedAt - b.savedAt;
        });
      if (chosen.length < 2) {
        showFeedback("比較するには2件以上チェックしてください。");
        return;
      }
      renderCompareTable(chosen);
    });
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

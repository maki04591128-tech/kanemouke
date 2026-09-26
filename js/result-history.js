(function () {
  "use strict";

  // 複数の試算パターン（積立額・利回り等を変えた「もしこうだったら」比較）を
  // 手元に残しておきたいという需要に対して、既存のURL共有機能
  // （js/share.js）は「今の1件」を都度コピーする手段しか提供しておらず、
  // 複数パターンを見比べるには利用者自身がメモ帳等に貼り付けて管理する
  // 必要があった。ここでは、URL共有機能が組み立てるのと同じ形式のURLに
  // 見出し（診断結果・主要な結果カードの値）を添えてlocalStorageへ保存し、
  // この端末で後から一覧・再訪・削除できるようにする。
  //
  // 保存件数が2件以上たまってきた利用者向けに、チェックボックスで選んだ
  // 2件以上を「入力条件」「試算結果」の項目ごとに並べて比較できる表も
  // あわせて提供する（同じ項目名を持つ行同士を突き合わせ、値が食い違う
  // セルだけを強調する）。

  var STORAGE_KEY = "kanemouke:result_history";
  // 端末全体（全ハブページ共通）での保存上限。古いものから自動的に
  // 削除する。ページ単体の表示件数はこの上限で自然に絞られるため、
  // 別途の表示上限は設けない。
  var MAX_ITEMS = 20;

  var saveBtn = document.getElementById("history-save-btn");
  var section = document.getElementById("result-history");
  var list = document.getElementById("result-history-list");
  if (!saveBtn || !section || !list) return;

  var compareControls = document.getElementById("result-compare-controls");
  var compareBtn = document.getElementById("result-compare-btn");
  var comparePanel = document.getElementById("result-compare");

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
      if (!Array.isArray(parsed)) return [];
      // 比較機能の追加より前に保存された古いデータはinputs/resultsを
      // 持たないため、比較表が空欄だらけにならないよう見出し文言だけを
      // 1行の結果として補う（保存後にこの機能が追加された利用者向けの
      // 後方互換）。
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

  // 比較表の行見出しに使う、人が読める入力項目名（<label>から単位表記の
  // <span class="unit">を取り除いたもの）。
  function fieldLabelText(el) {
    var label = document.querySelector('label[for="' + el.id + '"]');
    if (!label) return el.id;
    var clone = label.cloneNode(true);
    var unit = clone.querySelector(".unit");
    if (unit && unit.parentNode) unit.parentNode.removeChild(unit);
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  // 比較表に出す入力値の表示文字列。スライダー（type="range"）は生の
  // 数値だと分かりにくいため、単位付きでリアルタイム表示している
  // <span id="xxxOut">の文言（例：「5.0 %」）をそのまま使う。
  // それ以外の数値入力は<label>内の単位表記を末尾に補う。
  function fieldValueText(el) {
    var outSpan = document.getElementById(el.id + "Out");
    if (outSpan) return outSpan.textContent.replace(/\s+/g, " ").trim();
    if (el.tagName === "SELECT") {
      var opt = el.options[el.selectedIndex];
      return opt ? opt.textContent.trim() : el.value;
    }
    var label = document.querySelector('label[for="' + el.id + '"]');
    var unitText = "";
    if (label) {
      var unit = label.querySelector(".unit");
      if (unit && !unit.id) unitText = unit.textContent.trim();
    }
    return unitText ? el.value + " " + unitText : el.value;
  }

  function collectInputRows() {
    return getPanelFields().map(function (el) {
      return { label: fieldLabelText(el), value: fieldValueText(el) };
    });
  }

  // js/result-text.js の collectLines() と同じ「診断バナー＋結果カード」
  // の集め方を、ラベルと値のペア配列として再実装している。
  function collectResultRows(resultCol) {
    var rows = [];
    var banner = resultCol.querySelector(".verdict-banner");
    if (banner) {
      var verdictEl = banner.querySelector("span[id]");
      var subEl = banner.querySelector(".sub");
      var verdictText = verdictEl ? verdictEl.textContent.trim() : "";
      if (verdictText && verdictText !== "-") {
        var sub = subEl ? subEl.textContent.trim() : "";
        rows.push({
          label: "診断結果",
          value: sub ? verdictText + "（" + sub + "）" : verdictText
        });
      }
    }
    Array.prototype.slice.call(resultCol.querySelectorAll(".result-card")).forEach(function (card) {
      var labelEl = card.querySelector(".label");
      var valueEl = card.querySelector(".value");
      if (!labelEl || !valueEl) return;
      var value = valueEl.textContent.replace(/\s+/g, " ").trim();
      if (!value || value === "-") return;
      rows.push({ label: labelEl.textContent.trim(), value: value });
    });
    return rows;
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

  // チェックボックスの選択状態はrender()を呼ぶたび（保存・削除・初回表示）
  // にリセットする。削除された項目のidが選択状態に残ってゴミになったり、
  // 一覧の並びが変わった後に古い選択のまま比較表を開いたりする状態を
  // 避けるための単純化。
  var selectedIds = {};

  function removeItem(id) {
    var all = readAll().filter(function (item) {
      return item.id !== id;
    });
    writeAll(all);
    render();
    showFeedback("保存した結果を削除しました。");
  }

  function updateCompareButton() {
    if (!compareBtn) return;
    var count = Object.keys(selectedIds).length;
    compareBtn.disabled = count < 2;
  }

  function hideComparePanel() {
    if (!comparePanel) return;
    comparePanel.hidden = true;
    comparePanel.innerHTML = "";
  }

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

  // 値の先頭にある数値部分と、それに続く単位表記（「円」「%」「歳」等）を
  // 取り出す。単位を含む文字列全体が長すぎる場合（数値の後に長い注記が
  // 続く等）は誤った差分表示を避けるため対象外とする。
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

  // 2件比較時のみ、before→afterの数値差分を「+120,000 円」のように
  // 算出する。どちらかが未入力（該当なし）だったり、単位が一致しない
  // 場合は算出できないため、その場合はnullを返し「値は違うが差分は
  // 算出できない」ことを呼び出し側で区別できるようにする。
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

  // js/csv-export.js と同じRFC4180準拠のフィールドエスケープ・
  // UTF-8 BOM付与のロジックを、依存を増やさないためここでも
  // 独立して実装している（同ファイルの.data-table→CSV変換とは対象の
  // 表構造が異なり、そのまま流用できないため）。
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

  // 比較表と同じ「入力条件・試算結果」の行構成に、画面上は背景色でしか
  // 表せない「値が異なる」強調をCSVでも読み取れるよう、末尾に専用の列を
  // 1本追加してCSV化する（見出し・値そのものは比較表の表示文字列をそのまま
  // 使うため、新規の集計ロジックは持たない）。
  function buildCompareCsv(items) {
    var titleEl = document.querySelector(".page-title h1");
    var title = titleEl ? titleEl.textContent.trim() : document.title.split("|")[0].trim();
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = canonical ? canonical.href : window.location.href;

    // 2件のみの比較（前後を見比べる最も一般的な使い方）では、○/空欄の
    // 代わりに実際の増減幅を出す方が「使いやすさ」に資すると判断し、
    // 末尾列を「差分」に切り替える。3件以上では前後関係が一意に決まらず
    // 1列に収まらないため、従来どおり○/空欄のままにする。
    var showDiff = items.length === 2;

    var rows = [];
    rows.push(csvField("ふやすノート " + title + "（保存した試算結果の比較）"));
    rows.push(csvField(url));
    rows.push(csvField("※本試算結果は入力条件に基づく参考値です。将来の成果を保証するものではありません。"));
    rows.push("");

    var header = ["項目"];
    items.forEach(function (item) {
      var col = formatSavedAt(item.savedAt);
      if (item.toolLabel) col += " [" + item.toolLabel + "]";
      header.push(csvField(col));
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
    headRow.appendChild(document.createElement("th"));
    items.forEach(function (item) {
      var th = document.createElement("th");
      var time = document.createElement("span");
      time.className = "result-compare-col-time";
      time.textContent = formatSavedAt(item.savedAt);
      th.appendChild(time);
      if (item.toolLabel) {
        th.appendChild(document.createElement("br"));
        var toolSpan = document.createElement("span");
        toolSpan.className = "result-compare-col-label";
        toolSpan.textContent = item.toolLabel;
        th.appendChild(toolSpan);
      }
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
    comparePanel.appendChild(wrap);

    var note = document.createElement("p");
    note.className = "result-compare-note";
    note.textContent = showDiff
      ? "色が付いたセルは、選択した保存結果の間で値が異なる項目です。「差分」列は後の結果から前の結果を引いた増減幅です（「—」は単位が異なる等で算出できなかった項目）。"
      : "色が付いたセルは、選択した保存結果の間で値が異なる項目です。";
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
      link.download = "kanemouke_compare_" + todayStamp() + ".csv";
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

  function render() {
    selectedIds = {};
    updateCompareButton();
    hideComparePanel();

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

      var checkLabel = document.createElement("label");
      checkLabel.className = "result-history-check";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", "比較用に選択（" + (item.toolLabel ? "[" + item.toolLabel + "] " : "") + item.headline + "）");
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

    if (compareControls) compareControls.hidden = here.length < 2;
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
      headline: headline,
      inputs: collectInputRows(),
      results: collectResultRows(resultCol)
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

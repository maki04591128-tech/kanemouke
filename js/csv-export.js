(function () {
  "use strict";

  // 統合ハブページの「グラフの数値データを表で見る」内の<table>
  // （js/chart-data-table.jsが生成する年次推移データ）と、画面に直接
  // 表示されている「結果の内訳」テーブル（*-breakdown-body。シナリオ
  // 比較や年ごとの内訳など、ツールごとに列構成が異なる）を、CSVファイル
  // としてダウンロードする機能。既存の「結果をテキストでコピー」「結果を
  // 画像で保存」はSNS共有向けの要約だが、CSVはこれらの表データをそのまま
  // Excel・スプレッドシートに取り込んで自分で並べ替え・グラフ化したい
  // という、より踏み込んだ使い方（記録・比較用途）に応えるためのもの。
  // 新規の集計・フォーマットロジックは実装せず、既にDOMに描画済みの表を
  // そのまま読み取るだけなので、数値の食い違いは発生しない。

  var btn = document.getElementById("csv-export-btn");
  if (!btn) return;

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

  function activePanel() {
    return document.querySelector(".tab-panel:not([hidden])");
  }

  function activeToolLabel() {
    var tab = document.querySelector('.hub-tab[aria-selected="true"]');
    return tab ? tab.textContent.trim() : "";
  }

  function activeChartTable() {
    var panel = activePanel() || document;
    return panel.querySelector(".chart-data-details table.data-table");
  }

  // 「結果の内訳」テーブル（*-breakdown-body、シナリオ比較や年ごとの
  // 内訳など、グラフの年次推移テーブルとは別に画面表示されている表）。
  // 対象9ハブページはいずれも1つのタブ内に0〜1個しか存在しないため、
  // tbody[id$="-breakdown-body"]で一意に特定できる。
  function activeBreakdownTable() {
    var panel = activePanel() || document;
    var body = panel.querySelector('tbody[id$="-breakdown-body"]');
    return body ? body.closest("table") : null;
  }

  // RFC4180準拠のフィールドエスケープ。既存の金額表示は
  // toLocaleString("ja-JP")で3桁区切りのカンマを含むため、
  // カンマ・二重引用符・改行を含む場合は必ず引用符で囲む。
  function csvField(text) {
    var value = String(text == null ? "" : text).replace(/\r\n|\r|\n/g, " ").trim();
    if (/[",]/.test(value)) {
      value = '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  function tableToRows(table) {
    var rows = [];
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      var cells = Array.prototype.map.call(tr.querySelectorAll("th,td"), function (cell) {
        return csvField(cell.textContent);
      });
      if (cells.length) rows.push(cells.join(","));
    });
    return rows;
  }

  function buildCsv() {
    var chartTable = activeChartTable();
    var chartRows = chartTable ? tableToRows(chartTable) : [];
    var breakdownTable = activeBreakdownTable();
    var breakdownRows = breakdownTable ? tableToRows(breakdownTable) : [];
    if (chartRows.length === 0 && breakdownRows.length === 0) return null;

    var titleEl = document.querySelector(".page-title h1");
    var title = titleEl ? titleEl.textContent.trim() : document.title.split("|")[0].trim();
    var toolLabel = activeToolLabel();
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = canonical ? canonical.href : window.location.href;

    var header = [];
    header.push(csvField("ふやすノート " + title + (toolLabel ? "（" + toolLabel + "）" : "")));
    header.push(csvField(url));
    header.push(csvField("※本試算結果は入力条件に基づく参考値です。将来の成果を保証するものではありません。"));
    header.push("");

    // 「結果の内訳」テーブルが存在するタブのみ、グラフの年次推移データと
    // 見出しで区切って両方出力する。存在しないタブでは従来どおり
    // グラフの年次推移データのみをそのまま出力し、出力形式を変えない。
    var body;
    if (chartRows.length > 0 && breakdownRows.length > 0) {
      body = [csvField("■ グラフの数値データ（年次推移）")]
        .concat(chartRows, [""], [csvField("■ 結果の内訳")], breakdownRows);
    } else {
      body = chartRows.length > 0 ? chartRows : breakdownRows;
    }

    return header.concat(body).join("\r\n");
  }

  function slugify(text) {
    return (text || "tool")
      .replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tool";
  }

  function todayStamp() {
    var d = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  btn.addEventListener("click", function () {
    var csv = buildCsv();
    if (!csv) {
      showFeedback("CSVとしてダウンロードできる表データがありません。");
      return;
    }

    var panel = activePanel();
    var toolSlug = panel && panel.dataset.tool ? panel.dataset.tool : slugify(activeToolLabel());
    var filename = "kanemouke_" + toolSlug + "_" + todayStamp() + ".csv";

    // Excelで日本語文字化けを防ぐためUTF-8 BOMを付与
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    showFeedback("結果の内訳をCSVでダウンロードしました。");
  });
})();

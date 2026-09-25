(function () {
  "use strict";

  // 統合ハブページのグラフ数値データ表（js/chart-data-table.jsが生成する
  // 「グラフの数値データを表で見る」内の<table>）を、CSVファイルとして
  // ダウンロードする機能。既存の「結果をテキストでコピー」「結果を画像で
  // 保存」はSNS共有向けの要約だが、CSVは年ごとの推移データをそのまま
  // Excel・スプレッドシートに取り込んで自分で並べ替え・グラフ化したい
  // という、より踏み込んだ使い方（記録・比較用途）に応えるためのもの。
  // 新規の集計・フォーマットロジックは実装せず、既にDOMに描画済みの
  // 表（chart-data-table.jsが元のグラフのtooltip文言をそのまま転記した
  // もの）をそのまま読み取るだけなので、数値の食い違いは発生しない。

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

  function activeDataTable() {
    var panel = activePanel() || document;
    return panel.querySelector(".chart-data-details table.data-table");
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
    var table = activeDataTable();
    var rows = table ? tableToRows(table) : [];
    if (rows.length === 0) return null;

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

    return header.concat(rows).join("\r\n");
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

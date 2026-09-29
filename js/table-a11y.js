(function () {
  "use strict";

  // 解説記事内の表（.article-section .data-table）は、列数が多いとスマホ幅で
  // 横スクロールが必要になる（style.cssでdisplay:block; overflow-x:autoを付与）。
  // このスクロール領域はマウス・タッチでは操作できるが、キーボードだけでは
  // フォーカスが当たらずスクロールできなかった（axe-coreのscrollable-region-focusable
  // 相当の問題）。tabindexを付与してキーボードでも矢印キーでスクロールできるようにし、
  // 直前の見出しからアクセシブルネームを補うことで読み上げ環境でも表の内容が分かるようにする。
  //
  // 同種の問題は、ハブページのグラフ数値データ表・試算結果比較表を囲む
  // <div class="table-wrap">（style.cssでoverflow-x:autoを付与）にもある。
  // 比較表（js/result-history.js）は比較件数が増えるほど列数が増え、
  // 実測でPC幅（1280px）でも2件比較時点でスクロール領域化することを
  // axe-coreのscrollable-region-focusableで確認済み。こちらは静的HTML内の
  // 表と違いページ読み込み後にJSで生成されるため、生成側からも呼べる
  // enhanceTableWrapA11y()を公開する。

  function labelFor(table) {
    if (table.hasAttribute("aria-label") || table.querySelector("caption")) return null;
    var el = table.previousElementSibling;
    while (el) {
      if (/^H[2-4]$/.test(el.tagName)) {
        var text = el.textContent.trim();
        return text ? text + "の表" : null;
      }
      el = el.previousElementSibling;
    }
    return null;
  }

  function labelForWrap(wrap) {
    var details = wrap.closest("details.chart-data-details");
    if (details) {
      var summary = details.querySelector("summary");
      if (summary) {
        var summaryText = summary.textContent.trim();
        if (summaryText) return summaryText;
      }
    }
    var el = wrap.previousElementSibling;
    while (el) {
      if (/^H[2-4]$/.test(el.tagName)) {
        var text = el.textContent.trim();
        return text ? text + "の表" : null;
      }
      el = el.previousElementSibling;
    }
    return null;
  }

  function enhanceTableWrapA11y(wrap, explicitLabel) {
    if (!wrap) return;
    if (!wrap.hasAttribute("tabindex")) wrap.setAttribute("tabindex", "0");
    if (!wrap.hasAttribute("role")) wrap.setAttribute("role", "region");
    if (!wrap.hasAttribute("aria-label")) {
      var label = explicitLabel || labelForWrap(wrap);
      if (label) wrap.setAttribute("aria-label", label);
    }
  }
  window.enhanceTableWrapA11y = enhanceTableWrapA11y;

  function init() {
    var tables = document.querySelectorAll(".article-section .data-table");
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (!table.hasAttribute("tabindex")) table.setAttribute("tabindex", "0");
      var label = labelFor(table);
      if (label) table.setAttribute("aria-label", label);
    }

    var wraps = document.querySelectorAll(".table-wrap");
    for (var j = 0; j < wraps.length; j++) {
      enhanceTableWrapA11y(wraps[j]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

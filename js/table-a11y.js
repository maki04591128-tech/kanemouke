(function () {
  "use strict";

  // 解説記事内の表（.article-section .data-table）は、列数が多いとスマホ幅で
  // 横スクロールが必要になる（style.cssでdisplay:block; overflow-x:autoを付与）。
  // このスクロール領域はマウス・タッチでは操作できるが、キーボードだけでは
  // フォーカスが当たらずスクロールできなかった（axe-coreのscrollable-region-focusable
  // 相当の問題）。tabindexを付与してキーボードでも矢印キーでスクロールできるようにし、
  // 直前の見出しからアクセシブルネームを補うことで読み上げ環境でも表の内容が分かるようにする。

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

  function init() {
    var tables = document.querySelectorAll(".article-section .data-table");
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (!table.hasAttribute("tabindex")) table.setAttribute("tabindex", "0");
      var label = labelFor(table);
      if (label) table.setAttribute("aria-label", label);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

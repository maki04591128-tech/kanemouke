(function () {
  "use strict";

  // 統合ハブページの結果表示（.result-card / .verdict-banner）に
  // aria-live="polite" と aria-atomic="true" を付与する。
  // スライダー操作などで各ツールのrender関数（例: js/tsumitate.js）が
  // 結果の数値（.value等）を書き換えるたびに、ラベルと値をまとめて
  // スクリーンリーダー利用者にも自動的に読み上げさせるための対応
  // （既存のDOM要素に属性を追加するだけで、計算・表示内容には関与しない）。

  var regions = Array.prototype.slice.call(document.querySelectorAll(".result-card, .verdict-banner"));
  regions.forEach(function (el) {
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
  });
})();

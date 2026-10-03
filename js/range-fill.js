(function () {
  "use strict";

  // input[type="range"]のタッチターゲット拡大（css/style.cssの
  // .field input[type="range"]）に伴い、ブラウザ既定のaccent-colorに
  // 任せていた「つまみまでの区間を塗りつぶす」見た目（現在値が直感的に
  // わかる進捗表示）が、appearance:noneによるカスタムtrackでは失われて
  // しまうため、本スクリプトでCSSカスタムプロパティ（--range-progress）
  // を更新し、css/style.cssのlinear-gradientで同等の見た目を再現する
  // （既存37ページのHTMLを個別編集せず、スライダーを持つ各ハブページへの
  // scriptタグ1行の追加だけで動作する）。

  function updateFill(input) {
    var min = parseFloat(input.min);
    var max = parseFloat(input.max);
    var val = parseFloat(input.value);
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = 100;
    if (isNaN(val)) return;
    var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));
    input.style.setProperty("--range-progress", pct + "%");
  }

  function init() {
    var inputs = document.querySelectorAll('input[type="range"]');
    Array.prototype.forEach.call(inputs, function (input) {
      updateFill(input);
      input.addEventListener("input", function () {
        updateFill(input);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

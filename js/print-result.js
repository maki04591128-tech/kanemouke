(function () {
  "use strict";

  // share-box内の「結果を印刷・PDF保存」ボタンを、ブラウザの印刷機能
  // （window.print）に接続するだけの補助スクリプト。印刷時に不要な
  // 要素を隠す処理はcss/style.cssの`@media print`側で行う。

  var btn = document.getElementById("print-result-btn");
  if (!btn) return;

  btn.addEventListener("click", function () {
    window.print();
  });
})();

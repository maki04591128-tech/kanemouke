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

  // 印刷結果・PDFは元のページから切り離されて保存・共有されることがあり、
  // ヘッダー（サイト名）や広告枠・タブ等は印刷時に非表示化されるため、
  // 「どのサイトの、どのページの試算か」と簡単な免責を後から見返せるよう、
  // 印刷時のみ表示される注記を本文末尾に1行追加する（画面表示には影響しない）。
  var canonical = document.querySelector('link[rel="canonical"]');
  var url = canonical ? canonical.href : window.location.href;
  var note = document.createElement("p");
  note.className = "print-footer-note";
  note.textContent =
    "ふやすノート（" + url + "）｜本試算結果は入力条件に基づく参考値であり、将来の成果を保証するものではありません。";
  document.body.appendChild(note);
})();

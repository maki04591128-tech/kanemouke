(function () {
  "use strict";

  // 全ページ共通の「メインコンテンツへスキップ」リンク（<body>直後にHTMLで
  // 静的に配置済み）の補助スクリプト。ブラウザ既定のフラグメント遷移は
  // <main id="main-content">へスクロールこそするが、<main>自体は
  // tabindexを持たないため実際にはフォーカスされず、リンク活性化後に
  // Tabキーを押すと<body>先頭（＝ヘッダーナビの直前）からやり直しになって
  // しまい、スキップの効果が半減する。back-to-top.jsと同じ「動的に
  // tabindex="-1"を付与してfocus()する」パターンで、スキップ後の最初の
  // Tabがメインコンテンツ内から再開するようにする。

  var link = document.querySelector("a.skip-link");
  if (!link) return;

  link.addEventListener("click", function () {
    var target = document.getElementById("main-content");
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    // ブラウザ既定のフラグメント遷移（スクロール）と競合しないよう、
    // 同一タスクの末尾でフォーカスする。
    window.setTimeout(function () {
      target.focus({ preventScroll: true });
    }, 0);
  });
})();

(function () {
  "use strict";

  // 全ページ共通の「ページ上部へ戻る」フローティングボタン。
  // ガイド記事・統合ハブページは1ページの縦の長さが数千pxに及ぶため、
  // スクロール後に入力欄や見出しへ素早く戻れる導線として動的にDOM生成する
  // （既存37ページのHTMLを個別編集せず、scriptタグ1行の追加だけで動作する）。

  var SHOW_AT = 400;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "back-to-top";
  btn.setAttribute("aria-label", "ページの一番上へ戻る");
  btn.innerHTML =
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M10 15.5V4.5M10 4.5L4.5 10M10 4.5L15.5 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  var visible = false;
  function setVisible(next) {
    if (next === visible) return;
    visible = next;
    btn.classList.toggle("is-visible", visible);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      setVisible(window.scrollY > SHOW_AT);
      ticking = false;
    });
  }

  btn.addEventListener("click", function () {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? "auto" : "smooth" });
    // フォーカスをページ先頭付近へ戻し、キーボード・スクリーンリーダー利用者にも
    // 「先頭に戻った」ことが伝わるようにする。
    var target = document.querySelector("main h1") || document.body;
    if (target) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  });

  function init() {
    document.body.appendChild(btn);
    setVisible(window.scrollY > SHOW_AT);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // このスクリプトは各ページの</body>直前で読み込まれるため、
  // 読み込み時点で既にDOMContentLoadedが発火済み（readyStateが"loading"
  // ではない）ことが多い。その場合はイベントを待たず即座に初期化する。
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

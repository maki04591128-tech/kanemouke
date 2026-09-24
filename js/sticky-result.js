(function () {
  "use strict";

  // 統合ハブページ（.calc-layout）専用。モバイル幅では入力フォーム（.panel）と
  // 結果（.verdict-banner / .result-summary）が縦に並ぶため、スライダーを
  // 動かすたびに結果を見るには毎回下までスクロールする必要があった。
  // フォームを操作中（結果がまだ画面外）の間だけ画面下部に主要な結果を
  // 追従表示し、タップで結果セクションへスムーズスクロールする。
  // 表示・非表示の切り替えは CSS の @media (max-width: 760px) に任せ、
  // ここでは常に「現在フォーム操作中の1件」を追跡するだけにする。

  var groups = Array.prototype.slice.call(document.querySelectorAll(".calc-layout"));
  if (groups.length === 0) return;

  var pairs = [];
  groups.forEach(function (group) {
    var panel = group.querySelector(".panel");
    var resultCol = panel ? panel.nextElementSibling : null;
    if (!panel || !resultCol) return;
    var anchor = resultCol.querySelector(".verdict-banner") || resultCol.querySelector(".result-summary");
    if (!anchor) return;

    var labelEl = null;
    var valueEl = null;
    var verdictEl = anchor.classList.contains("verdict-banner")
      ? anchor.querySelector("span[id]")
      : null;
    if (verdictEl) {
      valueEl = verdictEl;
    } else {
      var firstCard = anchor.querySelector(".result-card");
      if (firstCard) {
        labelEl = firstCard.querySelector(".label");
        valueEl = firstCard.querySelector(".value");
      }
    }
    if (!valueEl) return;

    pairs.push({
      panel: panel,
      anchor: anchor,
      labelEl: labelEl,
      valueEl: valueEl,
      label: labelEl ? labelEl.textContent : "診断結果",
      value: valueEl.textContent,
      panelVisible: false,
      anchorVisible: false
    });
  });
  if (pairs.length === 0) return;

  var bar = document.createElement("button");
  bar.type = "button";
  bar.className = "sticky-result-bar";
  bar.innerHTML =
    '<span class="sticky-result-top">' +
    '<span class="sticky-result-label"></span>' +
    '<span class="sticky-result-arrow" aria-hidden="true">結果を見る ↓</span>' +
    "</span>" +
    '<span class="sticky-result-value"></span>';
  var labelOut = bar.querySelector(".sticky-result-label");
  var valueOut = bar.querySelector(".sticky-result-value");

  var active = null;

  function updateAria() {
    if (!active) return;
    bar.setAttribute(
      "aria-label",
      "現在の計算結果 " + active.label + " " + active.value + "。タップすると結果の詳細へ移動します"
    );
  }

  function render() {
    var candidate = pairs.filter(function (p) {
      return p.panelVisible && !p.anchorVisible;
    })[0];
    active = candidate || null;
    if (active) {
      labelOut.textContent = active.label;
      valueOut.textContent = active.value;
      updateAria();
      bar.classList.add("is-visible");
    } else {
      bar.classList.remove("is-visible");
    }
  }

  var textObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      var pair = pairs.filter(function (p) {
        return p.valueEl === mutation.target || p.valueEl.contains(mutation.target);
      })[0];
      if (pair) pair.value = pair.valueEl.textContent;
    });
    render();
  });
  pairs.forEach(function (pair) {
    textObserver.observe(pair.valueEl, { childList: true, characterData: true, subtree: true });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var pair = pairs.filter(function (p) {
        return p.panel === entry.target || p.anchor === entry.target;
      })[0];
      if (!pair) return;
      if (entry.target === pair.panel) pair.panelVisible = entry.isIntersecting;
      if (entry.target === pair.anchor) pair.anchorVisible = entry.isIntersecting;
    });
    render();
  }, { threshold: 0 });

  pairs.forEach(function (pair) {
    io.observe(pair.panel);
    io.observe(pair.anchor);
  });

  bar.addEventListener("click", function () {
    if (!active) return;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    active.anchor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (!active.anchor.hasAttribute("tabindex")) active.anchor.setAttribute("tabindex", "-1");
    active.anchor.focus({ preventScroll: true });
  });

  function init() {
    document.body.appendChild(bar);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

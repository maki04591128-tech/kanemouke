(function () {
  "use strict";

  // 統合ハブページ（.calc-layout）専用。モバイル幅では入力フォーム（.panel）と
  // 結果（.verdict-banner / .result-summary）が縦に並ぶため、スライダーを
  // 動かすたびに結果を見るには毎回下までスクロールする必要があった。
  // フォームを操作中（結果がまだ画面外）の間だけ画面下部に主要な結果を
  // 追従表示し、タップで結果セクションへスムーズスクロールする。
  // さらに「内訳」トグルで、スクロールせずにその場で全ての結果カードの
  // 内訳を確認できるようにする（88回目の申し送り事項への対応）。
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

    var banner = resultCol.querySelector(".verdict-banner");
    var verdictEl = banner ? banner.querySelector("span[id]") : null;

    var mainLabelEl = null;
    var mainValueEl = null;
    if (verdictEl) {
      mainValueEl = verdictEl;
    } else {
      var firstCard = resultCol.querySelector(".result-card");
      if (firstCard) {
        mainLabelEl = firstCard.querySelector(".label");
        mainValueEl = firstCard.querySelector(".value");
      }
    }
    if (!mainValueEl) return;

    var items = Array.prototype.slice
      .call(resultCol.querySelectorAll(".result-card"))
      .map(function (card) {
        return { labelEl: card.querySelector(".label"), valueEl: card.querySelector(".value") };
      })
      .filter(function (it) {
        return it.labelEl && it.valueEl;
      });

    pairs.push({
      panel: panel,
      anchor: anchor,
      resultCol: resultCol,
      mainLabelEl: mainLabelEl,
      mainValueEl: mainValueEl,
      items: items,
      panelVisible: false,
      anchorVisible: false
    });
  });
  if (pairs.length === 0) return;

  var wrap = document.createElement("div");
  wrap.className = "sticky-result-wrap";
  wrap.innerHTML =
    '<div class="sticky-result-detail" id="sticky-result-detail" hidden></div>' +
    '<div class="sticky-result-bar">' +
    '<button type="button" class="sticky-result-toggle" aria-expanded="false" aria-controls="sticky-result-detail" hidden>' +
    '<span class="sr-only">内訳を表示</span>' +
    '<span aria-hidden="true">内訳<span class="sticky-result-toggle-icon">▾</span></span>' +
    "</button>" +
    '<button type="button" class="sticky-result-main">' +
    '<span class="sticky-result-top">' +
    '<span class="sticky-result-label"></span>' +
    '<span class="sticky-result-arrow" aria-hidden="true">結果を見る ↓</span>' +
    "</span>" +
    '<span class="sticky-result-value"></span>' +
    "</button>" +
    "</div>";

  var detailEl = wrap.querySelector(".sticky-result-detail");
  var toggleBtn = wrap.querySelector(".sticky-result-toggle");
  var mainBtn = wrap.querySelector(".sticky-result-main");
  var labelOut = wrap.querySelector(".sticky-result-label");
  var valueOut = wrap.querySelector(".sticky-result-value");

  var active = null;
  var detailOpen = false;

  function currentLabel(pair) {
    return pair.mainLabelEl ? pair.mainLabelEl.textContent : "診断結果";
  }
  function currentValue(pair) {
    return pair.mainValueEl.textContent;
  }

  function closeDetail() {
    detailOpen = false;
    toggleBtn.setAttribute("aria-expanded", "false");
    detailEl.hidden = true;
  }

  function renderDetail() {
    if (!active || !detailOpen) return;
    detailEl.textContent = "";
    active.items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "sticky-result-detail-row";
      var label = document.createElement("span");
      label.className = "sticky-result-detail-label";
      label.textContent = it.labelEl.textContent;
      var value = document.createElement("span");
      value.className = "sticky-result-detail-value";
      value.textContent = it.valueEl.textContent;
      row.appendChild(label);
      row.appendChild(value);
      detailEl.appendChild(row);
    });
  }

  function openDetail() {
    if (!active || active.items.length < 2) return;
    detailOpen = true;
    toggleBtn.setAttribute("aria-expanded", "true");
    detailEl.hidden = false;
    renderDetail();
  }

  function updateAria() {
    if (!active) return;
    mainBtn.setAttribute(
      "aria-label",
      "現在の計算結果 " + currentLabel(active) + " " + currentValue(active) + "。タップすると結果の詳細へ移動します"
    );
  }

  function render() {
    var candidate = pairs.filter(function (p) {
      return p.panelVisible && !p.anchorVisible;
    })[0];
    var changed = active !== candidate;
    active = candidate || null;
    if (changed) closeDetail();
    if (active) {
      labelOut.textContent = currentLabel(active);
      valueOut.textContent = currentValue(active);
      toggleBtn.hidden = active.items.length < 2;
      updateAria();
      renderDetail();
      wrap.classList.add("is-visible");
    } else {
      wrap.classList.remove("is-visible");
    }
  }

  var textObserver = new MutationObserver(function () {
    render();
  });
  pairs.forEach(function (pair) {
    textObserver.observe(pair.resultCol, { childList: true, characterData: true, subtree: true });
  });

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var pair = pairs.filter(function (p) {
          return p.panel === entry.target || p.anchor === entry.target;
        })[0];
        if (!pair) return;
        if (entry.target === pair.panel) pair.panelVisible = entry.isIntersecting;
        if (entry.target === pair.anchor) pair.anchorVisible = entry.isIntersecting;
      });
      render();
    },
    { threshold: 0 }
  );

  pairs.forEach(function (pair) {
    io.observe(pair.panel);
    io.observe(pair.anchor);
  });

  toggleBtn.addEventListener("click", function () {
    if (detailOpen) closeDetail();
    else openDetail();
  });

  mainBtn.addEventListener("click", function () {
    if (!active) return;
    closeDetail();
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    active.anchor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (!active.anchor.hasAttribute("tabindex")) active.anchor.setAttribute("tabindex", "-1");
    active.anchor.focus({ preventScroll: true });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && detailOpen) closeDetail();
  });

  function init() {
    document.body.appendChild(wrap);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

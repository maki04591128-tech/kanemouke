(function () {
  "use strict";

  // トップページの「自分で目的から選ぶ」各カテゴリーは、多いもので15件前後の
  // カード（シミュレーター＋解説記事）を1カラムで並べており、特にモバイルでは
  // 1カテゴリーだけで画面を何度もスクロールする負担になっていた。
  // カード数が多いカテゴリーだけ、先頭のVISIBLE_COUNT件を残して
  // 「もっと見る」ボタンで残りを展開できるようにする（折り畳みはJSでのみ行うため、
  // JS無効環境・検索エンジンには常に全件がそのまま見える）。
  // お気に入り機能（js/favorites.js）が各カードを.tool-card-fav-wrapで包むため、
  // このスクリプトはfavorites.jsの後に読み込み、.tool-gridの直接の子要素を
  // 単位として数える。

  var VISIBLE_COUNT = 6;
  var FOLD_THRESHOLD = 7; // この件数を超えるカテゴリーだけ折り畳む

  // キーワード検索（js/tool-search.js）は.tool-cardに.is-search-hiddenを
  // 付け外しして一致したカードだけを表示するが、折り畳み中のカードは
  // 親の.tool-card-fav-wrap側が.is-card-foldedでdisplay:noneのままだと
  // 検索結果が隠れたままになってしまう。そのため検索中は全カテゴリーを
  // 展開しておく必要があり、折り畳んだカテゴリーをここに記録しておく。
  var instances = [];

  function isCardItem(el) {
    return el.classList.contains("tool-card") || el.classList.contains("tool-card-fav-wrap");
  }

  function foldGrid(grid) {
    var items = Array.prototype.filter.call(grid.children, isCardItem);
    if (items.length <= FOLD_THRESHOLD) return;

    var hidden = items.slice(VISIBLE_COUNT);

    // トップページの「自分で目的から選ぶ」には、カテゴリー内の特定カードへ
    // #goal-xxx-target で直接ジャンプするリンクがある。そのリンク先が
    // 折り畳み対象に含まれている場合は、最初から折り畳まずに全件表示する
    // （ジャンプ直後にリンク先が隠れて見えない事態を避けるため）。
    var hash = window.location.hash;
    if (hash) {
      var target = null;
      try {
        target = document.querySelector(hash);
      } catch (e) {
        target = null;
      }
      if (target && hidden.indexOf(target.closest(".tool-card-fav-wrap") || target) !== -1) {
        return;
      }
    }

    for (var i = 0; i < hidden.length; i++) {
      hidden[i].classList.add("is-card-folded");
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-fold-toggle";

    function render(expanded) {
      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
      btn.textContent = expanded ? "表示を少なくする ▲" : "さらに" + hidden.length + "件を表示 ▼";
    }
    render(false);

    btn.addEventListener("click", function () {
      var expanded = btn.getAttribute("aria-expanded") === "true";
      var next = !expanded;
      for (var i = 0; i < hidden.length; i++) {
        hidden[i].classList.toggle("is-card-folded", !next);
      }
      render(next);
      if (!next) {
        // 折り畳んだ直後、ボタンがジャンプして見失われないよう押した位置を保つ。
        btn.scrollIntoView({ block: "nearest" });
      }
    });

    grid.insertAdjacentElement("afterend", btn);
    instances.push({ hidden: hidden, render: render });
  }

  function expandAllForSearch() {
    for (var i = 0; i < instances.length; i++) {
      var instance = instances[i];
      for (var j = 0; j < instance.hidden.length; j++) {
        instance.hidden[j].classList.remove("is-card-folded");
      }
      instance.render(true);
    }
  }

  function init() {
    var grids = document.querySelectorAll(".tool-category .tool-grid");
    for (var i = 0; i < grids.length; i++) {
      foldGrid(grids[i]);
    }

    var searchInput = document.getElementById("tool-search-input");
    if (searchInput) {
      if (searchInput.value.trim() !== "") expandAllForSearch();
      searchInput.addEventListener("input", function () {
        if (searchInput.value.trim() !== "") expandAllForSearch();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

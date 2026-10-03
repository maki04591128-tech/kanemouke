(function () {
  "use strict";

  // 解説記事ページの末尾に「あわせて読みたい記事」を表示する。
  // js/site-search-data.js（全ページ共通のタイトル・概要・カテゴリー一覧）から
  // 自分と同じカテゴリーのガイド記事（type:"guide"）を抽出し、
  // 常に同じ上位数件に偏らないよう、自分の掲載順の「次」から循環的に最大4件選ぶ。
  // #related-articles-section / #related-articles-grid が無いページでは何もしない。

  var MAX_ITEMS = 4;

  var section = document.getElementById("related-articles-section");
  var grid = document.getElementById("related-articles-grid");
  if (!section || !grid) return;
  if (!window.SITE_SEARCH_DATA) return;

  function fileNameOf(href) {
    var noQuery = String(href || "").split("?")[0];
    return noQuery.substring(noQuery.lastIndexOf("/") + 1);
  }

  var currentFile = fileNameOf(window.location.pathname);
  var guides = window.SITE_SEARCH_DATA.filter(function (item) {
    return item.type === "guide";
  });

  var ownPos = -1;
  for (var i = 0; i < guides.length; i++) {
    if (fileNameOf(guides[i].href) === currentFile) {
      ownPos = i;
      break;
    }
  }
  if (ownPos === -1) return;

  var category = guides[ownPos].category;
  var categoryGuides = guides.filter(function (item) {
    return item.category === category;
  });
  // categoryGuidesの中での自分の位置を取り直す（guides全体の位置とは異なるため）。
  var ownPosInCategory = -1;
  for (i = 0; i < categoryGuides.length; i++) {
    if (fileNameOf(categoryGuides[i].href) === currentFile) {
      ownPosInCategory = i;
      break;
    }
  }
  if (ownPosInCategory === -1) return;

  var pickCount = Math.min(MAX_ITEMS, categoryGuides.length - 1);
  if (pickCount <= 0) return;

  var picks = [];
  for (i = 1; i <= pickCount; i++) {
    picks.push(categoryGuides[(ownPosInCategory + i) % categoryGuides.length]);
  }

  picks.forEach(function (item) {
    var card = document.createElement("a");
    card.className = "tool-card";
    card.href = fileNameOf(item.href);

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "解説記事";
    card.appendChild(badge);

    var h3 = document.createElement("h3");
    h3.textContent = item.title;
    card.appendChild(h3);

    var p = document.createElement("p");
    p.textContent = item.desc;
    card.appendChild(p);

    grid.appendChild(card);
  });

  section.hidden = false;

  if (window.FN_upgradeFavoriteCards) {
    window.FN_upgradeFavoriteCards(grid);
  }
})();

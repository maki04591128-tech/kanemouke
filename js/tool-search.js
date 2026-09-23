(function () {
  "use strict";

  var input = document.getElementById("tool-search-input");
  var clearBtn = document.getElementById("tool-search-clear");
  var status = document.getElementById("tool-search-status");
  var featured = document.getElementById("featured-section");
  var categoryNav = document.getElementById("category-nav");
  var categories = Array.prototype.slice.call(document.querySelectorAll(".tool-category"));
  if (!input || !status || categories.length === 0) return;

  var noResults = document.createElement("p");
  noResults.className = "tool-search-no-results is-search-hidden";
  noResults.textContent = "該当するツール・ガイドが見つかりませんでした。カテゴリー一覧からお探しください。";
  categoryNav.insertAdjacentElement("afterend", noResults);

  // 表記ゆれ（読み方・略称違い）を吸収するための同義語辞書。
  // キーの語がテキストに含まれていたら、値の語をすべて検索対象テキストに追加する。
  var SYNONYMS = [
    ["つみたて", ["積立"]],
    ["積立", ["つみたて"]],
    ["ideco", ["イデコ", "確定拠出年金"]],
    ["確定拠出年金", ["ideco"]],
    ["イデコ", ["ideco"]],
    ["nisa", ["ニーサ"]],
    ["ニーサ", ["nisa"]]
  ];

  function expandWithSynonyms(text) {
    var extra = "";
    SYNONYMS.forEach(function (pair) {
      if (text.indexOf(pair[0]) !== -1) {
        extra += " " + pair[1].join(" ");
      }
    });
    return extra ? text + extra.toLowerCase() : text;
  }

  var cards = categories.map(function (section) {
    var categoryTitle = section.querySelector(".category-title");
    var categoryText = categoryTitle ? categoryTitle.textContent : "";
    return {
      section: section,
      items: Array.prototype.slice.call(section.querySelectorAll(".tool-card")).map(function (card) {
        var title = card.querySelector("h3");
        var desc = card.querySelector("p");
        var base = (
          (title ? title.textContent : "") + " " +
          (desc ? desc.textContent : "") + " " +
          categoryText
        ).toLowerCase();
        return {
          el: card,
          text: expandWithSynonyms(base)
        };
      })
    };
  });

  function reset() {
    cards.forEach(function (group) {
      group.section.classList.remove("is-search-hidden");
      group.items.forEach(function (item) {
        item.el.classList.remove("is-search-hidden");
      });
    });
    if (featured) featured.classList.remove("is-search-hidden");
    categoryNav.classList.remove("is-search-hidden");
    noResults.classList.add("is-search-hidden");
    status.textContent = "";
    clearBtn.hidden = true;
  }

  function search(query) {
    var total = 0;
    cards.forEach(function (group) {
      var visibleInSection = 0;
      group.items.forEach(function (item) {
        var match = item.text.indexOf(query) !== -1;
        item.el.classList.toggle("is-search-hidden", !match);
        if (match) visibleInSection++;
      });
      group.section.classList.toggle("is-search-hidden", visibleInSection === 0);
      total += visibleInSection;
    });
    if (featured) featured.classList.add("is-search-hidden");
    categoryNav.classList.add("is-search-hidden");
    noResults.classList.toggle("is-search-hidden", total > 0);
    status.textContent = total > 0 ? "検索結果：" + total + "件" : "";
    clearBtn.hidden = false;
  }

  input.addEventListener("input", function () {
    var query = input.value.trim().toLowerCase();
    if (query === "") {
      reset();
    } else {
      search(query);
    }
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    reset();
    input.focus();
  });
})();

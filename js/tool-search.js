(function () {
  "use strict";

  var input = document.getElementById("tool-search-input");
  var clearBtn = document.getElementById("tool-search-clear");
  var status = document.getElementById("tool-search-status");
  var featured = document.getElementById("featured-section");
  var goalNav = document.getElementById("goal-nav-section");
  var suggestions = document.getElementById("tool-search-suggestions");
  var categoryNav = document.querySelector(".category-nav");
  var searchBox = document.querySelector(".tool-search");
  var categories = Array.prototype.slice.call(document.querySelectorAll(".tool-category"));
  if (!input || !status || categories.length === 0) return;

  var noResults = document.createElement("div");
  noResults.className = "tool-search-no-results is-search-hidden";
  noResults.innerHTML =
    '<svg class="tool-search-no-results-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">' +
    '<circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"></circle>' +
    '<line x1="14" y1="14" x2="18" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line>' +
    '<line x1="6.5" y1="9" x2="11.5" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></line>' +
    '</svg>' +
    '<p>該当するツール・ガイドが見つかりませんでした。<br>別のキーワードでお試しいただくか、下のボタンから一覧をご覧ください。</p>' +
    '<button type="button" class="tool-search-no-results-reset">すべてのツール・ガイドを表示</button>';
  (searchBox || input).insertAdjacentElement("afterend", noResults);
  var noResultsReset = noResults.querySelector(".tool-search-no-results-reset");

  // 表記ゆれ（読み方・略称違い）を吸収するための同義語辞書。
  // キーの語がテキストに含まれていたら、値の語をすべて検索対象テキストに追加する。
  var SYNONYMS = [
    ["つみたて", ["積立"]],
    ["積立", ["つみたて"]],
    ["ideco", ["イデコ", "確定拠出年金"]],
    ["確定拠出年金", ["ideco"]],
    ["イデコ", ["ideco"]],
    ["nisa", ["ニーサ"]],
    ["ニーサ", ["nisa"]],
    ["ボーナス", ["賞与"]],
    ["賞与", ["ボーナス"]],
    ["ふるさと納税", ["寄付金控除", "寄付"]],
    ["退職金", ["退職所得", "退職一時金"]],
    ["退職所得", ["退職金"]],
    ["セミリタイア", ["fire"]],
    ["fire", ["セミリタイア"]],
    ["投資信託", ["ファンド"]],
    ["ファンド", ["投資信託"]],
    ["マイホーム", ["住宅ローン", "住宅"]],
    ["住宅ローン", ["マイホーム"]]
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
        var badge = card.querySelector(".badge");
        var base = (
          (title ? title.textContent : "") + " " +
          (desc ? desc.textContent : "") + " " +
          (badge ? badge.textContent : "") + " " +
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
    if (goalNav) goalNav.classList.remove("is-search-hidden");
    if (suggestions) suggestions.classList.remove("is-search-hidden");
    if (categoryNav) categoryNav.classList.remove("is-search-hidden");
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
    if (goalNav) goalNav.classList.add("is-search-hidden");
    if (suggestions) suggestions.classList.add("is-search-hidden");
    if (categoryNav) categoryNav.classList.add("is-search-hidden");
    noResults.classList.toggle("is-search-hidden", total > 0);
    status.textContent = total > 0
      ? "検索結果：" + total + "件" + (total === 1 ? "（Enterキーで開けます）" : "")
      : "";
    clearBtn.hidden = false;
  }

  function getVisibleItems() {
    var visible = [];
    cards.forEach(function (group) {
      group.items.forEach(function (item) {
        if (!item.el.classList.contains("is-search-hidden")) {
          visible.push(item.el);
        }
      });
    });
    return visible;
  }

  input.addEventListener("input", function () {
    var query = input.value.trim().toLowerCase();
    if (query === "") {
      reset();
    } else {
      search(query);
    }
  });

  // 検索結果が1件に絞られた状態でEnterキーを押すと、そのツール・ガイドへ直接遷移する。
  // 日本語入力（IME）の変換確定でのEnterと誤反応しないよう、変換中は無視する。
  input.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    if (input.value.trim() === "") return;
    var visible = getVisibleItems();
    if (visible.length === 1) {
      event.preventDefault();
      window.location.href = visible[0].getAttribute("href");
    }
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    reset();
    input.focus();
  });

  noResultsReset.addEventListener("click", function () {
    input.value = "";
    reset();
    input.focus();
  });

  if (suggestions) {
    Array.prototype.slice.call(suggestions.querySelectorAll(".tool-search-suggestion")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = btn.textContent;
        input.dispatchEvent(new Event("input"));
        input.focus();
      });
    });
  }
})();

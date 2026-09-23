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

  var cards = categories.map(function (section) {
    return {
      section: section,
      items: Array.prototype.slice.call(section.querySelectorAll(".tool-card")).map(function (card) {
        var title = card.querySelector("h3");
        var desc = card.querySelector("p");
        return {
          el: card,
          text: ((title ? title.textContent : "") + " " + (desc ? desc.textContent : "")).toLowerCase()
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

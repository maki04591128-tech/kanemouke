(function () {
  "use strict";

  // お気に入り機能。
  // 既存の「前回の続きから」（js/recent-tools.js）は訪問履歴を自動記録するだけで、
  // ユーザー自身が「あとで見返したいツール」を能動的に選んで残すことはできなかった。
  // ここでは全ページの.tool-card（トップページの各カテゴリー・各記事末尾の
  // 「あわせて使いたい関連シミュレーター」を含む）に★ボタンを動的に追加し、
  // 選んだツール・記事をlocalStorageに保存、トップページに一覧表示する。
  // 既存カードのHTMLは変更せず、ラッパーとボタンをJS側で外側に足すだけにしている。

  var STORAGE_KEY = "fn_favorite_tools";

  function readList() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeList(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // localStorageが使えない環境（プライベートブラウズ等）では保存を諦める。
      // ★ボタン自体は押せるが、次回訪問時には引き継がれない。
    }
  }

  function findIndex(list, url) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === url) return i;
    }
    return -1;
  }

  // 現在のページから見た相対href（"pages/xxx.html"や"../xxx.html"等、
  // ページの階層によって書き方が異なる）を、どのページから見ても同じ値になる
  // 絶対パスに変換する。同じツールを複数ページの「関連ツール」欄から
  // それぞれ★登録しても、1件の同じお気に入りとして扱うために必要。
  function canonicalUrl(href) {
    var url = new URL(href, window.location.href);
    return url.pathname + url.search;
  }

  var STAR_SVG =
    '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path d="M10 2.6l2.29 4.64 5.12.75-3.7 3.61.87 5.1L10 14.36l-4.58 2.34.87-5.1-3.7-3.61 5.12-.75L10 2.6z" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"></path>' +
    "</svg>";

  function setButtonState(btn, active) {
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.setAttribute("aria-label", active ? "お気に入りから削除" : "お気に入りに追加");
  }

  function syncButtons(url, active) {
    var btns = document.querySelectorAll(".tool-card-fav-btn");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute("data-fav-url") === url) {
        setButtonState(btns[i], active);
      }
    }
  }

  function toggleFavorite(url, title, category) {
    var list = readList();
    var idx = findIndex(list, url);
    var active;
    if (idx !== -1) {
      list.splice(idx, 1);
      active = false;
    } else {
      list.unshift({ url: url, title: title, category: category || "", time: Date.now() });
      active = true;
    }
    writeList(list);
    syncButtons(url, active);
    renderFavoritesSection();
  }

  // カードが属するセクションの見出し（h2）や、既存の.badge（「解説記事」等）から
  // お気に入り一覧に表示するカテゴリーラベルを推測する。取得できなければ空のまま。
  function findCategory(card) {
    var badge = card.querySelector(".badge");
    if (badge && badge.textContent.trim() && !badge.classList.contains("featured-badge")) {
      return badge.textContent.trim();
    }
    var container = card.closest("section, #featured-section, #recent-tools-section, #favorite-tools-section");
    var heading = container ? container.querySelector("h2") : null;
    return heading ? heading.textContent.trim() : "";
  }

  function upgradeCard(card) {
    if (card.getAttribute("data-fav-ready")) return;
    var href = card.getAttribute("href");
    var h3 = card.querySelector("h3");
    var title = h3 ? h3.textContent.trim() : "";
    if (!href || !title) return;
    card.setAttribute("data-fav-ready", "1");

    var url = canonicalUrl(href);
    var category = findCategory(card);

    var wrap = document.createElement("div");
    wrap.className = "tool-card-fav-wrap";
    card.parentNode.insertBefore(wrap, card);
    wrap.appendChild(card);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-card-fav-btn";
    btn.setAttribute("data-fav-url", url);
    btn.setAttribute("data-fav-title", title);
    btn.setAttribute("data-fav-category", category);
    btn.innerHTML = STAR_SVG;
    setButtonState(btn, findIndex(readList(), url) !== -1);
    wrap.appendChild(btn);

    // ボタンはカードの<a>の外側（兄弟要素）に配置しているため、クリックしても
    // カードのリンク遷移は発生しない。stopPropagationは念のための保険。
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(
        btn.getAttribute("data-fav-url"),
        btn.getAttribute("data-fav-title"),
        btn.getAttribute("data-fav-category")
      );
    });
  }

  function upgradeCards(root) {
    var cards = (root || document).querySelectorAll(".tool-card[href]:not([data-fav-ready])");
    for (var i = 0; i < cards.length; i++) {
      upgradeCard(cards[i]);
    }
  }

  var grid = document.getElementById("favorite-tools-grid");
  var section = document.getElementById("favorite-tools-section");

  function renderFavoritesSection() {
    if (!grid) return;
    var list = readList();
    grid.innerHTML = "";
    if (list.length === 0) {
      if (section) section.hidden = true;
      return;
    }
    list.forEach(function (item) {
      var link = document.createElement("a");
      link.className = "tool-card favorite-tool-card";
      link.href = item.url;

      if (item.category) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = item.category;
        link.appendChild(badge);
      }

      var h3 = document.createElement("h3");
      h3.textContent = item.title;
      link.appendChild(h3);

      grid.appendChild(link);
    });
    if (section) section.hidden = false;
    upgradeCards(grid);
  }

  renderFavoritesSection();
  upgradeCards(document);
})();

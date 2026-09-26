(function () {
  "use strict";

  // 全ページ共通の「ヘッダーからいつでもツールを検索」機能。
  // 従来、ツール横断検索はトップページ（index.html）の中ほどにある
  // tool-search.js（在页9カテゴリーのカードを絞り込む）でしか使えず、
  // 記事やハブページを読んでいる最中に別のツールを探すには、いったん
  // ヘッダーの「メニュー」からカテゴリー一覧を開くしかなかった。
  // ここではヘッダー右上に検索アイコンを追加し、js/site-search-data.js
  // （index.htmlと各ハブページのタブから自動生成したツール・記事一覧。
  // 件数は新規ツール・記事の追加のたびに増えるため、正確な件数は
  // window.SITE_SEARCH_DATA.length を参照すること）
  // を対象に、どのページからでもキーワードで直接ジャンプできるようにする。
  // 既存ページのHTMLは編集せず、scriptタグ2行の追加だけで動作する。

  var DATA = window.SITE_SEARCH_DATA;
  var header = document.querySelector(".site-header .container");
  var navToggle = header ? header.querySelector(".nav-toggle") : null;
  if (!header || !navToggle || !DATA || !DATA.length) return;

  // 現在のページが pages/ 配下かどうかで、データ内の "pages/xxx.html" という
  // ルート相対パスから実際にリンクすべき相対パスを組み立てる
  // （このサイトはルート直下のページと pages/ 配下の1階層しか存在しないため、
  // この単純な判定で全ページに対応できる。詳細は該当プロジェクトログ参照）。
  var inPagesDir = /\/pages\//.test(location.pathname);
  function resolveHref(href) {
    return inPagesDir ? href.replace(/^pages\//, "") : href;
  }

  // tool-search.js と同じ表記ゆれ辞書。独立して読み込まれるページが異なる
  // （こちらは全37ページ、tool-search.jsはindex.htmlのみ）ため、共有モジュール化
  // はせずあえて複製している。
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

  var items = DATA.map(function (d) {
    return {
      data: d,
      titleText: expandWithSynonyms(d.title.toLowerCase()),
      categoryText: expandWithSynonyms(d.category.toLowerCase()),
      text: expandWithSynonyms((d.title + " " + d.desc + " " + d.category).toLowerCase())
    };
  });

  // ハブページの「まとめ」カードは説明文に配下の全ツール名を列挙しているため
  // （例：nisa-hubのdescに「…暴落シナリオの8ツールを…」を含む）、本文一致だけで
  // 並べると、個別ツール名で検索したときに常にまとめカード（既定タブ）が
  // 先頭に来てしまい、Enterキーでの直接ジャンプが意図と違うタブに着地する。
  // タイトル一致 → カテゴリー一致 → 本文一致のみ、の順で優先度を下げて防ぐ。
  function matchRank(item, query) {
    if (item.titleText.indexOf(query) !== -1) return 0;
    if (item.categoryText.indexOf(query) !== -1) return 1;
    return 2;
  }

  var TYPE_LABEL = { hub: "まとめ", guide: "解説記事", tool: "ツール" };

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  var toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "site-search-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "site-search-panel");
  toggle.innerHTML =
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">' +
    '<circle cx="8.5" cy="8.5" r="6" stroke="currentColor" stroke-width="1.8"></circle>' +
    '<line x1="13.2" y1="13.2" x2="17.5" y2="17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></line>' +
    "</svg>" +
    '<span class="sr-only">ツールを検索</span>';

  // 既存の.nav-toggleを.site-header-actionsでラップし直し、検索ボタンと
  // 隣り合わせに配置する（appendChildは既存ノードを元の位置から移動させるだけ
  // なので、nav-toggle.jsが参照しているボタン自体には手を加えない）。
  var actions = document.createElement("div");
  actions.className = "site-header-actions";
  header.insertBefore(actions, navToggle);
  actions.appendChild(toggle);
  actions.appendChild(navToggle);

  var panel = document.createElement("div");
  panel.className = "site-search-panel";
  panel.id = "site-search-panel";
  panel.hidden = true;
  panel.innerHTML =
    '<label class="sr-only" for="site-search-input">ツール・ガイドをキーワードで検索</label>' +
    '<div class="site-search-box">' +
    '<svg class="site-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">' +
    '<circle cx="8.5" cy="8.5" r="6" stroke="currentColor" stroke-width="1.6"></circle>' +
    '<line x1="13.2" y1="13.2" x2="17.5" y2="17.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></line>' +
    "</svg>" +
    '<input type="search" id="site-search-input" class="site-search-input" placeholder="例：ふるさと納税、住宅ローン、相続税…" autocomplete="off">' +
    "</div>" +
    '<p class="site-search-status" id="site-search-status" aria-live="polite"></p>' +
    '<ul class="site-search-results" id="site-search-results"></ul>';
  header.appendChild(panel);

  var input = panel.querySelector("#site-search-input");
  var status = panel.querySelector("#site-search-status");
  var resultsEl = panel.querySelector("#site-search-results");
  var MAX_RESULTS = 8;
  var currentResults = [];
  // キーボードだけで操作するユーザーは従来Enterキーで先頭の結果にしか
  // 直接ジャンプできず、2件目以降を開くにはマウスでクリックするか、
  // Tabキーで1件ずつフォーカスを送る必要があった。矢印キーで結果リスト内を
  // 移動できるようにし（フォーカス自体は入力欄に残したままaria-activedescendant
  // で選択中の項目を伝えるcombobox形式のパターン）、視覚的にもハイライト表示する。
  var activeIndex = -1;

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "site-search-results");
  resultsEl.setAttribute("role", "listbox");

  function setActiveIndex(index) {
    var links = resultsEl.querySelectorAll(".site-search-result");
    if (links[activeIndex]) {
      links[activeIndex].classList.remove("is-active");
      links[activeIndex].removeAttribute("aria-selected");
    }
    activeIndex = index;
    if (links[activeIndex]) {
      links[activeIndex].classList.add("is-active");
      links[activeIndex].setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", links[activeIndex].id);
      links[activeIndex].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function renderResults() {
    resultsEl.innerHTML = "";
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-expanded", currentResults.length > 0 ? "true" : "false");
    currentResults.slice(0, MAX_RESULTS).forEach(function (item, index) {
      var li = document.createElement("li");
      li.setAttribute("role", "presentation");
      var a = document.createElement("a");
      a.className = "site-search-result";
      a.id = "site-search-result-" + index;
      a.setAttribute("role", "option");
      a.href = resolveHref(item.data.href);
      a.innerHTML =
        '<span class="site-search-result-type">' + TYPE_LABEL[item.data.type] + "</span>" +
        '<span class="site-search-result-title">' + escapeHtml(item.data.title) + "</span>" +
        '<span class="site-search-result-desc">' + escapeHtml(item.data.desc) + "</span>";
      li.appendChild(a);
      resultsEl.appendChild(li);
    });
  }

  function doSearch(query) {
    query = query.trim().toLowerCase();
    if (query === "") {
      currentResults = [];
      resultsEl.innerHTML = "";
      status.textContent = "";
      return;
    }
    currentResults = items
      .filter(function (item) {
        return item.text.indexOf(query) !== -1;
      })
      .sort(function (a, b) {
        return matchRank(a, query) - matchRank(b, query);
      });
    renderResults();
    if (currentResults.length === 0) {
      status.textContent = "該当するツール・ガイドが見つかりませんでした。";
    } else {
      status.textContent =
        "検索結果：" + currentResults.length + "件" +
        (currentResults.length > MAX_RESULTS ? "（上位" + MAX_RESULTS + "件を表示）" : "") +
        "（Enterキーで先頭の結果を開けます）";
    }
  }

  function openPanel() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    input.value = "";
    doSearch("");
    window.setTimeout(function () {
      input.focus();
    }, 0);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKeydown);
  }

  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onDocKeydown);
  }

  function onDocClick(event) {
    if (panel.contains(event.target) || toggle.contains(event.target)) return;
    closePanel();
  }

  function onDocKeydown(event) {
    if (event.key === "Escape") {
      closePanel();
      toggle.focus();
    }
  }

  toggle.addEventListener("click", function () {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  input.addEventListener("input", function () {
    doSearch(input.value);
  });

  // 検索結果が絞り込まれた状態でEnterキーを押すと、矢印キーで選択中の結果
  // （未選択なら先頭の結果）へ直接遷移する。日本語入力（IME）の変換確定での
  // Enterと誤反応しないよう、変換中は無視する。
  input.addEventListener("keydown", function (event) {
    var shownCount = Math.min(currentResults.length, MAX_RESULTS);
    if (event.key === "ArrowDown" && shownCount > 0) {
      event.preventDefault();
      setActiveIndex(activeIndex < shownCount - 1 ? activeIndex + 1 : 0);
      return;
    }
    if (event.key === "ArrowUp" && shownCount > 0) {
      event.preventDefault();
      setActiveIndex(activeIndex > 0 ? activeIndex - 1 : shownCount - 1);
      return;
    }
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    if (currentResults.length === 0) return;
    event.preventDefault();
    var target = activeIndex >= 0 ? currentResults[activeIndex] : currentResults[0];
    window.location.href = resolveHref(target.data.href);
  });
})();

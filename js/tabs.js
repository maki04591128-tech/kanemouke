(function () {
  "use strict";

  // 統合ハブページ（複数シミュレーターをタブ切り替えでまとめたページ）
  // 共通のタブ切り替えロジック。ARIA tabs パターンに準拠し、
  // ?tool=<slug> でのディープリンク、localStorage による最終選択タブの
  // 記憶、非表示タブ内の Chart.js グラフをタブ表示時にリサイズする
  // 処理を提供する。タブが存在しないページでは何もしない。

  var tabList = document.getElementById("hub-tabs");
  if (!tabList) return;

  var tabs = Array.prototype.slice.call(tabList.querySelectorAll(".hub-tab"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".tab-panel"));
  if (tabs.length === 0 || panels.length === 0) return;

  var storageKey = "hubTab:" + window.location.pathname;

  // スマホ幅の.hub-tabsは横スクロールのチップ列になり、css/style.cssの
  // 固定マスクで両端に常時フェードをかけ「まだ続きがある」ことを示す。
  // しかし固定フェードだと、実際に左端・右端までスクロールし切った後も
  // 同じフェードが残り、「まだ隠れたタブがある」という誤った手がかりに
  // なってしまう（118回目のブラッシュアップで確認）。スクロール位置に
  // 応じて--hub-tabs-fade-left/rightを更新し、その端まで到達したら
  // フェードを消すことで、フェードが「実際にスクロールできる方向」だけ
  // を正確に示すようにする。タブ数が少なく横スクロールが発生しない
  // ページ（fire-hub・souzoku-hub等）では両端とも0になり、フェード自体
  // が出ない。CSS側は変数未設定時のフォールバックとして20pxを使うため、
  // JS無効環境でも従来どおりの見た目（両端フェード）のまま動作する。
  function updateTabsScrollFade() {
    var maxScroll = tabList.scrollWidth - tabList.clientWidth;
    if (maxScroll <= 1) {
      tabList.style.setProperty("--hub-tabs-fade-left", "0px");
      tabList.style.setProperty("--hub-tabs-fade-right", "0px");
      return;
    }
    var threshold = 4;
    tabList.style.setProperty(
      "--hub-tabs-fade-left",
      tabList.scrollLeft <= threshold ? "0px" : "20px"
    );
    tabList.style.setProperty(
      "--hub-tabs-fade-right",
      tabList.scrollLeft >= maxScroll - threshold ? "0px" : "20px"
    );
  }
  tabList.addEventListener("scroll", updateTabsScrollFade, { passive: true });
  window.addEventListener("resize", updateTabsScrollFade);
  updateTabsScrollFade();

  function panelFor(slug) {
    return panels.filter(function (p) { return p.dataset.tool === slug; })[0];
  }

  function activate(slug, opts) {
    var options = opts || {};
    var found = false;
    tabs.forEach(function (tab) {
      var isActive = tab.dataset.tool === slug;
      if (isActive) found = true;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    if (!found) return false;

    var activeTab = tabs.filter(function (t) { return t.dataset.tool === slug; })[0];
    if (activeTab && typeof activeTab.scrollIntoView === "function") {
      // スマホ幅ではタブ列が横スクロールになる（css/style.cssの
      // @media (max-width: 760px) 内の.hub-tabs参照）ため、ディープ
      // リンク・キーボード操作・クリックのいずれで選択された場合も
      // 選択中タブ自体が横方向にスクロール範囲外へ隠れないようにする。
      // block: "nearest" によりページ自体の縦スクロール位置は変えない。
      activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    panels.forEach(function (panel) {
      if (panel.dataset.tool === slug) {
        panel.hidden = false;
      } else {
        panel.hidden = true;
      }
    });

    try {
      window.localStorage.setItem(storageKey, slug);
    } catch (e) {
      // localStorage が使えない環境（プライベートブラウズ等）では無視する。
    }

    if (!options.skipHistory) {
      var params = new URLSearchParams(window.location.search);
      params.set("tool", slug);
      var newUrl = window.location.pathname + "?" + params.toString();
      window.history.replaceState(null, "", newUrl);
    }

    // 非表示だったタブの Chart.js グラフは幅0で初期化されていることがある
    // ため、表示切り替え後に resize イベントを発火してレイアウトを合わせる。
    window.requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });

    document.dispatchEvent(new CustomEvent("hubtabchange", { detail: { tool: slug } }));
    return true;
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      activate(tab.dataset.tool);
    });
    tab.addEventListener("keydown", function (event) {
      var targetIndex = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        targetIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        targetIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = tabs.length - 1;
      }
      if (targetIndex !== null) {
        event.preventDefault();
        tabs[targetIndex].focus();
        activate(tabs[targetIndex].dataset.tool);
      }
    });
  });

  // よく使われるタブへのショートカット（.hub-quick-link[data-tool]）。
  // タブ数が多いハブページの一部にのみ存在するマークアップだが、
  // タブ切り替えロジックはここに共通化しておくことで、今後別のハブ
  // ページに同じマークアップを追加するだけで自動的に動くようにする。
  // クリックでタブを切り替えた後、.hub-tabs自体を読み飛ばして計算
  // フォーム（対応するタブパネル）まで直接スクロールする。
  var quickLinks = Array.prototype.slice.call(document.querySelectorAll(".hub-quick-link"));
  quickLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      var slug = link.dataset.tool;
      if (!activate(slug)) return;
      var panel = panelFor(slug);
      if (panel && typeof panel.scrollIntoView === "function") {
        panel.scrollIntoView({ block: "start" });
      }
    });
  });

  var initialSlug = null;
  var fromUrl = new URLSearchParams(window.location.search).get("tool");
  if (fromUrl && panelFor(fromUrl)) {
    initialSlug = fromUrl;
  } else {
    try {
      var stored = window.localStorage.getItem(storageKey);
      if (stored && panelFor(stored)) initialSlug = stored;
    } catch (e) {
      // ignore
    }
  }
  if (!initialSlug) initialSlug = tabs[0].dataset.tool;

  activate(initialSlug, { skipHistory: !!fromUrl && fromUrl === initialSlug });

  window.getActiveHubTool = function () {
    var current = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0];
    return current ? current.dataset.tool : null;
  };
})();

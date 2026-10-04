(function () {
  "use strict";

  // 解説記事内の表（.article-section .data-table）は、列数が多いとスマホ幅で
  // 横スクロールが必要になる（style.cssでdisplay:block; overflow-x:autoを付与）。
  // このスクロール領域はマウス・タッチでは操作できるが、キーボードだけでは
  // フォーカスが当たらずスクロールできなかった（axe-coreのscrollable-region-focusable
  // 相当の問題）。tabindexを付与してキーボードでも矢印キーでスクロールできるようにし、
  // 直前の見出しからアクセシブルネームを補うことで読み上げ環境でも表の内容が分かるようにする。
  //
  // 同種の問題は、ハブページのグラフ数値データ表・試算結果比較表を囲む
  // <div class="table-wrap">（style.cssでoverflow-x:autoを付与）にもある。
  // 比較表（js/result-history.js）は比較件数が増えるほど列数が増え、
  // 実測でPC幅（1280px）でも2件比較時点でスクロール領域化することを
  // axe-coreのscrollable-region-focusableで確認済み。こちらは静的HTML内の
  // 表と違いページ読み込み後にJSで生成されるため、生成側からも呼べる
  // enhanceTableWrapA11y()を公開する。

  function labelFor(table) {
    if (table.hasAttribute("aria-label") || table.querySelector("caption")) return null;
    var el = table.previousElementSibling;
    while (el) {
      if (/^H[2-4]$/.test(el.tagName)) {
        var text = el.textContent.trim();
        return text ? text + "の表" : null;
      }
      el = el.previousElementSibling;
    }
    return null;
  }

  // タブ名（role="tabpanel"のaria-labelledby先のボタン文言）か、無ければ最も近い
  // .article-section/sectionの見出しを、表の文脈を示す「持ち主」の名前として使う。
  function ownerName(wrap) {
    var tabpanel = wrap.closest('[role="tabpanel"]');
    if (tabpanel) {
      var labelledby = tabpanel.getAttribute("aria-labelledby");
      var btn = labelledby ? document.getElementById(labelledby) : null;
      if (btn) {
        var btnText = btn.textContent.trim();
        if (btnText) return btnText;
      }
    }
    var section = wrap.closest("section, .article-section");
    if (section) {
      var heading = section.querySelector("h1, h2, h3");
      if (heading) {
        var headingText = heading.textContent.trim();
        if (headingText) return headingText;
      }
    }
    return null;
  }

  function labelForWrap(wrap) {
    var details = wrap.closest("details.chart-data-details");
    if (details) {
      var summary = details.querySelector("summary");
      if (summary) {
        var summaryText = summary.textContent.trim();
        if (summaryText) return summaryText;
      }
    }
    // 「配分方法ごとの毎月の内訳」のように、表の直前ではなくラップ内自身に
    // 見出しを持つ結果表（nisa-hub/ideco-hubの一部タブなど）はその見出しをそのまま使う。
    var innerHeading = wrap.querySelector("h2, h3, h4");
    if (innerHeading) {
      var innerText = innerHeading.textContent.trim();
      if (innerText) return innerText;
    }
    var el = wrap.previousElementSibling;
    while (el) {
      if (/^H[2-4]$/.test(el.tagName)) {
        var text = el.textContent.trim();
        return text ? text + "の表" : null;
      }
      el = el.previousElementSibling;
    }
    // 見出しもグラフ凡例も持たない内訳表（例：nenshu-hub/souzoku-hubの
    // 「試算結果の内訳」テーブル）は、所属タブ・セクション名から文脈を補う。
    var owner = ownerName(wrap);
    if (owner) {
      var isResultTable = !!wrap.querySelector(".data-table--result");
      return owner + (isResultTable ? "の試算結果の内訳" : "の表");
    }
    return null;
  }

  // 祖先に非表示タブ（hidden属性）を持つ要素は、同じ名前の表が他にあっても
  // 同時に読み上げられることが無いため、連番付けの対象から除外してよい。
  function hasHiddenAncestor(el) {
    while (el) {
      if (el.hasAttribute && el.hasAttribute("hidden")) return true;
      el = el.parentElement;
    }
    return false;
  }

  // landmark-unique対策：同じaria-labelを持つregionが、同時に表示されうる範囲
  // （非表示タブの外）に既にあれば、"(2)"のように連番を付けて必ず一意な名前にする。
  function uniqueLabel(candidate, wrap) {
    if (!candidate) return candidate;
    if (hasHiddenAncestor(wrap)) return candidate;
    var existing = document.querySelectorAll('[role="region"][aria-label]');
    var used = {};
    for (var i = 0; i < existing.length; i++) {
      if (hasHiddenAncestor(existing[i])) continue;
      used[existing[i].getAttribute("aria-label")] = true;
    }
    if (!used[candidate]) return candidate;
    var n = 2;
    while (used[candidate + " (" + n + ")"]) n++;
    return candidate + " (" + n + ")";
  }

  function enhanceTableWrapA11y(wrap, explicitLabel) {
    if (!wrap) return;
    if (!wrap.hasAttribute("tabindex")) wrap.setAttribute("tabindex", "0");
    if (!wrap.hasAttribute("role")) wrap.setAttribute("role", "region");
    if (!wrap.hasAttribute("aria-label")) {
      var label = explicitLabel || labelForWrap(wrap) || ownerName(wrap);
      if (label) wrap.setAttribute("aria-label", uniqueLabel(label, wrap));
    }
  }
  window.enhanceTableWrapA11y = enhanceTableWrapA11y;

  function init() {
    var tables = document.querySelectorAll(".article-section .data-table");
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (!table.hasAttribute("tabindex")) table.setAttribute("tabindex", "0");
      var label = labelFor(table);
      if (label) table.setAttribute("aria-label", label);
    }

    var wraps = document.querySelectorAll(".table-wrap");
    for (var j = 0; j < wraps.length; j++) {
      enhanceTableWrapA11y(wraps[j]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

(function () {
  "use strict";

  // 本文中に見出し（<h2>）が複数ある縦に長いページ向けの目次（目的地への
  // ジャンプリンク）を動的に生成する。解説記事だけでなく、プライバシー
  // ポリシー等の規約ページのように見出しが多いページでもスクロールで
  // 現在地を見失いやすいため、ページタイトル直下に折りたたみ式の目次を
  // 挿入し、見出しへ直接ジャンプできるようにする（既存HTMLを個別編集せず、
  // scriptタグ1行の追加だけで動作する）。

  var MIN_HEADINGS = 3;

  function slugify(index) {
    return "toc-section-" + (index + 1);
  }

  function buildToc() {
    var pageTitle = document.querySelector("main .page-title");
    if (!pageTitle) return;

    var headings = document.querySelectorAll("main .article-section > h2");
    if (headings.length < MIN_HEADINGS) return;

    var nav = document.createElement("nav");
    nav.className = "toc";
    nav.setAttribute("aria-label", "目次");

    var details = document.createElement("details");
    details.className = "toc-details";
    details.open = true;

    var summary = document.createElement("summary");
    summary.className = "toc-summary";
    summary.textContent = "目次（" + headings.length + "項目）";
    details.appendChild(summary);

    var list = document.createElement("ol");
    list.className = "toc-list";

    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      if (!heading.id) {
        heading.id = slugify(i);
      }
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#" + heading.id;
      link.textContent = heading.textContent;
      item.appendChild(link);
      list.appendChild(item);
    }

    details.appendChild(list);
    nav.appendChild(details);
    pageTitle.insertAdjacentElement("afterend", nav);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildToc);
  } else {
    buildToc();
  }
})();

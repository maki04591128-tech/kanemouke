(function () {
  "use strict";

  // トップページには「積立・新NISA」「iDeCo・小規模企業共済」など9つの
  // カテゴリー別ツールセクションが縦に並んでおり、モバイル表示では
  // ページ全体が1万pxを超える。カテゴリー間を行き来するにはページ上部の
  // 「自分で目的から選ぶ」まで戻る必要があり不便なため、ツール一覧の直前に
  // 各カテゴリーへワンタップで移動できる横スクロール式のクイックナビを
  // 動的に生成し、スクロール中もヘッダー直下に固定表示する。

  var categories = Array.prototype.slice.call(document.querySelectorAll(".tool-category"));
  if (categories.length < 4) return;

  var anchor = document.querySelector(".tool-search") || categories[0];
  if (!anchor || !anchor.parentNode) return;

  var nav = document.createElement("nav");
  nav.className = "category-nav";
  nav.setAttribute("aria-label", "カテゴリー一覧");

  var inner = document.createElement("div");
  inner.className = "category-nav-inner";
  nav.appendChild(inner);

  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var links = [];
  categories.forEach(function (section) {
    var titleEl = section.querySelector(".category-title");
    if (!section.id || !titleEl) return;
    var a = document.createElement("a");
    a.href = "#" + section.id;
    a.className = "category-nav-pill";
    a.textContent = titleEl.textContent;
    inner.appendChild(a);
    links.push({ section: section, el: a });
  });
  if (links.length < 4) return;

  anchor.insertAdjacentElement("afterend", nav);

  function setActive(id) {
    links.forEach(function (link) {
      var active = link.section.id === id;
      link.el.classList.toggle("is-active", active);
      if (active) {
        link.el.setAttribute("aria-current", "true");
        var target = link.el.offsetLeft - (inner.clientWidth - link.el.offsetWidth) / 2;
        inner.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion ? "auto" : "smooth" });
      } else {
        link.el.removeAttribute("aria-current");
      }
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        });
      },
      { rootMargin: "-140px 0px -75% 0px", threshold: 0 }
    );
    links.forEach(function (link) {
      observer.observe(link.section);
    });
  }

  links.forEach(function (link) {
    link.el.addEventListener("click", function () {
      setActive(link.section.id);
    });
  });
})();

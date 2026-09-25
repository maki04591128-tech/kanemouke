(function () {
  "use strict";

  // 統合ハブページの試算結果を、プレーンテキストとしてクリップボードへ
  // コピーする機能。「結果を画像で保存/シェア」（result-image.js）は
  // Web Share API非対応のデスクトップブラウザだとPNGのダウンロードにしか
  // ならず、LINEやメールの本文にそのまま貼り付けるには画像を開いて
  // 見比べながら手入力し直す手間がかかる。テキストなら画像を経由せず
  // 直接チャット・メール本文へ貼り付けられるため、画像共有を補完する。

  var btn = document.getElementById("text-result-btn");
  if (!btn) return;

  var feedback = document.getElementById("share-url-feedback");
  var feedbackTimer = null;
  function showFeedback(message) {
    if (!feedback) return;
    feedback.textContent = message;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () {
      feedback.textContent = "";
    }, 4000);
  }

  function activeResultColumn() {
    var scope = document.querySelector(".tab-panel:not([hidden])") || document;
    var layout = scope.querySelector(".calc-layout");
    if (!layout) return null;
    var panel = layout.querySelector(".panel");
    return panel ? panel.nextElementSibling : null;
  }

  function activeToolLabel() {
    var tab = document.querySelector('.hub-tab[aria-selected="true"]');
    return tab ? tab.textContent.trim() : "";
  }

  function collectLines(resultCol) {
    var lines = [];
    var banner = resultCol.querySelector(".verdict-banner");
    if (banner) {
      var verdictEl = banner.querySelector("span[id]");
      var subEl = banner.querySelector(".sub");
      var value = verdictEl ? verdictEl.textContent.trim() : "";
      if (value && value !== "-") {
        lines.push("診断結果：" + value);
        var sub = subEl ? subEl.textContent.trim() : "";
        if (sub) lines.push(sub);
      }
    }
    Array.prototype.slice.call(resultCol.querySelectorAll(".result-card")).forEach(function (card) {
      var labelEl = card.querySelector(".label");
      var valueEl = card.querySelector(".value");
      if (!labelEl || !valueEl) return;
      var value = valueEl.textContent.replace(/\s+/g, " ").trim();
      if (!value || value === "-") return;
      lines.push(labelEl.textContent.trim() + "：" + value);
    });
    return lines;
  }

  function buildText() {
    var resultCol = activeResultColumn();
    if (!resultCol) return null;
    var lines = collectLines(resultCol);
    if (lines.length === 0) return null;

    var titleEl = document.querySelector(".page-title h1");
    var title = titleEl ? titleEl.textContent.trim() : document.title.split("|")[0].trim();
    var toolLabel = activeToolLabel();
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = canonical ? canonical.href : window.location.href;

    var parts = [];
    parts.push("【ふやすノート】" + title + (toolLabel ? "（" + toolLabel + "）" : ""));
    parts.push("");
    parts = parts.concat(lines);
    parts.push("");
    parts.push(url);
    parts.push("※本試算結果は入力条件に基づく参考値です。将来の成果を保証するものではありません。");
    return parts.join("\n");
  }

  // js/share.js の copyText() と同じフォールバック実装（Clipboard API
  // 非対応環境向けの一時<textarea>＋execCommand("copy")）。
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var temp = document.createElement("textarea");
      temp.value = text;
      temp.setAttribute("readonly", "");
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand("copy") ? resolve() : reject();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(temp);
      }
    });
  }

  btn.addEventListener("click", function () {
    var text = buildText();
    if (!text) {
      showFeedback("コピーできる試算結果がありません。");
      return;
    }
    copyText(text).then(
      function () {
        showFeedback("結果をテキストでコピーしました。");
      },
      function () {
        showFeedback("コピーできませんでした。");
      }
    );
  });
})();

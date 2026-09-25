(function () {
  "use strict";

  // 統合ハブページの試算結果を、SNSやメッセージアプリで共有しやすい
  // 1枚のPNG画像としてダウンロードする機能。外部ライブラリは使わず、
  // Canvas APIだけで「サイト名＋ツール名＋現在の結果カード」を
  // ブランドカラーのカードレイアウトで描画する。
  // 既存の「URLをコピー」「印刷・PDF保存」ボタンと同じshare-box内に
  // 設置し、画像を見た人がURLからサイトへ来訪できるよう本文にURLを含める。

  var btn = document.getElementById("image-result-btn");
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

  // Web Share API（ファイル共有）に対応した環境かどうかを判定する。
  // 対応していれば「保存」ではなくOSの共有シートから直接LINE・X等へ
  // 画像を渡せるため、ダウンロードより一手間少ない体験になる。
  function supportsFileShare() {
    if (!(window.File && navigator.share && navigator.canShare)) return false;
    try {
      var testFile = new File([""], "test.png", { type: "image/png" });
      return navigator.canShare({ files: [testFile] });
    } catch (e) {
      return false;
    }
  }

  var fileShareReady = supportsFileShare();
  if (fileShareReady) {
    btn.textContent = "結果を画像でシェア";
    btn.setAttribute("aria-label", "現在の試算結果を画像として共有シートから直接シェア");
  }

  var FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
  var COLOR_BG = "#f7f9fb";
  var COLOR_HEADER_BG = "#0f5f4c";
  var COLOR_TEXT = "#1b2430";
  var COLOR_MUTED = "#5c6b7a";
  var COLOR_BORDER = "#e2e8ef";
  var COLOR_CARD_BG = "#ffffff";
  var COLOR_VALUE = "#0a4536";
  var COLOR_ACCENT = "#d98e04";

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

  function collectRows(resultCol) {
    var rows = [];
    var banner = resultCol.querySelector(".verdict-banner");
    if (banner) {
      var verdictEl = banner.querySelector("span[id]");
      var subEl = banner.querySelector(".sub");
      var value = verdictEl ? verdictEl.textContent.trim() : "";
      if (value && value !== "-") {
        rows.push({
          label: "診断結果",
          value: value,
          sub: subEl ? subEl.textContent.trim() : "",
          accent: true
        });
      }
    }
    Array.prototype.slice.call(resultCol.querySelectorAll(".result-card")).forEach(function (card) {
      var labelEl = card.querySelector(".label");
      var valueEl = card.querySelector(".value");
      if (!labelEl || !valueEl) return;
      var value = valueEl.textContent.replace(/\s+/g, " ").trim();
      if (!value || value === "-") return;
      rows.push({
        label: labelEl.textContent.trim(),
        value: value,
        sub: "",
        accent: card.classList.contains("accent")
      });
    });
    return rows;
  }

  // 日本語は単語間にスペースが無いため、指定幅を超える直前で1文字ずつ折り返す。
  function wrapByChar(ctx, text, maxWidth) {
    var lines = [];
    var line = "";
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function buildImage() {
    var resultCol = activeResultColumn();
    if (!resultCol) return null;
    var rows = collectRows(resultCol);
    if (rows.length === 0) return null;

    var titleEl = document.querySelector(".page-title h1");
    var title = titleEl ? titleEl.textContent.trim() : document.title.split("|")[0].trim();
    var toolLabel = activeToolLabel();
    var canonical = document.querySelector('link[rel="canonical"]');
    var url = (canonical ? canonical.href : window.location.href).replace(/^https?:\/\//, "");

    var scale = 2;
    var W = 860;
    var padX = 44;
    var headerH = 92;
    var titleFont = "bold 27px " + FONT;
    var toolFont = "500 16px " + FONT;
    var labelFont = "15px " + FONT;
    var valueFont = "bold 23px " + FONT;
    var subFont = "14px " + FONT;
    var footerH = 80;

    var measure = document.createElement("canvas").getContext("2d");
    var cardWidth = W - padX * 2;
    var innerWidth = cardWidth - 18 * 2;

    measure.font = titleFont;
    var titleLines = wrapByChar(measure, title, cardWidth).slice(0, 2);

    var rowsLayout = rows.map(function (row) {
      measure.font = labelFont;
      var labelLines = wrapByChar(measure, row.label, innerWidth);
      measure.font = valueFont;
      var valueLines = wrapByChar(measure, row.value, innerWidth);
      var subLines = row.sub ? (measure.font = subFont, wrapByChar(measure, row.sub, innerWidth)) : [];
      var height = 18 * 2 + labelLines.length * 20 + 8 + valueLines.length * 30 + subLines.length * 20;
      return { row: row, labelLines: labelLines, valueLines: valueLines, subLines: subLines, height: height };
    });

    var rowGap = 14;
    var rowsTotalHeight = rowsLayout.reduce(function (sum, r) {
      return sum + r.height + rowGap;
    }, 0);
    var titleBlockHeight = titleLines.length * 34 + (toolLabel ? 24 : 0) + 16;
    var topGap = 32;
    var H = headerH + topGap + titleBlockHeight + rowsTotalHeight + footerH;

    var canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    var ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLOR_HEADER_BG;
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 24px " + FONT;
    ctx.fillText("ふやすノート", padX, 42);
    ctx.font = "13px " + FONT;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText("無料の資産形成シミュレーター", padX, 66);

    var y = headerH + topGap;
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = titleFont;
    titleLines.forEach(function (line) {
      y += 26;
      ctx.fillText(line, padX, y);
      y += 8;
    });
    if (toolLabel) {
      y += 24;
      ctx.font = toolFont;
      ctx.fillStyle = COLOR_MUTED;
      ctx.fillText("▶ " + toolLabel, padX, y);
    }
    y += 16;

    rowsLayout.forEach(function (item) {
      var cardTop = y;
      ctx.fillStyle = COLOR_CARD_BG;
      ctx.strokeStyle = COLOR_BORDER;
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(padX, cardTop, cardWidth, item.height, 12);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(padX, cardTop, cardWidth, item.height);
        ctx.strokeRect(padX, cardTop, cardWidth, item.height);
      }

      var innerY = cardTop + 18 + 14;
      ctx.font = labelFont;
      ctx.fillStyle = COLOR_MUTED;
      item.labelLines.forEach(function (line) {
        ctx.fillText(line, padX + 18, innerY);
        innerY += 20;
      });
      innerY += 8;
      ctx.font = valueFont;
      ctx.fillStyle = item.row.accent ? COLOR_ACCENT : COLOR_VALUE;
      item.valueLines.forEach(function (line) {
        ctx.fillText(line, padX + 18, innerY);
        innerY += 30;
      });
      if (item.subLines.length) {
        ctx.font = subFont;
        ctx.fillStyle = COLOR_MUTED;
        item.subLines.forEach(function (line) {
          ctx.fillText(line, padX + 18, innerY);
          innerY += 20;
        });
      }

      y += item.height + rowGap;
    });

    var footerTop = H - footerH;
    ctx.strokeStyle = COLOR_BORDER;
    ctx.beginPath();
    ctx.moveTo(padX, footerTop + 16);
    ctx.lineTo(W - padX, footerTop + 16);
    ctx.stroke();
    ctx.font = "12px " + FONT;
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(url, padX, footerTop + 40);
    ctx.fillText(
      "本試算結果は入力条件に基づく参考値です。将来の成果を保証するものではありません。",
      padX,
      footerTop + 60
    );

    return canvas;
  }

  function downloadCanvas(canvas, filename) {
    var link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showFeedback("画像を保存しました。");
  }

  function shareOrDownloadImage() {
    var canvas = buildImage();
    if (!canvas) return;
    var slug = (window.getActiveHubTool && window.getActiveHubTool()) || "result";
    var filename = "fuyasu-note-" + slug + ".png";

    if (!fileShareReady) {
      downloadCanvas(canvas, filename);
      return;
    }

    canvas.toBlob(function (blob) {
      if (!blob) {
        downloadCanvas(canvas, filename);
        return;
      }
      var file = new File([blob], filename, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) {
        downloadCanvas(canvas, filename);
        return;
      }
      navigator
        .share({
          files: [file],
          title: "ふやすノート",
          text: document.title.split("|")[0].trim()
        })
        .then(function () {
          showFeedback("画像を共有しました。");
        })
        .catch(function (err) {
          // AbortError はユーザーが共有シートを閉じただけなので何もしない。
          if (err && err.name === "AbortError") return;
          downloadCanvas(canvas, filename);
        });
    }, "image/png");
  }

  btn.addEventListener("click", function () {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(shareOrDownloadImage);
    } else {
      shareOrDownloadImage();
    }
  });
})();

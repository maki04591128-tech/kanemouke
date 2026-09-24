(function () {
  "use strict";

  // Chart.js（折れ線・棒・円グラフ）の内容を、グラフが読めない・使えない
  // 利用者（スクリーンリーダー利用者、視覚に頼れない利用者）にも伝えるための
  // 補助テーブルを生成する。各ツールのjsファイルはグラフのツールチップ表示に
  // 使う金額・年数などのフォーマット関数（円/万円/％等）をすでにoptions内の
  // plugins.tooltip.callbacks.labelとして持っているため、ここでは新たに
  // フォーマットを実装せず、そのコールバック関数をそのまま呼び出して同じ
  // 表示文字列を再利用する（グラフ本体とテーブルの数値表記が食い違うのを防ぐ）。

  function textCell(tag, text) {
    var el = document.createElement(tag);
    el.textContent = text;
    return el;
  }

  function buildRow(cells, tag) {
    var tr = document.createElement("tr");
    cells.forEach(function (text) {
      tr.appendChild(textCell(tag, text));
    });
    return tr;
  }

  function getTooltipLabelCallback(chart) {
    var plugins = chart.options && chart.options.plugins;
    var tooltip = plugins && plugins.tooltip;
    var callbacks = tooltip && tooltip.callbacks;
    return callbacks && typeof callbacks.label === "function" ? callbacks.label : null;
  }

  // 円グラフ等は ctx.parsed が生の数値そのもの、折れ線・棒グラフ等は
  // ctx.parsed.y を参照する実装が既存jsファイル内で混在しているため、
  // 数値としての演算（value / total 等）と .y プロパティ参照の両方が
  // 成立するようNumberのラッパーオブジェクトに.yを生やして渡す。
  function makeParsed(point) {
    if (point && typeof point === "object") return point;
    var wrapped = Object(point);
    wrapped.y = point;
    return wrapped;
  }

  function fallbackText(point) {
    if (point && typeof point === "object" && !(point instanceof Number)) {
      var parts = [];
      if (point.x !== undefined) parts.push(Number(point.x).toLocaleString("ja-JP"));
      if (point.y !== undefined) parts.push(Number(point.y).toLocaleString("ja-JP"));
      return parts.join(" / ");
    }
    return Number(point).toLocaleString("ja-JP");
  }

  function looksBroken(text) {
    return !text || /undefined|NaN/.test(text) || /[:：]\s*$/.test(text);
  }

  function formatCell(labelCb, ctx, rawPoint) {
    if (labelCb) {
      try {
        var result = labelCb(ctx);
        var text = Array.isArray(result) ? result.join(" ") : String(result);
        if (!looksBroken(text)) return text;
      } catch (e) {
        // 想定外のcallback呼び出し失敗時は下のフォールバックに委ねる
      }
    }
    return fallbackText(rawPoint);
  }

  window.renderChartDataTable = function (tableId, chart) {
    var table = document.getElementById(tableId);
    if (!table || !chart || !chart.data) return;

    var labels = chart.data.labels;
    var datasets = chart.data.datasets || [];
    var labelCb = getTooltipLabelCallback(chart);
    var thead = document.createElement("thead");
    var tbody = document.createElement("tbody");

    if (labels && labels.length) {
      thead.appendChild(buildRow(["区分", "内容"], "th"));
      labels.forEach(function (label, i) {
        datasets.forEach(function (ds) {
          if (!ds.data || ds.data[i] === undefined || ds.data[i] === null) return;
          var point = ds.data[i];
          var ctx = { label: String(label), dataset: ds, parsed: makeParsed(point), dataIndex: i, chart: chart };
          tbody.appendChild(buildRow([String(label), formatCell(labelCb, ctx, point)], "td"));
        });
      });
    } else {
      thead.appendChild(buildRow(["系列", "内容"], "th"));
      datasets.forEach(function (ds) {
        (ds.data || []).forEach(function (point, i) {
          var ctx = { dataset: ds, parsed: makeParsed(point), dataIndex: i, chart: chart };
          tbody.appendChild(buildRow([ds.label || "", formatCell(labelCb, ctx, point)], "td"));
        });
      });
    }

    table.innerHTML = "";
    table.appendChild(thead);
    table.appendChild(tbody);
  };
})();

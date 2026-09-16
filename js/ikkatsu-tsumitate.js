(function () {
  "use strict";

  var els = {
    totalAmount: document.getElementById("totalAmount"),
    splitMonths: document.getElementById("splitMonths"),
    years: document.getElementById("years"),
    yearsOut: document.getElementById("yearsOut"),
    annualRate: document.getElementById("annualRate"),
    annualRateOut: document.getElementById("annualRateOut"),
    pattern: document.getElementById("pattern"),
    shockFields: document.getElementById("shockFields"),
    shockPct: document.getElementById("shockPct"),
    shockPctOut: document.getElementById("shockPctOut"),
    shockPctLabel: document.getElementById("shockPctLabel"),
    shockMonths: document.getElementById("shockMonths"),
    shockMonthsOut: document.getElementById("shockMonthsOut"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    resultPrincipal: document.getElementById("result-principal"),
    resultLump: document.getElementById("result-lump"),
    resultDca: document.getElementById("result-dca"),
    resultDiff: document.getElementById("result-diff"),
    breakdownBody: document.getElementById("breakdown-body"),
  };

  var chart = null;

  var PATTERN_LABEL = {
    flat: "変動なし（トレンド通りに一定ペースで上昇）",
    dip: "投資開始直後に一時的な下落（下落→回復）",
    peak: "投資開始直後に一時的な上昇（高値づかみ→反落）",
  };

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // 価格指数はトレンド線（想定年率リターンによる複利上昇）に、投資開始直後だけ
  // 発生する一時的な変動（下落→回復 or 上昇→反落）をV字型に重ねたものとして試算する。
  // t=0時点（投資開始月）の指数は常に100（変動の起点）になるよう設計している。
  function priceFactor(t, pattern, shockPct, shockMonths) {
    if (pattern === "flat" || shockPct <= 0 || shockMonths <= 0) return 1;
    if (t >= shockMonths) return 1;
    var half = shockMonths / 2;
    var extreme = pattern === "dip" ? 1 - shockPct / 100 : 1 + shockPct / 100;
    if (t <= half) {
      return 1 + (extreme - 1) * (half === 0 ? 1 : t / half);
    }
    return extreme + (1 - extreme) * ((t - half) / half);
  }

  function priceIndex(t, monthlyRate, pattern, shockPct, shockMonths) {
    var trend = Math.pow(1 + monthlyRate, t);
    return trend * priceFactor(t, pattern, shockPct, shockMonths);
  }

  function simulate(totalAmount, splitMonths, years, annualRatePct, pattern, shockPct, shockMonths) {
    var monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    var totalMonths = Math.round(years * 12);
    var effectiveSplitMonths = Math.min(splitMonths, totalMonths || 1);

    var priceAt0 = priceIndex(0, monthlyRate, pattern, shockPct, shockMonths);
    var unitsLump = priceAt0 > 0 ? totalAmount / priceAt0 : 0;
    var perMonth = totalAmount / effectiveSplitMonths;

    var dcaUnitsCum = [];
    var acc = 0;
    for (var m = 0; m <= totalMonths; m++) {
      if (m < effectiveSplitMonths) {
        var p = priceIndex(m, monthlyRate, pattern, shockPct, shockMonths);
        acc += p > 0 ? perMonth / p : 0;
      }
      dcaUnitsCum[m] = acc;
    }

    var yearly = [];
    for (var y = 0; y <= years; y++) {
      var mm = Math.min(Math.round(y * 12), totalMonths);
      var price = priceIndex(mm, monthlyRate, pattern, shockPct, shockMonths);
      yearly.push({
        year: y,
        lump: unitsLump * price,
        dca: dcaUnitsCum[mm] * price,
      });
    }

    var finalPrice = priceIndex(totalMonths, monthlyRate, pattern, shockPct, shockMonths);
    var finalValueLump = unitsLump * finalPrice;
    var finalValueDca = dcaUnitsCum[totalMonths] * finalPrice;
    var avgPriceIndexLump = unitsLump > 0 ? (totalAmount / unitsLump) * 100 : 100;
    var avgPriceIndexDca = dcaUnitsCum[totalMonths] > 0 ? (totalAmount / dcaUnitsCum[totalMonths]) * 100 : 100;

    var extremeIndex = pattern === "flat" ? 100 : priceFactor(shockMonths / 2, pattern, shockPct, shockMonths) * 100;

    return {
      finalValueLump: finalValueLump,
      finalValueDca: finalValueDca,
      avgPriceIndexLump: avgPriceIndexLump,
      avgPriceIndexDca: avgPriceIndexDca,
      extremeIndex: extremeIndex,
      yearly: yearly,
    };
  }

  function updateShockVisibility() {
    var isFlat = els.pattern.value === "flat";
    els.shockFields.style.display = isFlat ? "none" : "";
    els.shockPctLabel.textContent = els.pattern.value === "peak" ? "上昇率" : "下落率";
  }

  function render() {
    var totalAmount = Math.max(0, Number(els.totalAmount.value) || 0);
    var splitMonths = Number(els.splitMonths.value);
    var years = Number(els.years.value);
    var annualRatePct = Number(els.annualRate.value);
    var pattern = els.pattern.value;
    var shockPct = Number(els.shockPct.value);
    var shockMonths = Number(els.shockMonths.value);

    els.yearsOut.textContent = years + " 年";
    els.annualRateOut.textContent = annualRatePct.toFixed(1) + " %";
    els.shockPctOut.textContent = shockPct + " %";
    els.shockMonthsOut.textContent = shockMonths + " ヶ月";
    updateShockVisibility();

    var sim = simulate(totalAmount, splitMonths, years, annualRatePct, pattern, shockPct, shockMonths);
    var diff = sim.finalValueLump - sim.finalValueDca;

    els.resultPrincipal.textContent = yen(totalAmount);
    els.resultLump.textContent = yen(sim.finalValueLump);
    els.resultDca.textContent = yen(sim.finalValueDca);
    els.resultDiff.textContent = (diff >= 0 ? "+" : "") + manYen(diff) + "（一括－分割）";

    if (Math.abs(diff) < 1000) {
      els.verdict.textContent = "この条件では一括投資と分割投資の差はごくわずかです";
      els.verdictSub.textContent = "分割回数や価格変動パターンを変えて、条件による差の出方を確認してください。";
    } else if (diff > 0) {
      els.verdict.textContent = "この条件では一括投資のほうが " + manYen(diff) + " 多く資産が残ります";
      els.verdictSub.textContent =
        pattern === "dip"
          ? "投資直後の一時的な下落があっても、その後のトレンド上昇局面が長いため、早く全額を投資した効果が上回りました。"
          : "資金を早く投資に回すほど市場に長くさらされ、複利で増える期間が長くなる分、一括投資が有利になりやすい結果です。";
    } else {
      els.verdict.textContent = "この条件では分割投資（時間分散）のほうが " + manYen(-diff) + " 多く資産が残ります";
      els.verdictSub.textContent =
        pattern === "dip"
          ? "投資開始直後の下落局面で買い付け単価を平均的に下げられたことが、時間分散のメリットとして表れました。"
          : "投資開始直後に価格が上昇して反落する（高値づかみになりやすい）局面では、一括投資よりも購入タイミングを分散したほうが有利になることがあります。";
    }

    var patternRow =
      pattern === "flat"
        ? "<tr><td>価格変動パターン</td><td colspan=\"2\">" + PATTERN_LABEL[pattern] + "</td></tr>"
        : "<tr><td>価格変動パターン</td><td colspan=\"2\">" +
          PATTERN_LABEL[pattern] +
          "（" +
          (pattern === "peak" ? "上昇率" : "下落率") +
          " " +
          shockPct +
          "%・" +
          shockMonths +
          "ヶ月で収束）</td></tr>" +
          "<tr><td>変動期間中の" +
          (pattern === "peak" ? "最高値" : "最安値") +
          "の価格指数（基準100）</td><td colspan=\"2\">" +
          sim.extremeIndex.toFixed(1) +
          "</td></tr>";

    els.breakdownBody.innerHTML =
      "<tr><td>想定年率トレンドリターン</td><td colspan=\"2\">年 " + annualRatePct.toFixed(1) + " %</td></tr>" +
      patternRow +
      "<tr><td>平均取得価格指数（基準100・低いほど安く買えている）</td><td>" +
      sim.avgPriceIndexLump.toFixed(1) +
      "</td><td>" +
      sim.avgPriceIndexDca.toFixed(1) +
      "</td></tr>" +
      "<tr><td>投資元本（合計）</td><td>" + yen(totalAmount) + "</td><td>" + yen(totalAmount) + "</td></tr>" +
      "<tr><td><strong>運用終了時点の評価額</strong></td><td><strong>" +
      yen(sim.finalValueLump) +
      "</strong></td><td><strong>" +
      yen(sim.finalValueDca) +
      "</strong></td></tr>";

    var labels = sim.yearly.map(function (d) { return d.year + "年"; });
    var lumpSeries = sim.yearly.map(function (d) { return Math.round(d.lump); });
    var dcaSeries = sim.yearly.map(function (d) { return Math.round(d.dca); });
    var principalSeries = sim.yearly.map(function () { return Math.round(totalAmount); });

    var data = {
      labels: labels,
      datasets: [
        {
          label: "一括投資 評価額",
          data: lumpSeries,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "分割投資（時間分散） 評価額",
          data: dcaSeries,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "投資元本（合計、参考線）",
          data: principalSeries,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
          borderDash: [4, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + "：" + yen(ctx.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(document.getElementById("growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
  }

  [els.totalAmount, els.splitMonths, els.years, els.annualRate, els.pattern, els.shockPct, els.shockMonths].forEach(
    function (el) {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    }
  );

  render();
})();

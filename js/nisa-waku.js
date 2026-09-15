(function () {
  "use strict";

  var TOTAL_LIFETIME_CAP = 18000000; // 生涯投資枠（総枠）
  var GROWTH_LIFETIME_CAP = 12000000; // うち成長投資枠の上限
  var TSUMITATE_MONTHLY_CAP = 100000; // 年間120万円を月額に均した上限
  var GROWTH_MONTHLY_CAP = 200000; // 年間240万円を月額に均した上限
  var TAX_RATE = 0.20315; // 課税口座の運用益にかかる税率（所得税・復興特別所得税・住民税の合計）

  var els = {
    tsumitate: document.getElementById("tsumitate"),
    growth: document.getElementById("growth"),
    rate: document.getElementById("rate"),
    years: document.getElementById("years"),
    rateOut: document.getElementById("rateOut"),
    yearsOut: document.getElementById("yearsOut"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    fillPeriod: document.getElementById("result-fill-period"),
    nisaUsed: document.getElementById("result-nisa-used"),
    taxSaved: document.getElementById("result-tax-saved"),
    finalAsset: document.getElementById("result-final-asset"),
  };

  var chart = null;

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function simulate(tsumitateMonthly, growthMonthly, ratePct, years) {
    var monthlyRate = ratePct / 100 / 12;
    var months = Math.round(years * 12);

    var cGrowth = 0; // 成長投資枠 累計投入額
    var cTsumitate = 0; // つみたて投資枠 累計投入額
    var nisaValue = 0; // NISA口座の評価額（非課税）
    var taxablePrincipal = 0; // 枠を使い切った後、課税口座に回った累計投入額
    var taxableValue = 0; // 課税口座の評価額

    var fillMonth = null;
    var series = [];

    for (var m = 1; m <= months; m++) {
      var totalUsed = cGrowth + cTsumitate;
      var totalRoom = Math.max(0, TOTAL_LIFETIME_CAP - totalUsed);
      var growthWanted = Math.min(growthMonthly, Math.max(0, GROWTH_LIFETIME_CAP - cGrowth));
      var tsumitateWanted = tsumitateMonthly;
      var totalWanted = growthWanted + tsumitateWanted;

      var growthIn = growthWanted;
      var tsumitateIn = tsumitateWanted;
      if (totalWanted > totalRoom) {
        growthIn = Math.floor(totalRoom * (growthWanted / totalWanted));
        tsumitateIn = Math.min(tsumitateWanted, totalRoom - growthIn);
        growthIn += Math.min(totalRoom - growthIn - tsumitateIn, growthWanted - growthIn);
      }

      cGrowth += growthIn;
      cTsumitate += tsumitateIn;

      var nisaIn = growthIn + tsumitateIn;
      var overflow = growthMonthly - growthIn + (tsumitateMonthly - tsumitateIn);

      nisaValue = (nisaValue + nisaIn) * (1 + monthlyRate);
      taxablePrincipal += overflow;
      taxableValue = (taxableValue + overflow) * (1 + monthlyRate);

      if (fillMonth === null && cGrowth + cTsumitate >= TOTAL_LIFETIME_CAP) {
        fillMonth = m;
      }

      if (m % 12 === 0) {
        var taxableGainNow = Math.max(0, taxableValue - taxablePrincipal);
        var taxableNetNow = taxableValue - taxableGainNow * TAX_RATE;
        series.push({
          year: m / 12,
          nisaValue: nisaValue,
          taxableNet: taxableNetNow,
          total: nisaValue + taxableNetNow,
        });
      }
    }

    var taxableGain = Math.max(0, taxableValue - taxablePrincipal);
    var tax = taxableGain * TAX_RATE;
    var taxableNet = taxableValue - tax;
    var nisaInvested = cGrowth + cTsumitate;
    var nisaGain = Math.max(0, nisaValue - nisaInvested);
    var taxSavedByNisa = nisaGain * TAX_RATE;

    return {
      fillMonth: fillMonth,
      nisaInvested: nisaInvested,
      growthInvested: cGrowth,
      tsumitateInvested: cTsumitate,
      nisaValue: nisaValue,
      taxablePrincipal: taxablePrincipal,
      tax: tax,
      taxableNet: taxableNet,
      taxSavedByNisa: taxSavedByNisa,
      finalAsset: nisaValue + taxableNet,
      series: series,
    };
  }

  function render() {
    var tsumitateMonthly = Math.min(TSUMITATE_MONTHLY_CAP, Math.max(0, Number(els.tsumitate.value) || 0));
    var growthMonthly = Math.min(GROWTH_MONTHLY_CAP, Math.max(0, Number(els.growth.value) || 0));
    var ratePct = Number(els.rate.value);
    var years = Number(els.years.value);

    els.tsumitate.value = tsumitateMonthly;
    els.growth.value = growthMonthly;

    els.rateOut.textContent = ratePct.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";

    var result = simulate(tsumitateMonthly, growthMonthly, ratePct, years);

    if (result.fillMonth) {
      var y = Math.floor(result.fillMonth / 12);
      var mo = result.fillMonth % 12;
      els.fillPeriod.textContent = mo === 0 ? y + " 年" : y + " 年 " + mo + "ヶ月";
    } else {
      els.fillPeriod.textContent = "この期間内は使い切りません";
    }

    els.nisaUsed.textContent = manYen(result.nisaInvested) + " / 1,800万円";
    els.taxSaved.textContent = manYen(result.taxSavedByNisa);
    els.finalAsset.textContent = manYen(result.finalAsset);

    if (result.taxablePrincipal <= 0) {
      els.verdict.textContent = "この条件では生涯投資枠（1,800万円）の範囲内に収まっています";
      els.verdictSub.textContent =
        "積立を続けても運用益はすべて非課税です。成長投資枠は " + manYen(result.growthInvested) + "（上限1,200万円）まで使用します。";
    } else {
      els.verdict.textContent =
        "生涯投資枠を使い切り、" + manYen(result.taxablePrincipal) + " が課税口座に回ります";
      els.verdictSub.textContent =
        "枠を使い切った後の積立分には運用益に約20.315%課税され、その税額は " + manYen(result.tax) + " と試算されます。";
    }

    var labels = result.series.map(function (d) { return d.year + "年"; });
    var nisaData = result.series.map(function (d) { return Math.round(d.nisaValue); });
    var taxableData = result.series.map(function (d) { return Math.round(d.taxableNet); });

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "NISA口座（非課税）評価額",
          data: nisaData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "課税口座（枠超過分・税引後）評価額",
          data: taxableData,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { stacked: true, ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + "：" + manYen(ctx.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
  }

  [els.tsumitate, els.growth, els.rate, els.years].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

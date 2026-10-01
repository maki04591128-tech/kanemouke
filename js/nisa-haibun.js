(function () {
  "use strict";

  var TOTAL_LIFETIME_CAP = 18000000; // 生涯投資枠（総枠）
  var GROWTH_LIFETIME_CAP = 12000000; // うち成長投資枠の上限
  var TSUMITATE_YEARLY_CAP = 1200000; // つみたて投資枠の年間上限
  var GROWTH_YEARLY_CAP = 2400000; // 成長投資枠の年間上限
  var TSUMITATE_MONTHLY_CAP = 100000; // 年間120万円を月額に均した上限
  var GROWTH_MONTHLY_CAP = 200000; // 年間240万円を月額に均した上限
  var TAX_RATE = 0.20315; // 課税口座の運用益にかかる税率（所得税・復興特別所得税・住民税の合計）
  var MAX_MONTHS = 50 * 12; // 打ち切り年数（この期間内に使い切らない場合は「未達」として扱う）

  var DELAY_COMPARE_YEARS = 20; // 「開始タイミング」比較の基準年数（この年数後の資産評価額を比較する）
  var DELAY_SCENARIOS = [0, 1, 3, 5, 10]; // 比較する「積立開始を遅らせる年数」のプリセット

  var STRATEGIES = [
    {
      key: "tsumitateFirst",
      label: "つみたて優先",
      note: "つみたて投資枠（月10万円まで）を先に埋め、余った分を成長投資枠に回す",
      split: function (total) {
        var t = Math.min(total, TSUMITATE_MONTHLY_CAP);
        var g = Math.min(total - t, GROWTH_MONTHLY_CAP);
        return { tsumitate: t, growth: g };
      },
    },
    {
      key: "growthFirst",
      label: "成長優先",
      note: "成長投資枠（月20万円まで）を先に埋め、余った分をつみたて投資枠に回す",
      split: function (total) {
        var g = Math.min(total, GROWTH_MONTHLY_CAP);
        var t = Math.min(total - g, TSUMITATE_MONTHLY_CAP);
        return { tsumitate: t, growth: g };
      },
    },
    {
      key: "ratio",
      label: "年間上限比率で按分（1：2）",
      note: "つみたて投資枠と成長投資枠の年間上限（120万円：240万円＝1：2）と同じ比率で毎月配分する",
      split: function (total) {
        var t = Math.min(total / 3, TSUMITATE_MONTHLY_CAP);
        var g = Math.min((total * 2) / 3, GROWTH_MONTHLY_CAP);
        var remaining = total - t - g;
        if (remaining > 0.5) {
          var tRoom = TSUMITATE_MONTHLY_CAP - t;
          var gRoom = GROWTH_MONTHLY_CAP - g;
          var addT = Math.min(remaining, tRoom);
          t += addT;
          remaining -= addT;
          var addG = Math.min(remaining, gRoom);
          g += addG;
        }
        return { tsumitate: t, growth: g };
      },
    },
    {
      key: "tsumitateOnly",
      label: "つみたて投資枠のみ",
      note: "成長投資枠は使わず、つみたて投資枠（月10万円まで）だけで積み立てる。超過分は課税口座へ",
      split: function (total) {
        var t = Math.min(total, TSUMITATE_MONTHLY_CAP);
        return { tsumitate: t, growth: 0 };
      },
    },
  ];

  var els = {
    total: document.getElementById("haibun-total"),
    rate: document.getElementById("haibun-rate"),
    rateOut: document.getElementById("haibun-rateOut"),
    fundSelect: document.getElementById("haibun-fundSelect"),
    fundHint: document.getElementById("haibun-fundHint"),
    verdict: document.getElementById("haibun-verdict"),
    verdictSub: document.getElementById("haibun-verdictSub"),
    splitBody: document.getElementById("haibun-split-body"),
    compareBody: document.getElementById("haibun-compare-body"),
    delayNote: document.getElementById("haibun-delay-note"),
    delayBody: document.getElementById("haibun-delay-body"),
  };

  var chart = null;

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function formatFillPeriod(months) {
    if (months === null) return "50年以内は使い切りません";
    var years = Math.floor(months / 12);
    var restMonths = months % 12;
    if (restMonths === 0) return years + " 年";
    if (years === 0) return restMonths + "ヶ月";
    return years + " 年 " + restMonths + "ヶ月";
  }

  function allocateWithinTotal(growthWanted, tsumitateWanted, totalRoom) {
    var wantedTotal = growthWanted + tsumitateWanted;
    if (wantedTotal <= totalRoom) {
      return { growthIn: growthWanted, tsumitateIn: tsumitateWanted };
    }
    if (wantedTotal <= 0 || totalRoom <= 0) {
      return { growthIn: 0, tsumitateIn: 0 };
    }

    var growthIn = Math.floor((totalRoom * growthWanted) / wantedTotal);
    var tsumitateIn = Math.min(tsumitateWanted, totalRoom - growthIn);
    var remaining = totalRoom - growthIn - tsumitateIn;

    if (remaining > 0) {
      var growthRemain = growthWanted - growthIn;
      var tsumitateRemain = tsumitateWanted - tsumitateIn;
      if (growthRemain >= tsumitateRemain && growthRemain > 0) {
        var growthExtra = Math.min(growthRemain, remaining);
        growthIn += growthExtra;
        remaining -= growthExtra;
      }
      if (remaining > 0 && tsumitateRemain > 0) {
        tsumitateIn += Math.min(tsumitateRemain, remaining);
      }
    }

    return { growthIn: growthIn, tsumitateIn: tsumitateIn };
  }

  // つみたて投資枠・成長投資枠それぞれの毎月の積立額から、生涯投資枠を使い切るまでの
  // 期間と、その時点（使い切らない場合はMAX_MONTHS時点）での資産評価額を試算する。
  // extraTaxableMonthly: 毎月の投資予定額のうち、どちらの枠にも割り当てられなかった分
  // （例：「つみたて投資枠のみ」戦略で月10万円を超える分）。常に課税口座に回るものとして扱う。
  // monthsOverride: 指定すると、枠を使い切った後も打ち切らずちょうどこの月数まで試算する
  // （「開始タイミング」比較のように、固定の年数時点の資産評価額を知りたい場合に使う）。
  function simulate(tsumitateMonthly, growthMonthly, ratePct, extraTaxableMonthly, monthsOverride) {
    var monthlyRate = ratePct / 100 / 12;

    var cGrowth = 0;
    var cTsumitate = 0;
    var yGrowth = 0;
    var yTsumitate = 0;
    var nisaValue = 0;
    var taxablePrincipal = 0;
    var taxableValue = 0;

    var fillMonth = null;
    var yearlySeries = [];

    var loopMax = monthsOverride ? monthsOverride : MAX_MONTHS;
    for (var m = 1; m <= loopMax; m++) {
      if ((m - 1) % 12 === 0) {
        yGrowth = 0;
        yTsumitate = 0;
      }

      var totalUsed = cGrowth + cTsumitate;
      var totalRoom = Math.max(0, TOTAL_LIFETIME_CAP - totalUsed);
      var growthWanted = Math.min(
        growthMonthly,
        Math.max(0, GROWTH_LIFETIME_CAP - cGrowth),
        Math.max(0, GROWTH_YEARLY_CAP - yGrowth)
      );
      var tsumitateWanted = Math.min(tsumitateMonthly, Math.max(0, TSUMITATE_YEARLY_CAP - yTsumitate));
      var allocation = allocateWithinTotal(growthWanted, tsumitateWanted, totalRoom);
      var growthIn = allocation.growthIn;
      var tsumitateIn = allocation.tsumitateIn;

      cGrowth += growthIn;
      yGrowth += growthIn;
      cTsumitate += tsumitateIn;
      yTsumitate += tsumitateIn;

      var nisaIn = growthIn + tsumitateIn;
      var overflow = growthMonthly - growthIn + (tsumitateMonthly - tsumitateIn) + extraTaxableMonthly;

      nisaValue = (nisaValue + nisaIn) * (1 + monthlyRate);
      taxablePrincipal += overflow;
      taxableValue = (taxableValue + overflow) * (1 + monthlyRate);

      if (fillMonth === null && cGrowth + cTsumitate >= TOTAL_LIFETIME_CAP) {
        fillMonth = m;
      }

      if (m % 12 === 0) {
        var gain = Math.max(0, taxableValue - taxablePrincipal);
        yearlySeries.push({ year: m / 12, total: nisaValue + (taxableValue - gain * TAX_RATE) });
      }

      if (!monthsOverride && fillMonth !== null && m >= fillMonth + 12) break;
    }

    var taxableGain = Math.max(0, taxableValue - taxablePrincipal);
    var tax = taxableGain * TAX_RATE;
    var taxableNet = taxableValue - tax;
    var nisaInvested = cGrowth + cTsumitate;
    var nisaGain = Math.max(0, nisaValue - nisaInvested);
    var taxSavedByNisa = nisaGain * TAX_RATE;

    return {
      fillMonth: fillMonth,
      growthInvested: cGrowth,
      tsumitateInvested: cTsumitate,
      nisaValue: nisaValue,
      finalAsset: nisaValue + taxableNet,
      taxSavedByNisa: taxSavedByNisa,
      unusedGrowthCap: Math.max(0, GROWTH_LIFETIME_CAP - cGrowth),
      series: yearlySeries,
    };
  }

  function render() {
    var total = Math.max(0, Number(els.total.value) || 0);
    var ratePct = Number(els.rate.value);

    els.rateOut.textContent = ratePct.toFixed(1) + " %";

    var results = STRATEGIES.map(function (s) {
      var split = s.split(total);
      var extra = Math.max(0, total - split.tsumitate - split.growth);
      var r = simulate(split.tsumitate, split.growth, ratePct, extra);
      return {
        strategy: s,
        split: split,
        result: r,
      };
    });

    els.splitBody.innerHTML = results
      .map(function (item) {
        return (
          "<tr><td>" +
          item.strategy.label +
          "</td><td>" +
          manYen(item.split.tsumitate) +
          "</td><td>" +
          manYen(item.split.growth) +
          "</td><td>" +
          manYen(total - item.split.tsumitate - item.split.growth) +
          "</td></tr>"
        );
      })
      .join("");

    els.compareBody.innerHTML = results
      .map(function (item) {
        return (
          "<tr><td>" +
          item.strategy.label +
          "</td><td>" +
          formatFillPeriod(item.result.fillMonth) +
          "</td><td>" +
          manYen(item.result.finalAsset) +
          "</td><td>" +
          manYen(item.result.taxSavedByNisa) +
          "</td><td>" +
          (item.result.unusedGrowthCap > 0 ? manYen(item.result.unusedGrowthCap) : "なし") +
          "</td></tr>"
        );
      })
      .join("");

    var fastest = results.reduce(function (best, cur) {
      if (best === null) return cur;
      var bestMonth = best.result.fillMonth === null ? Infinity : best.result.fillMonth;
      var curMonth = cur.result.fillMonth === null ? Infinity : cur.result.fillMonth;
      return curMonth < bestMonth ? cur : best;
    }, null);

    if (fastest.result.fillMonth === null) {
      els.verdict.textContent =
        "毎月合計 " + manYen(total) + " では、どの配分方法でも50年以内に生涯投資枠(1,800万円)を使い切りません";
      els.verdictSub.textContent = "積立額を増やすか、成長投資枠を優先する配分にすると使い切るまでの期間を短縮できます。";
    } else {
      els.verdict.textContent =
        "最も早く使い切れるのは「" + fastest.strategy.label + "」で、" + formatFillPeriod(fastest.result.fillMonth) + "です";
      var onlyItem = results.filter(function (item) { return item.strategy.key === "tsumitateOnly"; })[0];
      if (onlyItem.result.unusedGrowthCap > 0) {
        els.verdictSub.textContent =
          "「つみたて投資枠のみ」では成長投資枠を使わないため、" + manYen(onlyItem.result.unusedGrowthCap) + " 分の非課税枠が未使用のまま残ります。";
      } else {
        els.verdictSub.textContent = "この積立額であれば、どの配分方法でも最終的に生涯投資枠をすべて使い切ります。";
      }
    }

    // ---- 「今すぐ始めるか、先延ばしするかで何が変わる？」比較 ----
    // 最も早く枠を使い切れる配分方法（fastest）と同じ毎月の投資予定額・想定利回りのまま、
    // 積立を始めるタイミングだけを遅らせた場合、DELAY_COMPARE_YEARS年後の資産評価額がどれだけ
    // 変わるかをプリセットの年数（0・1・3・5・10年）で比較する。
    var delaySplit = fastest.split;
    var delayExtra = Math.max(0, total - delaySplit.tsumitate - delaySplit.growth);
    var delayHorizonMonths = DELAY_COMPARE_YEARS * 12;
    var delayRows = DELAY_SCENARIOS.map(function (delayYears) {
      var activeMonths = Math.max(0, delayHorizonMonths - delayYears * 12);
      var finalAsset =
        activeMonths > 0
          ? simulate(delaySplit.tsumitate, delaySplit.growth, ratePct, delayExtra, activeMonths).finalAsset
          : 0;
      return { delayYears: delayYears, finalAsset: finalAsset };
    });
    var immediateFinalAsset = delayRows[0].finalAsset;

    els.delayBody.innerHTML = delayRows
      .map(function (row) {
        var diff = row.finalAsset - immediateFinalAsset;
        var diffText =
          row.delayYears === 0 ? "－" : (diff >= 0 ? "+" : "－") + manYen(Math.abs(diff));
        var label = row.delayYears === 0 ? "今すぐ始める" : row.delayYears + "年後に始める";
        return "<tr><td>" + label + "</td><td>" + manYen(row.finalAsset) + "</td><td>" + diffText + "</td></tr>";
      })
      .join("");

    var fiveYearRow = delayRows.filter(function (r) { return r.delayYears === 5; })[0];
    var fiveYearDiff = immediateFinalAsset - fiveYearRow.finalAsset;
    els.delayNote.textContent =
      "毎月合計 " + manYen(total) + "・想定利回り " + ratePct.toFixed(1) + "% のまま、" + "「" + fastest.strategy.label + "」と同じ配分で積立を始めるタイミングだけを5年遅らせると、" + DELAY_COMPARE_YEARS + "年後の資産評価額は今すぐ始めた場合より約 " + manYen(Math.max(0, fiveYearDiff)) + " 少なくなる見込みです。";

    var labels = fastest.result.series.map(function (d) { return d.year + "年"; });
    var datasets = results.map(function (item, idx) {
      var colors = ["#0f5f4c", "#2f8f6f", "#d98e04", "#c96b3f"];
      return {
        label: item.strategy.label,
        data: item.result.series.map(function (d) { return Math.round(d.total); }),
        borderColor: colors[idx % colors.length],
        backgroundColor: "transparent",
        tension: 0.25,
        pointRadius: 0,
      };
    });
    var chartLabels = results.reduce(function (best, cur) {
      return cur.result.series.length > best.length ? cur.result.series.map(function (d) { return d.year + "年"; }) : best;
    }, labels);

    var ctx = document.getElementById("haibun-growthChart").getContext("2d");
    var data = { labels: chartLabels, datasets: datasets };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: true, position: "bottom" },
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
    if (window.renderChartDataTable) window.renderChartDataTable("haibun-growthDataTable", chart);
  }

  [els.total, els.rate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  if (window.setupFundSelect) {
    window.setupFundSelect(els.fundSelect, els.rate, els.fundHint, render);
  }

  render();
})();

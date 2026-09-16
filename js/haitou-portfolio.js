(function () {
  "use strict";

  // 配当金にかかる税率（20.315% = 所得税15%＋復興特別所得税0.315%＋住民税5%）
  var TAX_RATE = 0.20315;

  var els = {
    initial: document.getElementById("initial"),
    monthly: document.getElementById("monthly"),
    years: document.getElementById("years"),
    yearsOut: document.getElementById("yearsOut"),
    yieldPct: document.getElementById("yieldPct"),
    yieldPctOut: document.getElementById("yieldPctOut"),
    divGrowth: document.getElementById("divGrowth"),
    divGrowthOut: document.getElementById("divGrowthOut"),
    priceGrowth: document.getElementById("priceGrowth"),
    priceGrowthOut: document.getElementById("priceGrowthOut"),
    accountType: document.getElementById("accountType"),
    targetMonthly: document.getElementById("targetMonthly"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    finalNav: document.getElementById("result-final-nav"),
    finalDivAnnual: document.getElementById("result-final-div-annual"),
    finalDivMonthly: document.getElementById("result-final-div-monthly"),
    targetYear: document.getElementById("result-target-year"),
    breakdownBody: document.getElementById("breakdown-body"),
  };

  var chart = null;

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  // 毎年、配当利回りが divGrowthPct ずつ複利で上昇していく前提で、
  // 配当込みの資産推移を年次シミュレーションする（1年=12ヶ月のループ）。
  // reinvest=true の場合は税引後の配当を同じ商品に買い増して再投資、
  // reinvest=false の場合は配当を受け取るだけでポートフォリオには戻さない。
  function simulate(initialYen, monthlyYen, years, yieldAnnualPct, divGrowthPct, priceGrowthMonthlyRate, taxRate, reinvest) {
    var nav = initialYen;
    var currentYieldAnnual = yieldAnnualPct / 100;
    var series = [{ year: 0, nav: nav, divNet: 0 }];
    var cumDivNet = 0;

    for (var y = 1; y <= years; y++) {
      var annualDivGross = 0;
      var annualDivNet = 0;

      for (var m = 1; m <= 12; m++) {
        nav += monthlyYen;

        var divGross = Math.max(0, nav) * (currentYieldAnnual / 12);
        var divNet = divGross * (1 - taxRate);
        nav -= divGross;
        nav *= 1 + priceGrowthMonthlyRate;
        if (reinvest) {
          nav += divNet;
        }

        annualDivGross += divGross;
        annualDivNet += divNet;
      }

      cumDivNet += annualDivNet;
      series.push({ year: y, nav: nav, divNet: annualDivNet, divGross: annualDivGross });
      currentYieldAnnual *= 1 + divGrowthPct / 100;
    }

    var last = series[series.length - 1];
    return {
      finalNav: nav,
      finalDivNetAnnual: last.divNet,
      cumDivNet: cumDivNet,
      series: series,
    };
  }

  function findTargetReachYear(series, targetMonthlyYen) {
    if (targetMonthlyYen <= 0) return null;
    for (var i = 1; i < series.length; i++) {
      if (series[i].divNet / 12 >= targetMonthlyYen) {
        return series[i].year;
      }
    }
    return null;
  }

  function render() {
    var initialMan = Math.max(0, Number(els.initial.value) || 0);
    var monthlyMan = Math.max(0, Number(els.monthly.value) || 0);
    var initialYen = initialMan * 10000;
    var monthlyYen = monthlyMan * 10000;

    var years = Number(els.years.value);
    var yieldPct = Number(els.yieldPct.value);
    var divGrowthPct = Number(els.divGrowth.value);
    var priceGrowthPct = Number(els.priceGrowth.value);
    var accountType = els.accountType.value;
    var taxRate = accountType === "nisa" ? 0 : TAX_RATE;
    var targetMonthlyYen = Math.max(0, Number(els.targetMonthly.value) || 0) * 10000;

    els.yearsOut.textContent = years + " 年";
    els.yieldPctOut.textContent = yieldPct.toFixed(1) + " %";
    els.divGrowthOut.textContent = divGrowthPct.toFixed(1) + " %";
    els.priceGrowthOut.textContent = priceGrowthPct.toFixed(1) + " %";

    var priceGrowthMonthlyRate = priceGrowthPct / 100 / 12;

    var scenarioA = simulate(initialYen, monthlyYen, years, yieldPct, divGrowthPct, priceGrowthMonthlyRate, taxRate, true);
    var scenarioB = simulate(initialYen, monthlyYen, years, yieldPct, divGrowthPct, priceGrowthMonthlyRate, taxRate, false);

    els.finalNav.textContent = manYen(scenarioA.finalNav);
    els.finalDivAnnual.textContent = manYen(scenarioA.finalDivNetAnnual);
    els.finalDivMonthly.textContent = manYen(scenarioA.finalDivNetAnnual / 12);

    var targetYear = findTargetReachYear(scenarioA.series, targetMonthlyYen);
    if (targetMonthlyYen <= 0) {
      els.targetYear.textContent = "目標未設定";
    } else if (targetYear === null) {
      els.targetYear.textContent = "期間内は未到達";
    } else {
      els.targetYear.textContent = targetYear + " 年目";
    }

    var ratio = scenarioB.finalDivNetAnnual > 0 ? scenarioA.finalDivNetAnnual / scenarioB.finalDivNetAnnual : null;

    if (targetMonthlyYen > 0 && targetYear !== null) {
      els.verdict.textContent = "配当を再投資し続けると、" + targetYear + "年目に目標の月間配当金に到達する見込みです";
      els.verdictSub.textContent = "配当を再投資せず受け取るだけの場合は、同じ" + years + "年間で年間配当金が" + manYen(scenarioB.finalDivNetAnnual) + "（月あたり" + manYen(scenarioB.finalDivNetAnnual / 12) + "）にとどまります。";
    } else if (targetMonthlyYen > 0) {
      els.verdict.textContent = "この条件では、運用期間内に目標の月間配当金には届きません";
      els.verdictSub.textContent = "毎月の追加投資額を増やす、運用期間を延ばす、想定利回り・増配率を見直すなどで試算し直してみてください。";
    } else if (ratio !== null) {
      els.verdict.textContent = years + "年後の年間配当金は、再投資しない場合の約" + ratio.toFixed(1) + "倍になります";
      els.verdictSub.textContent = "配当を再投資し続けることで、保有株数の増加と増配が重なり、年間配当金が複利的に増えていきます。";
    } else {
      els.verdict.textContent = "-";
      els.verdictSub.textContent = "";
    }

    els.breakdownBody.innerHTML =
      "<tr><td>最終ポートフォリオ評価額</td><td>" + yen(scenarioA.finalNav) + "</td><td>" + yen(scenarioB.finalNav) + "</td></tr>" +
      "<tr><td><strong>最終年の年間配当金（税引後）</strong></td><td><strong>" + yen(scenarioA.finalDivNetAnnual) + "</strong></td><td><strong>" + yen(scenarioB.finalDivNetAnnual) + "</strong></td></tr>" +
      "<tr><td>最終年の月間配当金換算（税引後）</td><td>" + yen(scenarioA.finalDivNetAnnual / 12) + "</td><td>" + yen(scenarioB.finalDivNetAnnual / 12) + "</td></tr>" +
      "<tr><td>累計受取配当金（税引後・参考）</td><td>" + yen(scenarioA.cumDivNet) + "</td><td>" + yen(scenarioB.cumDivNet) + "</td></tr>";

    var labels = scenarioA.series.map(function (d) { return d.year + "年目"; });
    var data = {
      labels: labels,
      datasets: [
        {
          label: "A：配当を再投資",
          data: scenarioA.series.map(function (d) { return Math.round(d.divNet); }),
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "B：配当を再投資せず受取",
          data: scenarioB.series.map(function (d) { return Math.round(d.divNet); }),
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
          fill: false,
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
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + "（年間配当金）：" + manYen(ctx.parsed.y); },
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

  [els.initial, els.monthly, els.years, els.yieldPct, els.divGrowth, els.priceGrowth, els.accountType, els.targetMonthly].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

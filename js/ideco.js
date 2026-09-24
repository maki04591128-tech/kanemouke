(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;

  var els = {
    monthly: document.getElementById("setsuzei-monthly"),
    taxRate: document.getElementById("setsuzei-taxRate"),
    rate: document.getElementById("setsuzei-rate"),
    years: document.getElementById("setsuzei-years"),
    rateOut: document.getElementById("setsuzei-rateOut"),
    yearsOut: document.getElementById("setsuzei-yearsOut"),
    total: document.getElementById("setsuzei-result-total"),
    profit: document.getElementById("setsuzei-result-profit"),
    taxSaving: document.getElementById("setsuzei-result-tax-saving"),
    taxSavingYearly: document.getElementById("setsuzei-tax-saving-yearly"),
    taxSavingTotal: document.getElementById("setsuzei-tax-saving-total"),
    benefitTotal: document.getElementById("setsuzei-benefit-total"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Same monthly-compounding assumption as the tsumitate simulator:
  // contribute at the start of each month, then apply one month of growth.
  function simulateGrowth(monthly, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var months = Math.round(years * 12);
    var balance = 0;
    var principal = 0;
    var yearly = [];

    for (var m = 1; m <= months; m++) {
      balance += monthly;
      principal += monthly;
      balance *= 1 + r;

      if (m % 12 === 0) {
        yearly.push({ year: m / 12, balance: balance, principal: principal });
      }
    }
    if (months % 12 !== 0) {
      yearly.push({ year: years, balance: balance, principal: principal });
    }
    if (yearly.length === 0) {
      yearly.push({ year: 0, balance: 0, principal: 0 });
    }

    return { balance: balance, principal: principal, yearly: yearly };
  }

  function render() {
    var monthly = Math.max(0, Number(els.monthly.value) || 0);
    var incomeTaxRate = Number(els.taxRate.value) / 100;
    var rate = Number(els.rate.value);
    var years = Number(els.years.value);

    els.rateOut.textContent = rate.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";

    // Simplified assumption: contributions, income, and tax bracket stay
    // constant every year for the full period. Real income tends to
    // change over time, so treat this as a rough estimate, not a forecast.
    var annualContribution = monthly * 12;
    var combinedTaxRate = incomeTaxRate + RESIDENT_TAX_RATE;
    var annualTaxSaving = annualContribution * combinedTaxRate;
    var totalTaxSaving = annualTaxSaving * years;

    var growth = simulateGrowth(monthly, rate, years);
    var investProfit = growth.balance - growth.principal;
    var totalBenefit = investProfit + totalTaxSaving;

    els.total.textContent = yen(growth.balance);
    els.profit.textContent = "+" + manYen(investProfit);
    els.taxSaving.textContent = "+" + manYen(totalTaxSaving);
    els.taxSavingYearly.textContent = yen(annualTaxSaving);
    els.taxSavingTotal.textContent = yen(totalTaxSaving);
    els.benefitTotal.textContent = yen(totalBenefit);

    var labels = growth.yearly.map(function (d) { return d.year + "年"; });
    var principalData = growth.yearly.map(function (d) { return Math.round(d.principal); });
    var balanceData = growth.yearly.map(function (d) { return Math.round(d.balance); });

    var ctx = document.getElementById("setsuzei-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "資産評価額（掛金＋運用益）",
          data: balanceData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "掛金（累計拠出額）",
          data: principalData,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
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
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：" + yen(ctx.parsed.y);
            },
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
    if (window.renderChartDataTable) window.renderChartDataTable("setsuzei-growthDataTable", chart);
  }

  [els.monthly, els.taxRate, els.rate, els.years].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

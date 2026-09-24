(function () {
  "use strict";

  var els = {
    initial: document.getElementById("tsumitate-initial"),
    monthly: document.getElementById("tsumitate-monthly"),
    rate: document.getElementById("tsumitate-rate"),
    years: document.getElementById("tsumitate-years"),
    rateOut: document.getElementById("tsumitate-rateOut"),
    yearsOut: document.getElementById("tsumitate-yearsOut"),
    total: document.getElementById("tsumitate-result-total"),
    principal: document.getElementById("tsumitate-result-principal"),
    profit: document.getElementById("tsumitate-result-profit"),
    fundSelect: document.getElementById("tsumitate-fundSelect"),
    fundHint: document.getElementById("tsumitate-fundHint"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Monthly contributions made at the start of each month, monthly compounding.
  function simulate(initial, monthly, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var months = Math.round(years * 12);
    var balance = initial;
    var principal = initial;
    var yearly = [];

    for (var m = 1; m <= months; m++) {
      balance += monthly;
      principal += monthly;
      balance *= 1 + r;

      if (m % 12 === 0) {
        yearly.push({
          year: m / 12,
          balance: balance,
          principal: principal,
        });
      }
    }

    if (months % 12 !== 0) {
      yearly.push({ year: years, balance: balance, principal: principal });
    }
    if (yearly.length === 0) {
      yearly.push({ year: 0, balance: initial, principal: initial });
    }

    return { balance: balance, principal: principal, yearly: yearly };
  }

  function render() {
    var initial = Math.max(0, Number(els.initial.value) || 0);
    var monthly = Math.max(0, Number(els.monthly.value) || 0);
    var rate = Number(els.rate.value);
    var years = Number(els.years.value);

    els.rateOut.textContent = rate.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";

    var result = simulate(initial, monthly, rate, years);
    var profit = result.balance - result.principal;

    els.total.textContent = yen(result.balance);
    els.principal.textContent = yen(result.principal);
    els.profit.textContent = (profit >= 0 ? "+" : "") + manYen(profit);

    var labels = result.yearly.map(function (d) { return d.year + "年"; });
    var principalData = result.yearly.map(function (d) { return Math.round(d.principal); });
    var balanceData = result.yearly.map(function (d) { return Math.round(d.balance); });

    var ctx = document.getElementById("tsumitate-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "資産評価額（元本＋運用益）",
          data: balanceData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "元本（積立累計額）",
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
        y: {
          ticks: {
            callback: function (v) { return manYen(v); },
          },
        },
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
    if (window.renderChartDataTable) window.renderChartDataTable("tsumitate-growthDataTable", chart);
  }

  [els.initial, els.monthly, els.rate, els.years].forEach(function (el) {
    el.addEventListener("input", render);
  });

  if (window.setupFundSelect) {
    window.setupFundSelect(els.fundSelect, els.rate, els.fundHint, render);
  }
  render();
})();

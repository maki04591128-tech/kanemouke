(function () {
  "use strict";

  var els = {
    target: document.getElementById("hitsuyou-target"),
    initial: document.getElementById("hitsuyou-initial"),
    rate: document.getElementById("hitsuyou-rate"),
    costPct: document.getElementById("hitsuyou-costPct"),
    years: document.getElementById("hitsuyou-years"),
    inflation: document.getElementById("hitsuyou-inflation"),
    rateOut: document.getElementById("hitsuyou-rateOut"),
    costPctOut: document.getElementById("hitsuyou-costPctOut"),
    yearsOut: document.getElementById("hitsuyou-yearsOut"),
    inflationOut: document.getElementById("hitsuyou-inflationOut"),
    monthly: document.getElementById("hitsuyou-result-monthly"),
    principal: document.getElementById("hitsuyou-result-principal"),
    profit: document.getElementById("hitsuyou-result-profit"),
    nominalTarget: document.getElementById("hitsuyou-result-nominalTarget"),
    costNote: document.getElementById("hitsuyou-costNote"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Solve required monthly contribution (start-of-month, monthly compounding)
  // so that initial + contributions grow to `target` after `years` years.
  function requiredMonthly(target, initial, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var n = Math.round(years * 12);
    var fvInitial = initial * Math.pow(1 + r, n);
    var remaining = target - fvInitial;

    if (remaining <= 0) return 0;

    if (r === 0) {
      return remaining / n;
    }
    var annuityFactor = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    return remaining / annuityFactor;
  }

  function simulateSeries(initial, monthly, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var months = Math.round(years * 12);
    var balance = initial;
    var principal = initial;
    var yearly = [{ year: 0, balance: initial, principal: initial }];

    for (var m = 1; m <= months; m++) {
      balance += monthly;
      principal += monthly;
      balance *= 1 + r;
      if (m % 12 === 0) {
        yearly.push({ year: m / 12, balance: balance, principal: principal });
      }
    }
    return yearly;
  }

  function render() {
    var target = Math.max(0, Number(els.target.value) || 0);
    var initial = Math.max(0, Number(els.initial.value) || 0);
    var rate = Number(els.rate.value);
    var costPct = Math.max(0, Number(els.costPct.value) || 0);
    var netRate = rate - costPct;
    var years = Number(els.years.value);
    var inflation = Number(els.inflation.value) || 0;

    els.rateOut.textContent = rate.toFixed(1) + " %";
    els.costPctOut.textContent = costPct.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";
    els.inflationOut.textContent = inflation.toFixed(1) + " %";

    var nominalTarget = target * Math.pow(1 + inflation / 100, years);

    var monthly = requiredMonthly(nominalTarget, initial, netRate, years);
    var yearly = simulateSeries(initial, monthly, netRate, years);
    var finalPoint = yearly[yearly.length - 1];
    var profit = finalPoint.balance - finalPoint.principal;

    els.monthly.textContent = yen(monthly);
    els.principal.textContent = yen(finalPoint.principal);
    els.profit.textContent = (profit >= 0 ? "+" : "") + manYen(profit);
    els.nominalTarget.textContent = yen(nominalTarget);
    els.costNote.textContent = costPct > 0
      ? "運用コスト " + costPct.toFixed(1) + "% を差し引いた年率 " + netRate.toFixed(1) + "% で運用する前提で試算しています。"
      : "";

    var labels = yearly.map(function (d) { return d.year + "年"; });
    var principalData = yearly.map(function (d) { return Math.round(d.principal); });
    var balanceData = yearly.map(function (d) { return Math.round(d.balance); });

    var ctx = document.getElementById("hitsuyou-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "資産評価額",
          data: balanceData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "積立元本",
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
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("hitsuyou-growthDataTable", chart);
  }

  [els.target, els.initial, els.rate, els.costPct, els.years, els.inflation].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

(function () {
  "use strict";

  // 「固定費見直し×積立シミュレーター」。現在の月々の固定費（スマホ通信費・
  // 生命保険料・サブスクサービス・電気代等の合計）と見直し後の予想月額から
  // 月々・年間の節約額を算出し、その節約額をそのまま毎月の積立投資に回した
  // 場合の将来の資産評価額を試算する。複利計算そのものは js/tsumitate.js の
  // simulate() と完全に同一のロジック（初期投資額0円・毎月の積立額＝節約額）
  // を用いており、新たな計算方式は導入していない。

  var els = {
    current: document.getElementById("koteihi-current"),
    after: document.getElementById("koteihi-after"),
    rate: document.getElementById("koteihi-rate"),
    years: document.getElementById("koteihi-years"),
    rateOut: document.getElementById("koteihi-rateOut"),
    yearsOut: document.getElementById("koteihi-yearsOut"),
    monthly: document.getElementById("koteihi-result-monthly"),
    yearly: document.getElementById("koteihi-result-yearly"),
    invested: document.getElementById("koteihi-result-invested"),
    diff: document.getElementById("koteihi-result-diff"),
  };

  if (!els.current || !els.after || !els.rate || !els.years) return;

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // js/tsumitate.js の simulate() と同一のロジック。毎月の積立（＝節約額）を
  // 月初に加算し、その月の複利を掛ける。balanceが積立投資した場合の資産評価額、
  // principalが積立額の単純合計（＝ただ貯金しただけの場合の金額）に相当する。
  function simulate(monthly, annualRatePct, years) {
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
    var current = Math.max(0, Number(els.current.value) || 0);
    var after = Math.max(0, Number(els.after.value) || 0);
    var rate = Number(els.rate.value);
    var years = Number(els.years.value);

    els.rateOut.textContent = rate.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";

    // 見直し後の月額が現在の月額以上の場合は節約できていないため、
    // 節約額・積立額とも0円として試算する（固定費が増えるケースは対象外）。
    var savingsMonthly = Math.max(0, current - after);

    var result = simulate(savingsMonthly, rate, years);
    var diff = result.balance - result.principal;

    els.monthly.textContent = yen(savingsMonthly);
    els.yearly.textContent = yen(savingsMonthly * 12);
    els.invested.textContent = yen(result.balance);
    els.diff.textContent = (diff >= 0 ? "+" : "") + manYen(diff);

    var labels = result.yearly.map(function (d) { return d.year + "年"; });
    var principalData = result.yearly.map(function (d) { return Math.round(d.principal); });
    var balanceData = result.yearly.map(function (d) { return Math.round(d.balance); });

    var canvas = document.getElementById("koteihi-growthChart");
    var ctx = canvas.getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "積立投資した場合（資産評価額）",
          data: balanceData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "ただ貯金しただけの場合（元本のみ）",
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
    if (window.renderChartDataTable) window.renderChartDataTable("koteihi-growthDataTable", chart);
  }

  [els.current, els.after, els.rate, els.years].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

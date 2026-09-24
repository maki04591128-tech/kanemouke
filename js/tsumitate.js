(function () {
  "use strict";

  var els = {
    initial: document.getElementById("initial"),
    monthly: document.getElementById("monthly"),
    rate: document.getElementById("rate"),
    years: document.getElementById("years"),
    rateOut: document.getElementById("rateOut"),
    yearsOut: document.getElementById("yearsOut"),
    total: document.getElementById("result-total"),
    principal: document.getElementById("result-principal"),
    profit: document.getElementById("result-profit"),
    fundSelect: document.getElementById("fundSelect"),
    fundHint: document.getElementById("fundHint"),
  };

  var chart = null;
  var DEFAULT_FUND_HINT = els.fundHint ? els.fundHint.textContent : "";

  function setupFundSelect() {
    if (!els.fundSelect || !window.FUND_DATA) return;

    window.FUND_DATA.forEach(function (fund) {
      var opt = document.createElement("option");
      opt.value = fund.id;
      opt.textContent = fund.name + "（" + fund.category + "）";
      els.fundSelect.appendChild(opt);
    });

    els.fundSelect.addEventListener("change", function () {
      var fund = window.FUND_DATA.filter(function (f) { return f.id === els.fundSelect.value; })[0];
      if (!fund) {
        if (els.fundHint) els.fundHint.textContent = DEFAULT_FUND_HINT;
        return;
      }
      var net = Math.max(0, Math.round((fund.referenceReturnPct - fund.expenseRatio) * 10) / 10);
      els.rate.value = net;
      if (els.fundHint) {
        els.fundHint.textContent =
          fund.category + "の想定利回り目安" + fund.referenceReturnRangeText + "（中央値" + fund.referenceReturnPct.toFixed(1) +
          "%）から信託報酬" + fund.expenseRatio.toFixed(3) + "%を差し引いた実質" + net.toFixed(1) +
          "%を初期値にしました。" + window.FUND_DATA_NOTE;
      }
      render();
    });
  }

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

    var ctx = document.getElementById("growthChart").getContext("2d");
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
  }

  [els.initial, els.monthly, els.rate, els.years].forEach(function (el) {
    el.addEventListener("input", render);
  });

  setupFundSelect();
  render();
})();

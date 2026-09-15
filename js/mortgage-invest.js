(function () {
  "use strict";

  var els = {
    principal: document.getElementById("principal"),
    loanRate: document.getElementById("loanRate"),
    years: document.getElementById("years"),
    extra: document.getElementById("extra"),
    investRate: document.getElementById("investRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    yearsOut: document.getElementById("yearsOut"),
    investRateOut: document.getElementById("investRateOut"),
    payoffYears: document.getElementById("result-payoff-years"),
    interestSaved: document.getElementById("result-interest-saved"),
    assetPrepay: document.getElementById("result-asset-prepay"),
    assetInvest: document.getElementById("result-asset-invest"),
    diff: document.getElementById("result-diff"),
    diffNote: document.getElementById("diff-note"),
    monthlyPayment: document.getElementById("monthly-payment"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Fixed-rate ordinary-annuity monthly payment for a loan of `principal`
  // repaid over `months` at monthly rate `r`.
  function monthlyPaymentOf(principal, r, months) {
    if (r === 0) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  function simulate(principal, loanR, investR, months, extra, payPerMonth) {
    var loanBalance = principal;
    var investBalance = 0;
    var interestTotal = 0;
    var payoffMonth = months;
    var payoffReached = false;
    var yearlyNetWorth = [];

    for (var m = 1; m <= months; m++) {
      if (!payoffReached) {
        var interest = loanBalance * loanR;
        var principalPay = payPerMonth - interest;
        var reduction = principalPay + extra;
        interestTotal += interest;
        if (reduction >= loanBalance) {
          loanBalance = 0;
          payoffReached = true;
          payoffMonth = m;
        } else {
          loanBalance -= reduction;
        }
      } else {
        investBalance += payPerMonth + extra;
        investBalance *= 1 + investR;
      }

      if (m % 12 === 0) {
        yearlyNetWorth.push(investBalance - loanBalance);
      }
    }
    if (months % 12 !== 0) {
      yearlyNetWorth.push(investBalance - loanBalance);
    }

    return {
      interestTotal: interestTotal,
      investBalance: investBalance,
      payoffMonth: payoffMonth,
      yearlyNetWorth: yearlyNetWorth,
    };
  }

  function simulateInvestOnly(principal, loanR, investR, months, extra, payPerMonth) {
    var loanBalance = principal;
    var investBalance = 0;
    var interestTotal = 0;
    var yearlyNetWorth = [];

    for (var m = 1; m <= months; m++) {
      var interest = loanBalance * loanR;
      var principalPay = payPerMonth - interest;
      loanBalance = Math.max(0, loanBalance - principalPay);
      interestTotal += interest;

      investBalance += extra;
      investBalance *= 1 + investR;

      if (m % 12 === 0) {
        yearlyNetWorth.push(investBalance - loanBalance);
      }
    }
    if (months % 12 !== 0) {
      yearlyNetWorth.push(investBalance - loanBalance);
    }

    return {
      interestTotal: interestTotal,
      investBalance: investBalance,
      yearlyNetWorth: yearlyNetWorth,
    };
  }

  function render() {
    var principal = Math.max(0, Number(els.principal.value) || 0);
    var loanRatePct = Number(els.loanRate.value);
    var years = Number(els.years.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var investRatePct = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRatePct.toFixed(2) + " %";
    els.yearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRatePct.toFixed(1) + " %";

    var months = Math.round(years * 12);
    var loanR = loanRatePct / 100 / 12;
    var investR = investRatePct / 100 / 12;
    var payPerMonth = monthlyPaymentOf(principal, loanR, months);

    var prepay = simulate(principal, loanR, investR, months, extra, payPerMonth);
    var investOnly = simulateInvestOnly(principal, loanR, investR, months, extra, payPerMonth);

    var payoffYears = prepay.payoffMonth / 12;
    var interestSaved = investOnly.interestTotal - prepay.interestTotal;
    var diff = prepay.investBalance - investOnly.investBalance;

    els.monthlyPayment.textContent = yen(payPerMonth);
    els.payoffYears.textContent = payoffYears.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 年";
    els.interestSaved.textContent = "+" + manYen(interestSaved);
    els.assetPrepay.textContent = yen(prepay.investBalance);
    els.assetInvest.textContent = yen(investOnly.investBalance);
    els.diff.textContent = (diff >= 0 ? "+" : "") + manYen(diff);
    els.diffNote.textContent =
      diff >= 0
        ? "この条件では「繰り上げ返済 → 完済後に積立投資」コースの方が資産形成の面で有利という試算結果です。"
        : "この条件では「繰り上げ返済せず積立投資に回す」コースの方が資産形成の面で有利という試算結果です。";

    var labels = prepay.yearlyNetWorth.map(function (_, i) { return (i + 1) + "年"; });

    var ctx = document.getElementById("compareChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "繰り上げ返済 → 積立コース（資産−ローン残高）",
          data: prepay.yearlyNetWorth.map(function (v) { return Math.round(v); }),
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: true,
          tension: 0.2,
          pointRadius: 0,
        },
        {
          label: "積立投資のみコース（資産−ローン残高）",
          data: investOnly.yearlyNetWorth.map(function (v) { return Math.round(v); }),
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.08)",
          fill: true,
          tension: 0.2,
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
  }

  [els.principal, els.loanRate, els.years, els.extra, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

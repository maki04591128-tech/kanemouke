(function () {
  "use strict";

  var els = {
    balance: document.getElementById("balance"),
    loanRate: document.getElementById("loanRate"),
    years: document.getElementById("years"),
    extra: document.getElementById("extra"),
    invRate: document.getElementById("invRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    yearsOut: document.getElementById("yearsOut"),
    invRateOut: document.getElementById("invRateOut"),
    diff: document.getElementById("result-diff"),
    payment: document.getElementById("result-payment"),
    shorten: document.getElementById("result-shorten"),
    interest: document.getElementById("result-interest"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return (man >= 0 ? "" : "-") + Math.abs(man).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Standard fully-amortizing monthly payment for a fixed-rate loan.
  function standardPayment(balance, rMonthly, n) {
    if (rMonthly === 0) return balance / n;
    return (balance * rMonthly) / (1 - Math.pow(1 + rMonthly, -n));
  }

  // Future value of an ordinary annuity (contribution at end of each month).
  function futureValueAnnuity(contribution, months, rMonthly) {
    if (months <= 0) return 0;
    if (rMonthly === 0) return contribution * months;
    return contribution * ((Math.pow(1 + rMonthly, months) - 1) / rMonthly);
  }

  // Simulates paying off the loan with payment (P + extra) each month.
  // Returns { payoffMonth, totalInterest }.
  function simulatePayoff(balance, rMonthly, payment, n) {
    var totalInterest = 0;
    var m = 0;
    while (balance > 0 && m < n) {
      m++;
      var interest = balance * rMonthly;
      totalInterest += interest;
      var principalPay = payment - interest;
      if (principalPay >= balance) {
        balance = 0;
      } else {
        balance -= principalPay;
      }
    }
    return { payoffMonth: m, totalInterest: totalInterest };
  }

  function render() {
    var balance = Math.max(0, Number(els.balance.value) || 0) * 10000;
    var loanRatePct = Number(els.loanRate.value);
    var years = Number(els.years.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var invRatePct = Number(els.invRate.value);

    els.loanRateOut.textContent = loanRatePct.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";
    els.invRateOut.textContent = invRatePct.toFixed(1) + " %";

    var n = years * 12;
    var rLoan = loanRatePct / 100 / 12;
    var rInv = invRatePct / 100 / 12;

    var payment = standardPayment(balance, rLoan, n);

    // Scenario B: keep the standard schedule, invest the extra amount every month.
    var totalInterestB = payment * n - balance;
    var wealthB = futureValueAnnuity(extra, n, rInv);

    // Scenario A: pay (payment + extra) toward the loan, then invest the
    // full former budget for whatever term remains after payoff.
    var payoff = simulatePayoff(balance, rLoan, payment + extra, n);
    var monthsShortened = n - payoff.payoffMonth;
    var wealthA = futureValueAnnuity(payment + extra, monthsShortened, rInv);

    var interestSaved = totalInterestB - payoff.totalInterest;
    var diff = wealthA - wealthB;

    els.payment.textContent = yen(payment);
    els.shorten.textContent = monthsShortened <= 0
      ? "短縮なし"
      : Math.floor(monthsShortened / 12) + "年" + (monthsShortened % 12) + "ヶ月";
    els.interest.textContent = manYen(interestSaved);
    els.diff.textContent = (diff >= 0 ? "+" : "") + manYen(diff) + (diff >= 0 ? "（繰上返済が有利）" : "（積立投資が有利）");

    // Yearly series for the chart.
    var labels = [];
    var seriesA = [];
    var seriesB = [];
    for (var y = 0; y <= years; y++) {
      var t = y * 12;
      labels.push(y + "年後");

      var monthsInvestedA = t - payoff.payoffMonth;
      seriesA.push(Math.round(futureValueAnnuity(payment + extra, monthsInvestedA, rInv)));
      seriesB.push(Math.round(futureValueAnnuity(extra, t, rInv)));
    }

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "繰り上げ返済＋完済後に積立",
          data: seriesA,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "繰り上げ返済せず積立投資",
          data: seriesB,
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
  }

  [els.balance, els.loanRate, els.years, els.extra, els.invRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

(function () {
  "use strict";

  var els = {
    loanBalance: document.getElementById("loanBalance"),
    loanRate: document.getElementById("loanRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    remainingYears: document.getElementById("remainingYears"),
    remainingYearsOut: document.getElementById("remainingYearsOut"),
    extra: document.getElementById("extra"),
    investRate: document.getElementById("investRate"),
    investRateOut: document.getElementById("investRateOut"),

    payoffPeriod: document.getElementById("result-payoff-period"),
    interestSaved: document.getElementById("result-interest-saved"),
    investFuture: document.getElementById("result-invest-future"),
    investProfit: document.getElementById("result-invest-profit"),
    verdict: document.getElementById("result-verdict"),

    shortenedText: document.getElementById("shortened-text"),
    breakEvenText: document.getElementById("break-even-text"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function monthlyPayment(balance, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (i === 0) return balance / months;
    return (balance * i) / (1 - Math.pow(1 + i, -months));
  }

  // Simulates term-shortening (期間短縮型) prepayment: the regular payment
  // stays fixed, and the extra amount is applied to principal every month.
  function simulatePrepay(balance, annualRatePct, payment, extra) {
    var i = annualRatePct / 100 / 12;
    var totalInterest = 0;
    var months = 0;
    var safetyCap = 1200; // 100 years, avoids an infinite loop on bad input

    while (balance > 0.5 && months < safetyCap) {
      var interest = balance * i;
      var principalPortion = payment + extra - interest;
      if (principalPortion >= balance) {
        totalInterest += interest;
        balance = 0;
      } else {
        totalInterest += interest;
        balance -= principalPortion;
      }
      months++;
    }
    return { months: months, totalInterest: totalInterest };
  }

  // Same monthly-compounding convention as the other simulators: contribute
  // at the start of each month, then apply one month of growth.
  function simulateInvestment(monthly, annualRatePct, months) {
    var r = annualRatePct / 100 / 12;
    var balance = 0;
    var principal = 0;
    for (var m = 1; m <= months; m++) {
      balance += monthly;
      principal += monthly;
      balance *= 1 + r;
    }
    return { balance: balance, principal: principal };
  }

  function yearsMonthsLabel(months) {
    var y = Math.floor(months / 12);
    var m = months % 12;
    if (m === 0) return y + "年";
    return y + "年" + m + "ヶ月";
  }

  function render() {
    var balance = Math.max(0, Number(els.loanBalance.value) || 0);
    var loanRate = Number(els.loanRate.value);
    var years = Number(els.remainingYears.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var investRate = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.remainingYearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";

    var months = Math.round(years * 12);
    var payment = monthlyPayment(balance, loanRate, months);

    var baselineTotalInterest = payment * months - balance;

    var prepay = simulatePrepay(balance, loanRate, payment, extra);
    var interestSaved = Math.max(0, baselineTotalInterest - prepay.totalInterest);
    var monthsShortened = Math.max(0, months - prepay.months);

    var invest = simulateInvestment(extra, investRate, months);
    var investProfit = invest.balance - invest.principal;

    els.payoffPeriod.textContent = yearsMonthsLabel(prepay.months);
    els.interestSaved.textContent = "-" + manYen(interestSaved);
    els.investFuture.textContent = yen(invest.balance);
    els.investProfit.textContent = "+" + manYen(investProfit);

    els.shortenedText.textContent =
      extra > 0
        ? "毎月" + yen(extra) + "の繰り上げ返済により、完済までの期間が " + yearsMonthsLabel(monthsShortened) + " 短縮されます。"
        : "繰り上げ返済額が0円のため、返済期間は短縮されません。";

    if (investProfit > interestSaved) {
      var diff = investProfit - interestSaved;
      els.verdict.textContent = "この条件では、積立投資の運用益が繰り上げ返済の利息軽減額を " + manYen(diff) + " 上回る計算です。";
    } else if (interestSaved > investProfit) {
      var diff2 = interestSaved - investProfit;
      els.verdict.textContent = "この条件では、繰り上げ返済の利息軽減額が積立投資の運用益を " + manYen(diff2) + " 上回る計算です。";
    } else {
      els.verdict.textContent = "この条件では、両者の効果はほぼ同じ金額になります。";
    }

    els.breakEvenText.textContent =
      "目安として、想定利回りが住宅ローン金利（" + loanRate.toFixed(2) + " %）を上回るほど積立投資が有利に、" +
      "下回るほど繰り上げ返済が確実に有利になりやすい関係にあります（税金・手数料・繰り上げ返済にかかる事務手数料は考慮していません）。";

    var ctx = document.getElementById("compareChart").getContext("2d");
    var data = {
      labels: ["繰り上げ返済（利息軽減額）", "積立投資（運用益）"],
      datasets: [
        {
          label: "効果額",
          data: [Math.round(interestSaved), Math.round(investProfit)],
          backgroundColor: ["#0f5f4c", "#d98e04"],
          borderRadius: 6,
          maxBarThickness: 90,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } }, beginAtZero: true },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return yen(ctx.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "bar", data: data, options: options });
    }
  }

  [els.loanBalance, els.loanRate, els.remainingYears, els.extra, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

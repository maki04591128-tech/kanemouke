(function () {
  "use strict";

  var CAPITAL_GAINS_TAX_RATE = 0.20315;

  var els = {
    balance: document.getElementById("balance"),
    loanRate: document.getElementById("loanRate"),
    termYears: document.getElementById("termYears"),
    lump: document.getElementById("lump"),
    investRate: document.getElementById("investRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    termYearsOut: document.getElementById("termYearsOut"),
    investRateOut: document.getElementById("investRateOut"),
    monthsSaved: document.getElementById("result-months-saved"),
    interestSaved: document.getElementById("result-interest-saved"),
    investProfit: document.getElementById("result-invest-profit"),
    detailInterestSaved: document.getElementById("detail-interest-saved"),
    detailInvestProfit: document.getElementById("detail-invest-profit"),
    detailInvestProfitAfterTax: document.getElementById("detail-invest-profit-after-tax"),
    conclusion: document.getElementById("conclusion"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function monthsToText(months) {
    var y = Math.floor(months / 12);
    var m = months % 12;
    if (y === 0) return m + "ヶ月";
    if (m === 0) return y + "年";
    return y + "年" + m + "ヶ月";
  }

  function monthlyPayment(balance, annualRatePct, months) {
    var r = annualRatePct / 100 / 12;
    if (r === 0) return balance / months;
    return (balance * r) / (1 - Math.pow(1 + r, -months));
  }

  // Simulates a fixed-payment amortization over `totalMonths`. Once the
  // balance reaches zero the loan is treated as paid off (no further
  // interest accrues), so the yearly series stays flat after payoff --
  // this lets the shortened (prepaid) schedule be compared year-by-year
  // against the original, full-length schedule.
  function simulate(balance, annualRatePct, payment, totalMonths) {
    var r = annualRatePct / 100 / 12;
    var cumInterest = 0;
    var payoffMonth = null;
    var yearly = [];

    for (var m = 1; m <= totalMonths; m++) {
      if (balance > 0) {
        var interest = balance * r;
        var principalPaid = payment - interest;
        if (principalPaid > balance) principalPaid = balance;
        balance -= principalPaid;
        cumInterest += interest;
        if (balance <= 0.5) {
          balance = 0;
          if (payoffMonth === null) payoffMonth = m;
        }
      }
      if (m % 12 === 0) {
        yearly.push({ month: m, cumInterest: cumInterest });
      }
    }

    return {
      payoffMonth: payoffMonth === null ? totalMonths : payoffMonth,
      totalInterest: cumInterest,
      yearly: yearly,
    };
  }

  function render() {
    var balance = Math.max(0, Number(els.balance.value) || 0);
    var loanRate = Number(els.loanRate.value);
    var termYears = Number(els.termYears.value);
    var lump = Math.min(Math.max(0, Number(els.lump.value) || 0), balance);
    var investRate = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.termYearsOut.textContent = termYears + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";

    var termMonths = termYears * 12;
    var payment = monthlyPayment(balance, loanRate, termMonths);

    var original = simulate(balance, loanRate, payment, termMonths);
    var originalYearly = original.yearly;

    var withPrepay = simulate(balance - lump, loanRate, payment, termMonths);
    var withPrepayYearly = withPrepay.yearly;

    var monthsSaved = termMonths - withPrepay.payoffMonth;
    var interestSaved = original.totalInterest - withPrepay.totalInterest;

    var investMonthlyRate = investRate / 100 / 12;
    var investFV = lump * Math.pow(1 + investMonthlyRate, termMonths);
    var investProfit = investFV - lump;
    var investProfitAfterTax = investProfit * (1 - CAPITAL_GAINS_TAX_RATE);

    els.monthsSaved.textContent = monthsSaved > 0 ? monthsToText(monthsSaved) : "-";
    els.interestSaved.textContent = manYen(interestSaved);
    els.investProfit.textContent = manYen(investProfit);
    els.detailInterestSaved.textContent = yen(interestSaved);
    els.detailInvestProfit.textContent = yen(investProfit);
    els.detailInvestProfitAfterTax.textContent = yen(investProfitAfterTax);

    var diff = investProfit - interestSaved;
    var conclusionText;
    if (lump <= 0) {
      conclusionText = "繰上返済 or 投資に回す資金を入力すると、比較結果がここに表示されます。";
    } else if (Math.abs(diff) < 1000) {
      conclusionText = "この条件では、繰上返済と投資はほぼ同程度の効果です。";
    } else if (diff > 0) {
      conclusionText = "この条件では、投資に回した場合の運用益（税引前）の方が、繰上返済による利息軽減額より約 " + manYen(diff) + " 大きくなります。ただし運用益には税金や価格変動リスクがある一方、繰上返済の効果はほぼ確定している点にご留意ください。";
    } else {
      conclusionText = "この条件では、繰上返済による利息軽減額の方が、投資に回した場合の運用益（税引前）より約 " + manYen(-diff) + " 大きくなります。繰上返済はリスクなく確実に効果が得られる一方、手元資金の流動性は下がる点にご留意ください。";
    }
    els.conclusion.textContent = conclusionText;

    var labels = originalYearly.map(function (d) { return d.month / 12 + "年"; });
    var interestSavedCum = originalYearly.map(function (d, i) {
      return Math.round(d.cumInterest - withPrepayYearly[i].cumInterest);
    });
    var investProfitCum = originalYearly.map(function (d) {
      return Math.round(lump * Math.pow(1 + investMonthlyRate, d.month) - lump);
    });

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "繰上返済による利息軽減額（累計）",
          data: interestSavedCum,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.15,
          pointRadius: 0,
        },
        {
          label: "投資に回した場合の運用益（累計）",
          data: investProfitCum,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
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
  }

  [els.balance, els.loanRate, els.termYears, els.lump, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

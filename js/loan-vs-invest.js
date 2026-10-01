(function () {
  "use strict";

  var CAPITAL_GAINS_TAX_RATE = 0.20315;

  var els = {
    balance: document.getElementById("kurioage-balance"),
    loanRate: document.getElementById("kurioage-loanRate"),
    termYears: document.getElementById("kurioage-termYears"),
    lump: document.getElementById("kurioage-lump"),
    investRate: document.getElementById("kurioage-investRate"),
    delayYears: document.getElementById("kurioage-delayYears"),
    loanRateOut: document.getElementById("kurioage-loanRateOut"),
    termYearsOut: document.getElementById("kurioage-termYearsOut"),
    investRateOut: document.getElementById("kurioage-investRateOut"),
    delayYearsOut: document.getElementById("kurioage-delayYearsOut"),
    monthsSaved: document.getElementById("kurioage-result-months-saved"),
    interestSaved: document.getElementById("kurioage-result-interest-saved"),
    investProfit: document.getElementById("kurioage-result-invest-profit"),
    delayDiff: document.getElementById("kurioage-result-delay-diff"),
    detailInterestSaved: document.getElementById("kurioage-detail-interest-saved"),
    detailInvestProfit: document.getElementById("kurioage-detail-invest-profit"),
    detailInvestProfitAfterTax: document.getElementById("kurioage-detail-invest-profit-after-tax"),
    detailDelayDiff: document.getElementById("kurioage-detail-delay-diff"),
    conclusion: document.getElementById("kurioage-conclusion"),
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
    var payoffMonth = balance <= 0 ? 0 : null;
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
      finalBalance: balance,
    };
  }

  function render() {
    var balance = Math.max(0, Number(els.balance.value) || 0);
    var loanRate = Number(els.loanRate.value);
    var termYears = Number(els.termYears.value);
    var lump = Math.min(Math.max(0, Number(els.lump.value) || 0), balance);
    var investRate = Number(els.investRate.value);
    var delayYears = Math.min(Math.max(0, Number(els.delayYears.value) || 0), Math.max(0, termYears - 1));

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.termYearsOut.textContent = termYears + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";
    els.delayYearsOut.textContent = delayYears + " 年";

    var termMonths = termYears * 12;
    var payment = monthlyPayment(balance, loanRate, termMonths);
    var investMonthlyRate = investRate / 100 / 12;

    var original = simulate(balance, loanRate, payment, termMonths);
    var originalYearly = original.yearly;

    // "Delayed prepayment" models putting the lump sum into investments
    // first and using it to prepay `delayYears` later: the loan follows
    // the original schedule during the delay (phase1), then the grown
    // lump sum is applied to whatever balance remains (phase2). With
    // delayYears = 0 this reduces exactly to an immediate prepayment.
    var delayMonths = delayYears * 12;
    var phase1 = simulate(balance, loanRate, payment, delayMonths);
    var lumpGrown = lump * Math.pow(1 + investMonthlyRate, delayMonths);
    var prepayAmount = Math.min(lumpGrown, phase1.finalBalance);
    var phase2 = simulate(phase1.finalBalance - prepayAmount, loanRate, payment, termMonths - delayMonths);

    var totalInterestDelayed = phase1.totalInterest + phase2.totalInterest;
    var totalMonthsDelayed = delayMonths + phase2.payoffMonth;
    var monthsSaved = termMonths - totalMonthsDelayed;
    var interestSaved = original.totalInterest - totalInterestDelayed;

    // Reference: prepaying immediately (delayYears = 0), for the "delay diff" card.
    var immediatePrepay = simulate(balance - lump, loanRate, payment, termMonths);
    var immediateInterestSaved = original.totalInterest - immediatePrepay.totalInterest;
    var delayDiff = interestSaved - immediateInterestSaved;

    var investFV = lump * Math.pow(1 + investMonthlyRate, termMonths);
    var investProfit = investFV - lump;
    var investProfitAfterTax = investProfit * (1 - CAPITAL_GAINS_TAX_RATE);

    els.monthsSaved.textContent = monthsSaved > 0 ? monthsToText(monthsSaved) : "-";
    els.interestSaved.textContent = manYen(interestSaved);
    els.investProfit.textContent = manYen(investProfit);
    els.delayDiff.textContent = (delayDiff > 0 ? "+" : delayDiff < 0 ? "-" : "±") + manYen(Math.abs(delayDiff));
    els.detailInterestSaved.textContent = yen(interestSaved);
    els.detailInvestProfit.textContent = yen(investProfit);
    els.detailInvestProfitAfterTax.textContent = yen(investProfitAfterTax);
    els.detailDelayDiff.textContent = (delayDiff > 0 ? "+" : delayDiff < 0 ? "-" : "±") + yen(Math.abs(delayDiff));

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
    if (delayYears > 0 && lump > 0) {
      conclusionText += "「繰上返済を実行するまでの年数」を" + delayYears + "年に設定しているため、それまでの" + delayYears + "年間は資金を運用に回し、その評価額（" + manYen(lumpGrown) + "）を" + delayYears + "年後の繰上返済に充てる前提で試算しています。今すぐ実行する場合と比べた利息軽減額の差は" + (delayDiff >= 0 ? "+" : "-") + manYen(Math.abs(delayDiff)) + "です。";
    }
    els.conclusion.textContent = conclusionText;

    var labels = originalYearly.map(function (d) { return d.month / 12 + "年"; });
    var interestSavedCum = originalYearly.map(function (d, i) {
      var year = i + 1;
      var cumInterestDelayed;
      if (year <= delayYears) {
        cumInterestDelayed = d.cumInterest;
      } else {
        var relIdx = year - delayYears - 1;
        cumInterestDelayed = phase1.totalInterest + phase2.yearly[relIdx].cumInterest;
      }
      return Math.round(d.cumInterest - cumInterestDelayed);
    });
    var investProfitCum = originalYearly.map(function (d) {
      return Math.round(lump * Math.pow(1 + investMonthlyRate, d.month) - lump);
    });

    var ctx = document.getElementById("kurioage-growthChart").getContext("2d");
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
    if (window.renderChartDataTable) window.renderChartDataTable("kurioage-growthDataTable", chart);
  }

  [els.balance, els.loanRate, els.termYears, els.lump, els.investRate, els.delayYears].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

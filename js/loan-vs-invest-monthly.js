(function () {
  "use strict";

  var els = {
    balance: document.getElementById("balance"),
    loanRate: document.getElementById("loanRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    years: document.getElementById("years"),
    yearsOut: document.getElementById("yearsOut"),
    extra: document.getElementById("extra"),
    investRate: document.getElementById("investRate"),
    investRateOut: document.getElementById("investRateOut"),
    payoffMonths: document.getElementById("result-payoff"),
    interestSaved: document.getElementById("result-interest-saved"),
    assetA: document.getElementById("result-asset-a"),
    assetB: document.getElementById("result-asset-b"),
    winner: document.getElementById("result-winner"),
    winnerDiff: document.getElementById("winner-diff"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Standard fixed-payment amortization formula.
  function monthlyPayment(principal, annualRatePct, months) {
    var r = annualRatePct / 100 / 12;
    if (r === 0) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  // Simulate paying down the loan with a fixed monthly payment plus a
  // fixed extra amount toward principal every month, until it is paid off.
  function simulatePrepayment(principal, annualRatePct, payment, extra) {
    var r = annualRatePct / 100 / 12;
    var balance = principal;
    var totalInterest = 0;
    var month = 0;
    var maxMonths = 100 * 12;

    while (balance > 0 && month < maxMonths) {
      month++;
      var interest = balance * r;
      var principalPaid = payment - interest + extra;
      if (principalPaid > balance) principalPaid = balance;
      balance -= principalPaid;
      totalInterest += interest;
    }

    return { months: month, totalInterest: totalInterest };
  }

  // Contribute `monthly` at the start of every month, then apply one
  // month of growth (same convention as the other simulators on this site).
  function futureValue(monthly, annualRatePct, months) {
    var r = annualRatePct / 100 / 12;
    var balance = 0;
    var series = [];
    for (var m = 1; m <= months; m++) {
      balance += monthly;
      balance *= 1 + r;
      series.push(balance);
    }
    return { balance: balance, series: series };
  }

  function render() {
    var principal = Math.max(0, Number(els.balance.value) || 0);
    var loanRate = Number(els.loanRate.value);
    var years = Number(els.years.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var investRate = Number(els.investRate.value);
    var totalMonths = Math.round(years * 12);

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.yearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";

    if (principal <= 0 || totalMonths <= 0) return;

    var payment = monthlyPayment(principal, loanRate, totalMonths);
    var baselineTotalInterest = payment * totalMonths - principal;

    // Scenario A: pay `extra` toward the loan every month, then once it is
    // paid off, invest the freed-up payment + extra for the rest of the
    // original loan term. Both scenarios end with the loan fully paid off
    // at `totalMonths`, so the comparison at that point is investable assets only.
    var prepay = simulatePrepayment(principal, loanRate, payment, extra);
    var payoffMonths = Math.min(prepay.months, totalMonths);
    var remainingMonths = totalMonths - payoffMonths;
    var postPayoffInvestment = remainingMonths > 0
      ? futureValue(payment + extra, investRate, remainingMonths)
      : { balance: 0, series: [] };
    var assetA = postPayoffInvestment.balance;

    // Scenario B: keep the original repayment schedule (no prepayment) and
    // invest `extra` every month for the full original loan term instead.
    var investB = futureValue(extra, investRate, totalMonths);
    var assetB = investB.balance;

    var interestSaved = baselineTotalInterest - prepay.totalInterest;
    var diff = assetA - assetB;

    els.payoffMonths.textContent = (payoffMonths / 12).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 年" + (payoffMonths < totalMonths ? "（" + (totalMonths - payoffMonths) / 12 + "年短縮）" : "");
    els.interestSaved.textContent = "+" + manYen(Math.max(0, interestSaved));
    els.assetA.textContent = yen(assetA);
    els.assetB.textContent = yen(assetB);

    if (Math.abs(diff) < 1) {
      els.winner.textContent = "ほぼ互角";
      els.winnerDiff.textContent = "どちらの方法でも、期間終了時点の資産額はほぼ同じという試算結果です。";
    } else if (diff > 0) {
      els.winner.textContent = "繰り上げ返済が有利";
      els.winnerDiff.textContent = "この条件では、繰り上げ返済を優先した方が期間終了時点の資産が " + manYen(diff) + " 多くなる試算結果です。";
    } else {
      els.winner.textContent = "積立投資が有利";
      els.winnerDiff.textContent = "この条件では、繰り上げ返済せず積立投資に回した方が期間終了時点の資産が " + manYen(-diff) + " 多くなる試算結果です。";
    }

    // Build yearly series for both scenarios over the full original term
    // for the chart: A stays at 0 until payoff, then grows; B grows from month 1.
    var labels = [];
    var seriesA = [];
    var seriesB = [];
    for (var y = 1; y <= years; y++) {
      var mo = Math.min(y * 12, totalMonths);
      labels.push(y + "年");
      var idxA = mo - payoffMonths;
      seriesA.push(idxA > 0 ? Math.round(postPayoffInvestment.series[Math.min(idxA, postPayoffInvestment.series.length) - 1]) : 0);
      seriesB.push(Math.round(investB.series[mo - 1] || 0));
    }

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "A: 繰り上げ返済 → 完済後に積立投資",
          data: seriesA,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "B: 繰り上げ返済せず積立投資",
          data: seriesB,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.10)",
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

  [els.balance, els.loanRate, els.years, els.extra, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

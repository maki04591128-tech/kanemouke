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
    resultShorten: document.getElementById("result-shorten"),
    resultInterest: document.getElementById("result-interest"),
    resultInvest: document.getElementById("result-invest"),
    conclusion: document.getElementById("conclusion"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    return (n / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function monthsLabel(months) {
    months = Math.max(0, Math.round(months));
    var y = Math.floor(months / 12);
    var m = months % 12;
    if (y === 0) return m + "ヶ月";
    if (m === 0) return y + "年";
    return y + "年" + m + "ヶ月";
  }

  // Standard amortization: fixed monthly payment for balance/rate/n months.
  function amortizedPayment(balance, monthlyRate, n) {
    if (monthlyRate === 0) return balance / n;
    var f = Math.pow(1 + monthlyRate, n);
    return (balance * monthlyRate * f) / (f - 1);
  }

  // Simulate accelerated repayment (normal payment + extra each month).
  // Returns { months, totalInterest }.
  function simulateAccelerated(balance, monthlyRate, payment, extra, maxMonths) {
    var totalInterest = 0;
    var months = 0;
    var totalPayment = payment + extra;
    while (balance > 0.5 && months < maxMonths) {
      var interest = balance * monthlyRate;
      var principalPaid = totalPayment - interest;
      if (principalPaid >= balance) {
        totalInterest += balance * monthlyRate;
        balance = 0;
      } else {
        balance -= principalPaid;
        totalInterest += interest;
      }
      months++;
    }
    return { months: months, totalInterest: totalInterest };
  }

  // Future value of investing `monthly` yen at the start of each month for `months` months.
  function futureValue(monthly, annualRatePct, months) {
    var r = annualRatePct / 100 / 12;
    var balance = 0;
    var yearly = [{ month: 0, value: 0 }];
    for (var m = 1; m <= months; m++) {
      balance += monthly;
      balance *= 1 + r;
      if (m % 12 === 0 || m === months) {
        yearly.push({ month: m, value: balance });
      }
    }
    return { total: balance, series: yearly };
  }

  function render() {
    var balanceMan = Math.max(0, Number(els.balance.value) || 0);
    var balance = balanceMan * 10000;
    var loanRate = Number(els.loanRate.value);
    var years = Number(els.years.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var investRate = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.yearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";

    var monthlyLoanRate = loanRate / 100 / 12;
    var n = years * 12;
    var payment = amortizedPayment(balance, monthlyLoanRate, n);
    var interestNormal = payment * n - balance;

    var accel = simulateAccelerated(balance, monthlyLoanRate, payment, extra, n);
    var interestSaved = Math.max(0, interestNormal - accel.totalInterest);
    var monthsShortened = Math.max(0, n - accel.months);

    var invMonths = Math.max(1, accel.months);
    var fv = futureValue(extra, investRate, invMonths);
    var investedPrincipal = extra * invMonths;
    var investmentGain = Math.max(0, fv.total - investedPrincipal);

    els.resultShorten.textContent = monthsLabel(monthsShortened) + " 短縮";
    els.resultInterest.textContent = manYen(interestSaved);
    els.resultInvest.textContent = manYen(investmentGain);

    if (interestSaved > investmentGain) {
      els.conclusion.textContent =
        "この条件では、繰り上げ返済による利息軽減額（" + manYen(interestSaved) +
        "）が、同額を投資した場合の運用益（" + manYen(investmentGain) +
        "）を上回っています。ただし繰り上げ返済は「確実な効果」、投資は「期待値であり元本割れの可能性もある」という違いがある点にご注意ください。";
    } else {
      els.conclusion.textContent =
        "この条件では、同額を投資した場合の運用益（" + manYen(investmentGain) +
        "）が、繰り上げ返済による利息軽減額（" + manYen(interestSaved) +
        "）を上回っています。ただし投資は元本割れの可能性がある一方、繰り上げ返済による利息軽減は確実な効果である点も踏まえてご検討ください。";
    }

    var labels = fv.series.map(function (d) { return monthsLabel(d.month); });
    var investData = fv.series.map(function (d) { return Math.round(d.value); });
    var interestLine = fv.series.map(function () { return Math.round(interestSaved); });

    var ctx = document.getElementById("compareChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "投資した場合の評価額（累計）",
          data: investData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "繰り上げ返済による利息軽減額（確定額）",
          data: interestLine,
          borderColor: "#d98e04",
          borderDash: [6, 4],
          backgroundColor: "transparent",
          fill: false,
          tension: 0,
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
        legend: { display: true, position: "bottom" },
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

  [els.balance, els.loanRate, els.years, els.extra, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

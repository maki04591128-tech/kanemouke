(function () {
  "use strict";

  var els = {
    balance: document.getElementById("balance"),
    loanRate: document.getElementById("loanRate"),
    years: document.getElementById("years"),
    surplus: document.getElementById("surplus"),
    investRate: document.getElementById("investRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    yearsOut: document.getElementById("yearsOut"),
    investRateOut: document.getElementById("investRateOut"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    interestSaved: document.getElementById("result-interest-saved"),
    payoffShorten: document.getElementById("result-payoff-shorten"),
    assetPrepay: document.getElementById("result-asset-prepay"),
    assetInvest: document.getElementById("result-asset-invest"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function standardMonthlyPayment(principal, monthlyRate, months) {
    if (monthlyRate === 0) return principal / months;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  }

  // Strategy A: put the surplus toward extra loan repayment each month.
  // Once the loan is paid off early, the freed-up monthly cash (standardM + surplus)
  // is invested for the rest of the original horizon.
  function simulatePrepay(principal, loanRate, standardM, surplus, investRate, months) {
    var balance = principal;
    var invest = 0;
    var totalInterest = 0;
    var payoffMonth = months;
    var payoffReached = false;
    var series = [];

    for (var m = 1; m <= months; m++) {
      if (balance > 0) {
        var interest = balance * loanRate;
        var payment = standardM + surplus;
        var principalPaid = payment - interest;
        if (principalPaid >= balance) {
          var leftover = payment - interest - balance;
          totalInterest += interest;
          balance = 0;
          payoffMonth = m;
          payoffReached = true;
          invest += Math.max(0, leftover);
          invest *= 1 + investRate;
        } else {
          balance -= principalPaid;
          totalInterest += interest;
        }
      } else {
        invest += standardM + surplus;
        invest *= 1 + investRate;
      }
      if (m % 12 === 0) {
        series.push({ year: m / 12, netWorth: invest - balance });
      }
    }
    if (!payoffReached) payoffMonth = months;

    return {
      payoffMonth: payoffMonth,
      totalInterest: totalInterest,
      finalAsset: invest - balance,
      series: series,
    };
  }

  // Strategy B: keep repaying the loan on the original schedule and invest
  // the surplus every month instead.
  function simulateInvest(principal, loanRate, standardM, surplus, investRate, months) {
    var balance = principal;
    var invest = 0;
    var totalInterest = 0;
    var series = [];

    for (var m = 1; m <= months; m++) {
      if (balance > 0) {
        var interest = balance * loanRate;
        var principalPaid = standardM - interest;
        if (principalPaid > balance) principalPaid = balance;
        balance -= principalPaid;
        totalInterest += interest;
      }
      invest += surplus;
      invest *= 1 + investRate;
      if (m % 12 === 0) {
        series.push({ year: m / 12, netWorth: invest - balance });
      }
    }

    return { totalInterest: totalInterest, finalAsset: invest - balance, series: series };
  }

  function render() {
    var balanceMan = Math.max(0, Number(els.balance.value) || 0);
    var principal = balanceMan * 10000;
    var loanRatePct = Number(els.loanRate.value);
    var years = Number(els.years.value);
    var surplus = Math.max(0, Number(els.surplus.value) || 0);
    var investRatePct = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRatePct.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRatePct.toFixed(1) + " %";

    var months = Math.round(years * 12);
    var loanRate = loanRatePct / 100 / 12;
    var investRate = investRatePct / 100 / 12;
    var standardM = standardMonthlyPayment(principal, loanRate, months);

    var prepay = simulatePrepay(principal, loanRate, standardM, surplus, investRate, months);
    var invest = simulateInvest(principal, loanRate, standardM, surplus, investRate, months);

    var interestSaved = invest.totalInterest - prepay.totalInterest;
    var monthsShortened = months - prepay.payoffMonth;
    var assetDiff = prepay.finalAsset - invest.finalAsset;

    els.interestSaved.textContent = manYen(interestSaved);
    els.payoffShorten.textContent =
      monthsShortened > 0
        ? (monthsShortened / 12).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 年 短縮"
        : "短縮なし";
    els.assetPrepay.textContent = manYen(prepay.finalAsset);
    els.assetInvest.textContent = manYen(invest.finalAsset);

    if (surplus <= 0) {
      els.verdict.textContent = "毎月の金額を入力すると比較結果が表示されます";
      els.verdictSub.textContent = "";
    } else if (assetDiff > 0) {
      els.verdict.textContent =
        "この条件では「繰り上げ返済」の方が " + manYen(assetDiff) + " 有利です";
      els.verdictSub.textContent =
        "ローン金利（" + loanRatePct.toFixed(1) + "%）が運用利回りより実質的に有利に働く条件です。";
    } else if (assetDiff < 0) {
      els.verdict.textContent =
        "この条件では「積立投資」の方が " + manYen(-assetDiff) + " 有利です";
      els.verdictSub.textContent =
        "想定運用利回り（" + investRatePct.toFixed(1) + "%）がローン金利を上回っているためです。ただし投資には元本割れのリスクがあります。";
    } else {
      els.verdict.textContent = "どちらの方式でも将来資産はほぼ同じ試算結果です";
      els.verdictSub.textContent = "";
    }

    var labels = invest.series.map(function (d) { return d.year + "年"; });
    var prepayData = prepay.series.map(function (d) { return Math.round(d.netWorth); });
    var investData = invest.series.map(function (d) { return Math.round(d.netWorth); });

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "繰り上げ返済＋その後投資",
          data: prepayData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "積立投資のみ（返済は通常通り）",
          data: investData,
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

  [els.balance, els.loanRate, els.years, els.surplus, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

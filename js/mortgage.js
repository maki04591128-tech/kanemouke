(function () {
  "use strict";

  var els = {
    balance: document.getElementById("balance"),
    years: document.getElementById("years"),
    loanRate: document.getElementById("loanRate"),
    prepay: document.getElementById("prepay"),
    investRate: document.getElementById("investRate"),
    yearsOut: document.getElementById("yearsOut"),
    loanRateOut: document.getElementById("loanRateOut"),
    investRateOut: document.getElementById("investRateOut"),
    saved: document.getElementById("result-saved"),
    profit: document.getElementById("result-profit"),
    shorten: document.getElementById("result-shorten"),
    verdict: document.getElementById("result-verdict"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Equal-payment (annuity) monthly payment for a loan.
  function monthlyPaymentFor(principal, monthlyRate, months) {
    if (months <= 0) return 0;
    if (monthlyRate === 0) return principal / months;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  }

  // Months needed to pay off `principal` with a fixed `payment` (期間短縮型).
  function monthsToPayOff(principal, monthlyRate, payment) {
    if (principal <= 0) return 0;
    if (payment <= 0) return Infinity;
    if (monthlyRate === 0) return principal / payment;
    var ratio = 1 - (monthlyRate * principal) / payment;
    if (ratio <= 0) return Infinity; // payment too small to ever cover interest
    return -Math.log(ratio) / Math.log(1 + monthlyRate);
  }

  function render() {
    var balanceMan = Math.max(0, Number(els.balance.value) || 0);
    var principal = balanceMan * 10000;
    var years = Number(els.years.value);
    var loanRatePct = Number(els.loanRate.value);
    var prepayMan = Math.max(0, Number(els.prepay.value) || 0);
    var prepay = Math.min(prepayMan * 10000, principal);
    var investRatePct = Number(els.investRate.value);

    els.yearsOut.textContent = years + " 年";
    els.loanRateOut.textContent = loanRatePct.toFixed(1) + " %";
    els.investRateOut.textContent = investRatePct.toFixed(1) + " %";

    var r = loanRatePct / 100 / 12;
    var n = years * 12;
    var payment = monthlyPaymentFor(principal, r, n);

    var newPrincipal = principal - prepay;
    var n2 = monthsToPayOff(newPrincipal, r, payment);
    var interestOriginal = payment * n - principal;
    var interestNew = isFinite(n2) ? payment * n2 - newPrincipal : interestOriginal;
    var interestSaved = Math.max(0, interestOriginal - interestNew);
    var monthsShortened = isFinite(n2) ? Math.max(0, n - n2) : 0;

    var ir = investRatePct / 100 / 12;
    var investProfit = prepay * Math.pow(1 + ir, n) - prepay;

    els.saved.textContent = manYen(interestSaved);
    els.profit.textContent = manYen(investProfit);

    var shortenYears = Math.floor(monthsShortened / 12);
    var shortenMonths = Math.round(monthsShortened % 12);
    els.shorten.textContent = shortenYears + " 年 " + shortenMonths + " ヶ月";

    var diff = investProfit - interestSaved;
    if (prepay <= 0) {
      els.verdict.textContent = "「繰り上げ返済または運用に使えるお金」を入力すると、比較結果が表示されます。";
    } else if (Math.abs(diff) < 10000) {
      els.verdict.textContent = "この条件では、繰り上げ返済と運用の効果はほぼ同程度です（税金・手数料は考慮していません）。";
    } else if (diff > 0) {
      els.verdict.textContent =
        "この条件では、運用に回した場合の想定運用益（税引前）の方が " + manYen(diff) + " 大きくなります。ただし運用には元本を割るリスクがあり、繰り上げ返済の利息節約は確実な効果である点も踏まえてご判断ください。";
    } else {
      els.verdict.textContent =
        "この条件では、繰り上げ返済による利息の節約額の方が " + manYen(-diff) + " 大きくなります。繰り上げ返済は確実に効果が出る一方、手元の現金が減る点にはご注意ください。";
    }

    var ctx = document.getElementById("compareChart").getContext("2d");
    var data = {
      labels: ["繰り上げ返済で節約できる利息", "運用した場合の運用益（税引前）"],
      datasets: [
        {
          label: "金額",
          data: [Math.round(interestSaved), Math.round(investProfit)],
          backgroundColor: ["#0f5f4c", "#d98e04"],
          borderRadius: 6,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
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

  [els.balance, els.years, els.loanRate, els.prepay, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

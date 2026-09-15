(function () {
  "use strict";

  var els = {
    loanBalance: document.getElementById("loanBalance"),
    loanRate: document.getElementById("loanRate"),
    loanYears: document.getElementById("loanYears"),
    extra: document.getElementById("extra"),
    investRate: document.getElementById("investRate"),
    loanRateOut: document.getElementById("loanRateOut"),
    loanYearsOut: document.getElementById("loanYearsOut"),
    investRateOut: document.getElementById("investRateOut"),
    winner: document.getElementById("result-winner"),
    netA: document.getElementById("result-netA"),
    netB: document.getElementById("result-netB"),
    sub: document.getElementById("result-sub"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }
  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 0 }) + " 万円";
  }
  function signedManYen(n) {
    return (n >= 0 ? "+" : "") + manYen(n);
  }

  // Standard fixed-rate amortization payment for the original loan schedule.
  function scheduledPayment(balance, monthlyRate, months) {
    if (months <= 0) return balance;
    if (monthlyRate === 0) return balance / months;
    var f = Math.pow(1 + monthlyRate, months);
    return (balance * monthlyRate * f) / (f - 1);
  }

  // Simulates both plans month-by-month over the same horizon (original loan term)
  // with the same total monthly cash outflow (scheduled payment + extra) throughout:
  //   Plan A (繰り上げ返済プラン): extra money shortens the loan; once paid off, the
  //     freed-up payment + extra is invested for the rest of the horizon.
  //   Plan B (投資優先プラン): loan runs its full contractual term; extra money is
  //     invested every month from the start.
  function simulate(loanBalance, loanRatePct, years, extra, investRatePct) {
    var i = loanRatePct / 100 / 12;
    var j = investRatePct / 100 / 12;
    var N = Math.round(years * 12);
    var P = scheduledPayment(loanBalance, i, N);

    var loanA = loanBalance, investA = 0, totalInterestA = 0, payoffMonth = N;
    var loanB = loanBalance, investB = 0, totalInterestB = 0;
    var paidOffA = false;

    var yearly = [{ year: 0, netA: 0, netB: 0 }];

    for (var m = 1; m <= N; m++) {
      // Plan B: unchanged schedule, extra goes to investment.
      var interestB = loanB * i;
      var principalB = P - interestB;
      if (principalB > loanB) principalB = loanB;
      loanB -= principalB;
      totalInterestB += interestB;
      investB = (investB + extra) * (1 + j);

      // Plan A: while loan remains, extra accelerates payoff; afterwards, the
      // full former payment (P + extra) is invested instead.
      if (!paidOffA) {
        var interestA = loanA * i;
        var principalA = P - interestA;
        var reduce = principalA + extra;
        if (reduce > loanA) reduce = loanA;
        loanA -= reduce;
        totalInterestA += interestA;
        if (loanA <= 0.005) {
          loanA = 0;
          paidOffA = true;
          payoffMonth = m;
        }
      } else {
        investA = (investA + P + extra) * (1 + j);
      }

      if (m % 12 === 0) {
        yearly.push({
          year: m / 12,
          netA: investA - loanA,
          netB: investB - loanB,
        });
      }
    }

    return {
      payment: P,
      payoffMonth: payoffMonth,
      totalInterestA: totalInterestA,
      totalInterestB: totalInterestB,
      netA: investA - loanA,
      netB: investB - loanB,
      yearly: yearly,
    };
  }

  function render() {
    var loanBalance = Math.max(0, Number(els.loanBalance.value) || 0) * 10000;
    var loanRate = Number(els.loanRate.value);
    var years = Number(els.loanYears.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var investRate = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.loanYearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";

    var r = simulate(loanBalance, loanRate, years, extra, investRate);
    var diff = r.netB - r.netA;

    if (Math.abs(diff) < 10000) {
      els.winner.textContent = "ほぼ互角";
    } else if (diff > 0) {
      els.winner.textContent = "投資優先プランが有利 " + signedManYen(diff);
    } else {
      els.winner.textContent = "繰り上げ返済プランが有利 " + signedManYen(-diff);
    }

    els.netA.textContent = manYen(r.netA);
    els.netB.textContent = manYen(r.netB);

    var payoffYears = Math.floor(r.payoffMonth / 12);
    var payoffMonths = r.payoffMonth % 12;
    var savedInterest = r.totalInterestB - r.totalInterestA;
    els.sub.textContent =
      "繰り上げ返済プランは " + payoffYears + "年" + payoffMonths + "ヶ月で完済（利息軽減額 " +
      manYen(savedInterest) + "）／毎月の返済額（元本）は " + yen(r.payment) + "";

    var labels = r.yearly.map(function (d) { return d.year + "年後"; });
    var dataA = r.yearly.map(function (d) { return Math.round(d.netA); });
    var dataB = r.yearly.map(function (d) { return Math.round(d.netB); });

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "純資産（投資優先プラン）",
          data: dataB,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "純資産（繰り上げ返済プラン）",
          data: dataA,
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
            label: function (ctx) { return ctx.dataset.label + "：" + manYen(ctx.parsed.y); },
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

  [els.loanBalance, els.loanRate, els.loanYears, els.extra, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

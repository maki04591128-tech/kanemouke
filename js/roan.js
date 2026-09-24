(function () {
  "use strict";

  var els = {
    balance: document.getElementById("roan-balance"),
    loanRate: document.getElementById("roan-loanRate"),
    loanRateOut: document.getElementById("roan-loanRateOut"),
    years: document.getElementById("roan-years"),
    yearsOut: document.getElementById("roan-yearsOut"),
    extra: document.getElementById("roan-extra"),
    investRate: document.getElementById("roan-investRate"),
    investRateOut: document.getElementById("roan-investRateOut"),
    payoffNormal: document.getElementById("roan-result-payoff-normal"),
    payoffPrepay: document.getElementById("roan-result-payoff-prepay"),
    interestSaved: document.getElementById("roan-result-interest-saved"),
    investProfit: document.getElementById("roan-result-invest-profit"),
    verdictTitle: document.getElementById("roan-verdict-title"),
    verdictBody: document.getElementById("roan-verdict-body"),
    verdictBox: document.getElementById("roan-verdict-box"),
    detailNormalInterest: document.getElementById("roan-detail-normal-interest"),
    detailPrepayInterest: document.getElementById("roan-detail-prepay-interest"),
    detailShorten: document.getElementById("roan-detail-shorten"),
    detailInvestPrincipal: document.getElementById("roan-detail-invest-principal"),
    detailInvestTotal: document.getElementById("roan-detail-invest-total"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function monthlyPayment(principal, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (i === 0) return principal / months;
    return (principal * i) / (1 - Math.pow(1 + i, -months));
  }

  // Simulates a fixed-payment mortgage, optionally with a constant extra
  // amount applied to principal every month. Returns the month-by-month
  // remaining balance plus the totals needed for the comparison.
  function simulateLoan(principal, annualRatePct, months, extra) {
    var i = annualRatePct / 100 / 12;
    var payment = monthlyPayment(principal, annualRatePct, months);
    var balance = principal;
    var totalPaid = 0;
    var balances = [principal];
    var m = 0;
    var safetyCap = months * 2 + 24;

    while (balance > 0.5 && m < safetyCap) {
      var interest = balance * i;
      var due = payment + extra;
      if (due > balance + interest) due = balance + interest;
      balance = balance + interest - due;
      totalPaid += due;
      m++;
      balances.push(Math.max(balance, 0));
    }

    return {
      months: m,
      totalPaid: totalPaid,
      totalInterest: totalPaid - principal,
      monthlyPayment: payment,
      balances: balances,
    };
  }

  // Same "contribute then grow" monthly-compounding assumption used by the
  // other simulators on this site (tsumitate / hitsuyou-gaku / ideco).
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

  function yearlySeries(balances) {
    var months = balances.length - 1;
    var out = [];
    for (var y = 0; y * 12 <= months; y++) {
      out.push({ year: y, balance: balances[Math.min(y * 12, months)] });
    }
    if (months % 12 !== 0) {
      out.push({ year: (months / 12).toFixed(1), balance: balances[months] });
    }
    return out;
  }

  function render() {
    var balance = Math.max(1, Number(els.balance.value) || 0);
    var loanRate = Number(els.loanRate.value);
    var years = Number(els.years.value);
    var extra = Math.max(0, Number(els.extra.value) || 0);
    var investRate = Number(els.investRate.value);

    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.yearsOut.textContent = years + " 年";
    els.investRateOut.textContent = investRate.toFixed(1) + " %";

    var months = Math.round(years * 12);

    var normal = simulateLoan(balance, loanRate, months, 0);
    var prepay = simulateLoan(balance, loanRate, months, extra);
    var interestSaved = normal.totalInterest - prepay.totalInterest;

    var invest = simulateInvestment(extra, investRate, prepay.months);
    var investProfit = invest.balance - invest.principal;

    els.payoffNormal.textContent = (months / 12).toFixed(1) + " 年";
    els.payoffPrepay.textContent = (prepay.months / 12).toFixed(1) + " 年";
    els.interestSaved.textContent = manYen(interestSaved);
    els.investProfit.textContent = manYen(investProfit);

    els.detailNormalInterest.textContent = yen(normal.totalInterest);
    els.detailPrepayInterest.textContent = yen(prepay.totalInterest);
    els.detailShorten.textContent =
      ((months - prepay.months) / 12).toFixed(1) + " 年（" + (months - prepay.months) + "ヶ月）短縮";
    els.detailInvestPrincipal.textContent = yen(invest.principal);
    els.detailInvestTotal.textContent = yen(invest.balance);

    var diff = investProfit - interestSaved;
    els.verdictBox.classList.remove("accent");
    if (extra <= 0) {
      els.verdictTitle.textContent = "毎月の金額を入力してください";
      els.verdictBody.innerHTML =
        "「毎月いくら回すか」を入力すると、繰り上げ返済と積立投資のどちらが有利かをこの条件下で比較します。";
    } else if (Math.abs(diff) < Math.max(interestSaved, investProfit) * 0.02) {
      els.verdictTitle.textContent = "この条件では、ほぼ互角です";
      els.verdictBody.innerHTML =
        "利息軽減額（" + manYen(interestSaved) + "）と積立投資の運用益（" + manYen(investProfit) +
        "）の差はわずかです。繰り上げ返済は「確実に金利分だけ得をする」効果、積立投資は「元本割れリスクがあるが上振れも期待できる」効果である点を踏まえて選びましょう。";
    } else if (diff > 0) {
      els.verdictTitle.textContent = "この条件では「積立投資」が有利な試算です";
      els.verdictBody.innerHTML =
        "積立投資の運用益は" + manYen(investProfit) + "、繰り上げ返済による利息軽減額は" + manYen(interestSaved) +
        "で、差は" + manYen(diff) + "です。ただし投資の運用益は想定利回り" + investRate.toFixed(1) +
        "%が実現した場合の試算であり、元本割れの可能性がある点に注意してください。";
      els.verdictBox.classList.add("accent");
    } else {
      els.verdictTitle.textContent = "この条件では「繰り上げ返済」が有利な試算です";
      els.verdictBody.innerHTML =
        "繰り上げ返済による利息軽減額は" + manYen(interestSaved) + "、積立投資の運用益（想定" + investRate.toFixed(1) +
        "%）は" + manYen(investProfit) + "で、差は" + manYen(-diff) +
        "です。繰り上げ返済は住宅ローン金利分の負担軽減が確定する一方、完済までの流動性（手元資金）は減る点も考慮しましょう。";
    }

    var normalYearly = yearlySeries(normal.balances);
    var labels = normalYearly.map(function (d) { return d.year + "年"; });

    var data = {
      labels: labels,
      datasets: [
        {
          label: "ローン残高（通常返済）",
          data: normalYearly.map(function (d) { return Math.round(d.balance); }),
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
          fill: true,
          tension: 0.2,
          pointRadius: 0,
        },
        {
          label: "ローン残高（繰り上げ返済あり）",
          data: normalYearly.map(function (d) {
            var monthIdx = Math.min(d.year * 12, prepay.months);
            return Math.round(prepay.balances[monthIdx] || 0);
          }),
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
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
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：" + yen(ctx.parsed.y);
            },
          },
        },
      },
    };

    var ctx = document.getElementById("roan-loanChart").getContext("2d");
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("roan-loanDataTable", chart);
  }

  [els.balance, els.loanRate, els.years, els.extra, els.investRate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

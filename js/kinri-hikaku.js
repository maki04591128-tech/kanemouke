(function () {
  "use strict";

  var SCENARIOS = {
    flat: { label: "上昇なし（横ばい）", stepPct: 0 },
    gentle: { label: "緩やかに上昇（5年ごとに+0.25%）", stepPct: 0.25 },
    steep: { label: "急上昇（5年ごとに+0.5%）", stepPct: 0.5 },
  };

  var els = {
    principal: document.getElementById("kinri-principal"),
    loanYears: document.getElementById("kinri-loanYears"),
    fixedRate: document.getElementById("kinri-fixedRate"),
    variableRate: document.getElementById("kinri-variableRate"),
    scenario: document.getElementById("kinri-scenario"),
    applyRule: document.getElementById("kinri-applyRule"),
    verdict: document.getElementById("kinri-verdict"),
    verdictSub: document.getElementById("kinri-verdictSub"),
    resultFixedTotal: document.getElementById("kinri-result-fixed-total"),
    resultVariableTotal: document.getElementById("kinri-result-variable-total"),
    resultDiff: document.getElementById("kinri-result-diff"),
    resultUnpaid: document.getElementById("kinri-result-unpaid"),
    tableBody: document.getElementById("kinri-review-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function monthlyPayment(balance, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (months <= 0) return balance;
    if (i === 0) return balance / months;
    return (balance * i) / (1 - Math.pow(1 + i, -months));
  }

  // 全期間固定金利：金利・毎月返済額とも一定
  function simulateFixed(principal, ratePct, months) {
    var payment = monthlyPayment(principal, ratePct, months);
    var i = ratePct / 100 / 12;
    var balance = principal;
    var balances = [principal];
    var totalPaid = 0;
    var totalInterest = 0;
    for (var m = 1; m <= months; m++) {
      var interest = balance * i;
      var due = Math.min(payment, balance + interest);
      var principalPaid = due - interest;
      balance = Math.max(0, balance - principalPaid);
      totalPaid += due;
      totalInterest += interest;
      balances.push(balance);
    }
    return { balances: balances, payment: payment, totalPaid: totalPaid, totalInterest: totalInterest };
  }

  // 変動金利：5年ごとに金利見直し。5年ルール・125%ルールを適用する場合、
  // 見直し後の毎月返済額は直前の返済額の125%を上限とし、
  // 上限超過分（利息が返済額を上回る分＝未払利息）は元金に上乗せする（未払利息）。
  function simulateVariable(principal, initialRatePct, months, scenario, applyRule) {
    var rate = initialRatePct;
    var balance = principal;
    var payment = monthlyPayment(balance, rate, months);
    var balances = [principal];
    var totalPaid = 0;
    var totalInterest = 0;
    var unpaidInterestTotal = 0;
    var reviewRows = [{ year: 0, rate: rate, payment: payment, balance: balance }];

    for (var m = 1; m <= months; m++) {
      if (m > 1 && (m - 1) % 60 === 0) {
        rate = rate + scenario.stepPct;
        var remainingMonths = months - m + 1;
        var idealPayment = monthlyPayment(balance, rate, remainingMonths);
        payment = applyRule ? Math.min(idealPayment, payment * 1.25) : idealPayment;
        reviewRows.push({ year: (m - 1) / 12, rate: rate, payment: payment, balance: balance });
      }

      var i = rate / 100 / 12;
      var interest = balance * i;

      if (payment < interest) {
        // 未払利息：返済額が利息分すら賄えず、不足分が元金に上乗せされる
        var shortfall = interest - payment;
        unpaidInterestTotal += shortfall;
        balance = balance + shortfall;
        totalPaid += payment;
        totalInterest += payment;
      } else {
        var principalPaid = Math.min(payment - interest, balance);
        balance = Math.max(0, balance - principalPaid);
        var paidThisMonth = principalPaid + interest;
        totalPaid += paidThisMonth;
        totalInterest += interest;
      }
      balances.push(balance);
    }

    return {
      balances: balances,
      totalPaid: totalPaid,
      totalInterest: totalInterest,
      unpaidInterestTotal: unpaidInterestTotal,
      lumpSumDue: balance,
      reviewRows: reviewRows,
    };
  }

  function render() {
    var principal = clampNonNegative(els.principal.value) * 10000;
    var loanYears = Math.max(1, Number(els.loanYears.value) || 1);
    var fixedRate = Number(els.fixedRate.value);
    var variableRate = Number(els.variableRate.value);
    var scenario = SCENARIOS[els.scenario.value] || SCENARIOS.flat;
    var applyRule = els.applyRule.value === "yes";
    var months = Math.round(loanYears * 12);

    var fixed = simulateFixed(principal, fixedRate, months);
    var variable = simulateVariable(principal, variableRate, months, scenario, applyRule);

    var variableGrandTotal = variable.totalPaid + variable.lumpSumDue;
    var diff = fixed.totalPaid - variableGrandTotal;

    els.resultFixedTotal.textContent = manYen(fixed.totalPaid);
    els.resultVariableTotal.textContent = manYen(variableGrandTotal);
    els.resultDiff.textContent = manYen(Math.abs(diff)) + (diff >= 0 ? "（変動が有利）" : "（固定が有利）");
    els.resultUnpaid.textContent = variable.unpaidInterestTotal > 0 ? manYen(variable.unpaidInterestTotal) : "発生なし";

    if (variable.lumpSumDue > 0) {
      els.verdict.textContent = "このシナリオでは返済期間内に完済できず、" + manYen(variable.lumpSumDue) + " が最終回に一括請求される見込みです";
      els.verdictSub.textContent = "5年ルール・125%ルールにより毎月の返済額の上昇が抑えられる一方、利息の増加分（未払利息）が元金に上乗せされ続けると、当初の返済期間では完済できない場合があります。";
    } else if (diff > 0) {
      els.verdict.textContent = "このシナリオでは変動金利の方が総返済額で " + manYen(diff) + " 有利です";
      els.verdictSub.textContent = "ただし将来の金利動向は誰にも予測できません。上昇シナリオを変えて、どこまで金利が上がると固定金利より不利になるかも確認してみましょう。";
    } else {
      els.verdict.textContent = "このシナリオでは固定金利の方が総返済額で " + manYen(-diff) + " 有利です";
      els.verdictSub.textContent = "金利上昇シナリオが厳しいほど、返済当初の金利が低い変動金利のメリットは小さくなっていきます。";
    }

    var rows = variable.reviewRows.map(function (r, idx) {
      var nextRow = variable.reviewRows[idx + 1];
      var label = idx === 0 ? "当初（1〜5年目）" : (r.year + 1) + "〜" + (nextRow ? nextRow.year : loanYears) + "年目";
      return (
        "<tr><td>" + label + "</td><td>" + r.rate.toFixed(2) + " %</td><td>" + yen(r.payment) +
        "</td><td>" + manYen(r.balance) + "</td></tr>"
      );
    });
    els.tableBody.innerHTML = rows.join("");

    var stepYears = 1;
    var labels = [];
    var fixedBalances = [];
    var variableBalances = [];
    for (var y = 0; y <= loanYears; y += stepYears) {
      var idx = Math.min(y * 12, months);
      labels.push(y + "年目");
      fixedBalances.push(Math.round(fixed.balances[idx]));
      variableBalances.push(Math.round(variable.balances[idx]));
    }

    var data = {
      labels: labels,
      datasets: [
        {
          label: "固定金利：残高",
          data: fixedBalances,
          borderColor: "#0f5f4c",
          backgroundColor: "#0f5f4c",
          fill: false,
          tension: 0.15,
        },
        {
          label: "変動金利：残高",
          data: variableBalances,
          borderColor: "#d98e04",
          backgroundColor: "#d98e04",
          fill: false,
          tension: 0.15,
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

    var ctx = document.getElementById("kinri-balanceChart").getContext("2d");
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
  }

  [els.principal, els.loanYears, els.fixedRate, els.variableRate, els.scenario, els.applyRule].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

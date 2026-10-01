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
    refinanceYear: document.getElementById("kinri-refinanceYear"),
    refinanceRate: document.getElementById("kinri-refinanceRate"),
    refinanceCost: document.getElementById("kinri-refinanceCost"),
    verdict: document.getElementById("kinri-verdict"),
    verdictSub: document.getElementById("kinri-verdictSub"),
    resultFixedTotal: document.getElementById("kinri-result-fixed-total"),
    resultVariableTotal: document.getElementById("kinri-result-variable-total"),
    resultDiff: document.getElementById("kinri-result-diff"),
    resultUnpaid: document.getElementById("kinri-result-unpaid"),
    tableBody: document.getElementById("kinri-review-body"),
    refinanceCard: document.getElementById("kinri-refinanceCard"),
    refinanceTotal: document.getElementById("kinri-result-refinance-total"),
    refinanceNote: document.getElementById("kinri-refinanceNote"),
    legendRefinance: document.getElementById("kinri-legend-refinance"),
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
  // stopMonthを指定すると、本来の返済期間（months）に基づく金利見直しスケジュールは
  // そのままに、stopMonth経過時点までの状態（残高・累計返済額等）だけを返す。これにより
  // 「返済途中で固定金利へ借り換える」シナリオの、借り換え直前までの状態を取得できる。
  function simulateVariable(principal, initialRatePct, months, scenario, applyRule, stopMonth) {
    var rate = initialRatePct;
    var balance = principal;
    var payment = monthlyPayment(balance, rate, months);
    var balances = [principal];
    var totalPaid = 0;
    var totalInterest = 0;
    var unpaidInterestTotal = 0;
    var reviewRows = [{ year: 0, rate: rate, payment: payment, balance: balance }];
    var limit = stopMonth ? Math.min(months, stopMonth) : months;

    for (var m = 1; m <= limit; m++) {
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

    // 5年ごとの返済額再計算を繰り返すと、浮動小数点演算の丸め誤差で
    // 本来ちょうど0円になるはずの完済時残高がごく僅かな正の値（1円未満）
    // として残ることがある。1円未満の残高は実質的に完済済みとみなし、
    // 「一括請求が発生した」という誤った表示を防ぐため0に補正する。
    if (balance > 0 && balance < 1) {
      balance = 0;
      balances[balances.length - 1] = 0;
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
    var refinanceYear = Math.min(Math.max(0, Math.round(Number(els.refinanceYear.value) || 0)), Math.max(0, loanYears - 1));
    var refinanceRate = Number(els.refinanceRate.value);
    var refinanceCost = clampNonNegative(els.refinanceCost.value) * 10000;

    var fixed = simulateFixed(principal, fixedRate, months);
    var variable = simulateVariable(principal, variableRate, months, scenario, applyRule);

    var variableGrandTotal = variable.totalPaid + variable.lumpSumDue;
    var diff = fixed.totalPaid - variableGrandTotal;

    var refinanceMonths = refinanceYear * 12;
    var refinanceBalances = null;
    var refinanceGrandTotal = 0;
    if (refinanceYear > 0) {
      var beforeRefinance = simulateVariable(principal, variableRate, months, scenario, applyRule, refinanceMonths);
      var afterRefinance = simulateFixed(beforeRefinance.lumpSumDue, refinanceRate, months - refinanceMonths);
      refinanceBalances = beforeRefinance.balances.concat(afterRefinance.balances.slice(1));
      refinanceGrandTotal = beforeRefinance.totalPaid + afterRefinance.totalPaid + refinanceCost;
    }

    els.resultFixedTotal.textContent = manYen(fixed.totalPaid);
    els.resultVariableTotal.textContent = manYen(variableGrandTotal);
    els.resultDiff.textContent = manYen(Math.abs(diff)) + (diff >= 0 ? "（変動が有利）" : "（固定が有利）");
    els.resultUnpaid.textContent = variable.unpaidInterestTotal > 0 ? manYen(variable.unpaidInterestTotal) : "発生なし";

    var verdictSubText;
    if (variable.lumpSumDue > 0) {
      els.verdict.textContent = "このシナリオでは返済期間内に完済できず、" + manYen(variable.lumpSumDue) + " が最終回に一括請求される見込みです";
      verdictSubText = "5年ルール・125%ルールにより毎月の返済額の上昇が抑えられる一方、利息の増加分（未払利息）が元金に上乗せされ続けると、当初の返済期間では完済できない場合があります。";
    } else if (diff > 0) {
      els.verdict.textContent = "このシナリオでは変動金利の方が総返済額で " + manYen(diff) + " 有利です";
      verdictSubText = "ただし将来の金利動向は誰にも予測できません。上昇シナリオを変えて、どこまで金利が上がると固定金利より不利になるかも確認してみましょう。";
    } else {
      els.verdict.textContent = "このシナリオでは固定金利の方が総返済額で " + manYen(-diff) + " 有利です";
      verdictSubText = "金利上昇シナリオが厳しいほど、返済当初の金利が低い変動金利のメリットは小さくなっていきます。";
    }

    if (refinanceYear > 0) {
      var diffVsVariable = variableGrandTotal - refinanceGrandTotal;
      var diffVsFixed = fixed.totalPaid - refinanceGrandTotal;
      els.refinanceCard.style.display = "";
      els.refinanceTotal.textContent = manYen(refinanceGrandTotal);
      els.refinanceNote.textContent =
        refinanceYear + "年目の年末に、変動金利から固定金利（年利" + refinanceRate.toFixed(2) + "%）へ借り換えると仮定した場合の総返済額は" +
        manYen(refinanceGrandTotal) + "（借り換え費用" + manYen(refinanceCost) + "込み）です。そのまま変動金利を続けた場合（" +
        manYen(variableGrandTotal) + "）との差は" + (diffVsVariable >= 0 ? "+" : "") + manYen(diffVsVariable) +
        "、当初から固定金利を選んだ場合（" + manYen(fixed.totalPaid) + "）との差は" + (diffVsFixed >= 0 ? "+" : "") + manYen(diffVsFixed) + "です（プラスは借り換えが有利）。";
      verdictSubText += "「借り換えを実行する年目」が入力されているため、" + refinanceYear + "年目に固定金利へ借り換えた場合の試算を下に表示しています。";
      if (els.legendRefinance) els.legendRefinance.style.display = "";
    } else {
      els.refinanceCard.style.display = "none";
      if (els.legendRefinance) els.legendRefinance.style.display = "none";
    }
    els.verdictSub.textContent = verdictSubText;

    var rows = variable.reviewRows.map(function (r, idx) {
      var nextRow = variable.reviewRows[idx + 1];
      var label = idx === 0 ? "当初（1〜" + Math.min(5, loanYears) + "年目）" : (r.year + 1) + "〜" + (nextRow ? nextRow.year : loanYears) + "年目";
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
    var refinanceBalancesTicks = refinanceBalances ? [] : null;
    for (var y = 0; y <= loanYears; y += stepYears) {
      var idx = Math.min(y * 12, months);
      labels.push(y + "年目");
      fixedBalances.push(Math.round(fixed.balances[idx]));
      variableBalances.push(Math.round(variable.balances[idx]));
      if (refinanceBalancesTicks) refinanceBalancesTicks.push(Math.round(refinanceBalances[idx]));
    }

    var datasets = [
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
    ];
    if (refinanceBalancesTicks) {
      datasets.push({
        label: "借り換えあり：残高",
        data: refinanceBalancesTicks,
        borderColor: "#5b3fa0",
        backgroundColor: "#5b3fa0",
        borderDash: [6, 4],
        fill: false,
        tension: 0.15,
      });
    }
    var data = { labels: labels, datasets: datasets };
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
    if (window.renderChartDataTable) window.renderChartDataTable("kinri-balanceDataTable", chart);
  }

  [
    els.principal,
    els.loanYears,
    els.fixedRate,
    els.variableRate,
    els.scenario,
    els.applyRule,
    els.refinanceYear,
    els.refinanceRate,
    els.refinanceCost,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

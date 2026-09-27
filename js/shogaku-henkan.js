(function () {
  "use strict";

  // 日本学生支援機構（JASSO）奨学金の「定額返還方式」による月々の返還額・
  // 総返還額の簡易シミュレーター。第一種奨学金（無利子）は貸与総額を
  // 返還回数で均等に割った金額（利息なし）、第二種奨学金（有利子）は
  // 住宅ローン等と同じ元利均等返済の計算式で試算する。
  //
  // 実際の返還期間（返還回数）はJASSOが貸与総額に応じた区分表から
  // 自動的に決定するが、区分の境界値は本サイトで一次情報を確認できて
  // いないため、本ツールでは返還期間を利用者自身の入力とし、貸与奨学生
  // 証書・返還誓約書に記載の実際の回数を入力してもらう設計にしている
  // （住宅ローン控除シミュレーター等、既存ツールでも返済期間は利用者
  // 入力を前提としており、同じ方針）。所得連動返還方式（第一種のみ選択
  // 可能な、所得に応じて返還額が変動する制度）は対象外で、定額返還方式の
  // みを試算する。

  var els = {
    type1Total: document.getElementById("shogaku-type1Total"),
    type2Total: document.getElementById("shogaku-type2Total"),
    type2Rate: document.getElementById("shogaku-type2Rate"),
    years: document.getElementById("shogaku-years"),
    yearsOut: document.getElementById("shogaku-yearsOut"),
    income: document.getElementById("shogaku-income"),
    verdict: document.getElementById("shogaku-verdict"),
    verdictSub: document.getElementById("shogaku-verdictSub"),
    resultMonthly: document.getElementById("shogaku-result-monthly"),
    resultTotal: document.getElementById("shogaku-result-total"),
    resultInterest: document.getElementById("shogaku-result-interest"),
    body: document.getElementById("shogaku-breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  // 元利均等返済の月々の返済額（住宅ローン控除シミュレーター等と同じ計算式）。
  function monthlyPayment(principal, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (i === 0) return principal / months;
    return (principal * i) / (1 - Math.pow(1 + i, -months));
  }

  // 元利均等返済の残高推移（月次）。
  function amortizedBalances(principal, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    var payment = monthlyPayment(principal, annualRatePct, months);
    var balance = principal;
    var balances = [principal];
    for (var m = 1; m <= months; m++) {
      var interest = balance * i;
      var due = payment;
      if (due > balance + interest) due = balance + interest;
      balance = Math.max(0, balance + interest - due);
      balances.push(balance);
    }
    return { payment: payment, balances: balances };
  }

  // 第一種（無利子）は貸与総額を返還回数で均等に割るだけ（元金均等・利息なし）。
  function flatBalances(principal, months) {
    var payment = principal / months;
    var balances = [principal];
    var balance = principal;
    for (var m = 1; m <= months; m++) {
      balance = Math.max(0, balance - payment);
      balances.push(balance);
    }
    return { payment: payment, balances: balances };
  }

  function addRow(label, detail, amount) {
    var tr = document.createElement("tr");
    var th = document.createElement("th");
    th.textContent = label;
    var tdDetail = document.createElement("td");
    tdDetail.textContent = detail;
    var tdAmount = document.createElement("td");
    tdAmount.textContent = yen(amount);
    tr.appendChild(th);
    tr.appendChild(tdDetail);
    tr.appendChild(tdAmount);
    return tr;
  }

  function render() {
    var total1 = clampNonNegative(els.type1Total.value);
    var total2 = clampNonNegative(els.type2Total.value);
    var rate2 = Math.max(0, Number(els.type2Rate.value) || 0);
    var years = Math.max(1, Number(els.years.value) || 1);
    var incomeMan = clampNonNegative(els.income.value);
    var months = years * 12;

    els.yearsOut.textContent = years + " 年";

    var r1 = total1 > 0 ? flatBalances(total1, months) : { payment: 0, balances: null };
    var r2 = total2 > 0 ? amortizedBalances(total2, rate2, months) : { payment: 0, balances: null };

    var monthlyTotal = r1.payment + r2.payment;
    var repay1Total = total1; // 無利子なので返還総額＝貸与総額
    var repay2Total = r2.payment * months;
    var repayTotal = repay1Total + repay2Total;
    var interestTotal = Math.max(0, repay2Total - total2);
    var annualPayment = monthlyTotal * 12;
    var burdenRate = incomeMan > 0 ? (annualPayment / (incomeMan * 10000)) * 100 : null;

    els.resultMonthly.textContent = yen(monthlyTotal);
    els.resultTotal.textContent = yen(repayTotal);
    els.resultInterest.textContent = yen(interestTotal);

    if (total1 <= 0 && total2 <= 0) {
      els.verdict.textContent = "貸与総額を入力してください";
      els.verdictSub.textContent = "第一種・第二種、いずれか一方のみの利用でも構いません。";
    } else if (burdenRate !== null) {
      if (burdenRate <= 10) {
        els.verdict.textContent = "月々の返還額（目安） " + yen(monthlyTotal);
        els.verdictSub.textContent = "予想年収に対する年間返還額の割合は約" + burdenRate.toFixed(1) + "%です。一般的な目安（年収の1割程度）の範囲内です。";
      } else {
        els.verdict.textContent = "月々の返還額（目安） " + yen(monthlyTotal);
        els.verdictSub.textContent = "予想年収に対する年間返還額の割合は約" + burdenRate.toFixed(1) + "%で、一般的な目安（年収の1割程度）を超えています。返還期間の見直しや減額返還制度の利用を検討する余地があります。";
      }
    } else {
      els.verdict.textContent = "月々の返還額（目安） " + yen(monthlyTotal);
      els.verdictSub.textContent = "予想年収を入力すると、年収に対する返還負担の割合の目安も確認できます。";
    }

    var rows = [];
    if (total1 > 0) {
      rows.push(addRow("第一種奨学金（無利子）", "月々" + yen(r1.payment) + "×" + months + "回", repay1Total));
    }
    if (total2 > 0) {
      rows.push(addRow("第二種奨学金（有利子・年利" + rate2 + "%）", "月々" + yen(r2.payment) + "×" + months + "回", repay2Total));
      rows.push(addRow("うち利息相当額", "第二種の貸与総額との差額", interestTotal));
    }
    rows.push(addRow("合計", months + "回（" + years + "年）で完済", repayTotal));
    els.body.replaceChildren.apply(els.body, rows);

    var labels = [];
    var data = [];
    for (var y = 0; y <= years; y++) {
      var m = y * 12;
      var b1 = r1.balances ? r1.balances[Math.min(m, r1.balances.length - 1)] : 0;
      var b2 = r2.balances ? r2.balances[Math.min(m, r2.balances.length - 1)] : 0;
      labels.push(y + "年目");
      data.push(Math.round(b1 + b2));
    }

    var ctx = document.getElementById("shogaku-balanceChart").getContext("2d");
    var chartData = {
      labels: labels,
      datasets: [
        {
          label: "返還残高（第一種＋第二種合計）",
          data: data,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.15,
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
            label: function (c) { return c.dataset.label + "：" + yen(c.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = chartData;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data: chartData, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("shogaku-balanceDataTable", chart);
  }

  [els.type1Total, els.type2Total, els.type2Rate, els.years, els.income].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

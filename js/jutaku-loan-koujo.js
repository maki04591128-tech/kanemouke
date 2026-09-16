(function () {
  "use strict";

  var CREDIT_RATE = 0.007;
  var INCOME_LIMIT_FOR_ELIGIBILITY = 20000000; // 合計所得金額2000万円要件
  var RESIDENT_TAX_CREDIT_RATE_CAP = 0.05;
  var RESIDENT_TAX_CREDIT_YEN_CAP = 97500;

  // 2024・2025年入居を前提とした現行制度の借入限度額（円）と控除期間
  var CATEGORY_TABLE = {
    "new-nintei": { label: "新築：認定住宅（長期優良住宅・低炭素住宅）", limitNormal: 45000000, limitKosodate: 50000000, period: 13, kosodateApplicable: true },
    "new-zeh": { label: "新築：ZEH水準省エネ住宅", limitNormal: 35000000, limitKosodate: 45000000, period: 13, kosodateApplicable: true },
    "new-shoene": { label: "新築：省エネ基準適合住宅", limitNormal: 30000000, limitKosodate: 40000000, period: 13, kosodateApplicable: true },
    "new-sonota": { label: "新築：その他の住宅（2023年末までに建築確認・経過措置）", limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
    "used-nintei": { label: "既存（中古）：認定住宅等・ZEH水準省エネ住宅・省エネ基準適合住宅", limitNormal: 30000000, limitKosodate: 30000000, period: 10, kosodateApplicable: false },
    "used-sonota": { label: "既存（中古）：その他の住宅", limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
  };

  // 所得税の速算表（令和2年分以降）
  var TAX_BRACKETS = [
    { limit: 1950000, rate: 0.05, deduct: 0 },
    { limit: 3300000, rate: 0.10, deduct: 97500 },
    { limit: 6950000, rate: 0.20, deduct: 427500 },
    { limit: 9000000, rate: 0.23, deduct: 636000 },
    { limit: 18000000, rate: 0.33, deduct: 1536000 },
    { limit: 40000000, rate: 0.40, deduct: 2796000 },
    { limit: Infinity, rate: 0.45, deduct: 4796000 },
  ];

  // 給与所得控除額（令和2年分以降の速算表）
  var SALARY_DEDUCTION_BRACKETS = [
    { limit: 1625000, calc: function () { return 550000; } },
    { limit: 1800000, calc: function (income) { return income * 0.4 - 100000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  var INCOME_BASIC_DEDUCTION = 480000;
  var INCOME_SPOUSE_DEDUCTION = 380000;
  var INCOME_DEPENDENT_DEDUCTION = 380000;
  var RESIDENT_TAX_RATE = 0.10;

  var els = {
    principal: document.getElementById("principal"),
    loanRate: document.getElementById("loanRate"),
    loanYears: document.getElementById("loanYears"),
    category: document.getElementById("category"),
    kosodateRow: document.getElementById("kosodateRow"),
    kosodate: document.getElementById("kosodate"),
    salaryIncome: document.getElementById("salaryIncome"),
    hasSpouse: document.getElementById("hasSpouse"),
    dependents: document.getElementById("dependents"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    resultLimit: document.getElementById("result-limit"),
    resultPeriod: document.getElementById("result-period"),
    resultFirstYear: document.getElementById("result-first-year"),
    resultTotal: document.getElementById("result-total"),
    resultIncomeTax: document.getElementById("result-income-tax"),
    tableBody: document.getElementById("breakdown-body"),
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

  function floorTo(n, unit) {
    return Math.floor(n / unit) * unit;
  }

  function salaryIncomeAfterDeduction(grossIncome) {
    for (var i = 0; i < SALARY_DEDUCTION_BRACKETS.length; i++) {
      var b = SALARY_DEDUCTION_BRACKETS[i];
      if (grossIncome <= b.limit) {
        var deduction = Math.max(550000, b.calc(grossIncome));
        return Math.max(0, grossIncome - deduction);
      }
    }
    return grossIncome;
  }

  function incomeTaxAmount(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) {
        return Math.max(0, taxable * TAX_BRACKETS[i].rate - TAX_BRACKETS[i].deduct);
      }
    }
    var last = TAX_BRACKETS[TAX_BRACKETS.length - 1];
    return Math.max(0, taxable * last.rate - last.deduct);
  }

  function monthlyPayment(principal, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (i === 0) return principal / months;
    return (principal * i) / (1 - Math.pow(1 + i, -months));
  }

  function simulateLoan(principal, annualRatePct, months) {
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
    return balances;
  }

  function render() {
    var principal = clampNonNegative(els.principal.value);
    var loanRate = Number(els.loanRate.value);
    var loanYears = Math.max(1, Number(els.loanYears.value) || 1);
    var categoryKey = els.category.value;
    var category = CATEGORY_TABLE[categoryKey];
    var kosodate = els.kosodate.value === "yes";
    var grossIncome = clampNonNegative(els.salaryIncome.value);
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.round(Number(els.dependents.value) || 0));

    els.kosodateRow.style.display = category.kosodateApplicable ? "" : "none";

    var limit = category.kosodateApplicable && kosodate ? category.limitKosodate : category.limitNormal;
    var creditPeriod = category.period;

    var salaryIncome = salaryIncomeAfterDeduction(grossIncome);
    var incomeDeductions =
      INCOME_BASIC_DEDUCTION + (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) + dependents * INCOME_DEPENDENT_DEDUCTION;
    var taxableForIncomeTax = Math.max(0, salaryIncome - incomeDeductions);
    var taxAmount = incomeTaxAmount(taxableForIncomeTax);
    var residentTaxCap = Math.min(taxableForIncomeTax * RESIDENT_TAX_CREDIT_RATE_CAP, RESIDENT_TAX_CREDIT_YEN_CAP);

    var overIncomeLimit = salaryIncome > INCOME_LIMIT_FOR_ELIGIBILITY;

    var loanMonths = Math.round(loanYears * 12);
    var balances = simulateLoan(principal, loanRate, loanMonths);

    var rows = [];
    var totalCredit = 0;
    var totalUnused = 0;
    var firstYearCredit = 0;

    for (var y = 1; y <= creditPeriod; y++) {
      var monthIdx = y * 12;
      var yearEndBalance = monthIdx <= loanMonths ? balances[monthIdx] : 0;
      var eligibleBalance = Math.min(floorTo(yearEndBalance, 1000), limit);
      var rawCredit = overIncomeLimit ? 0 : floorTo(eligibleBalance * CREDIT_RATE, 100);
      var incomeTaxUsed = Math.min(rawCredit, taxAmount);
      var residentTaxUsed = Math.min(rawCredit - incomeTaxUsed, residentTaxCap);
      var used = incomeTaxUsed + residentTaxUsed;
      var unused = rawCredit - used;

      totalCredit += used;
      totalUnused += unused;
      if (y === 1) firstYearCredit = used;

      rows.push({
        year: y,
        balance: yearEndBalance,
        eligibleBalance: eligibleBalance,
        rawCredit: rawCredit,
        incomeTaxUsed: incomeTaxUsed,
        residentTaxUsed: residentTaxUsed,
        unused: unused,
      });
    }

    els.resultLimit.textContent = manYen(limit);
    els.resultPeriod.textContent = creditPeriod + " 年";
    els.resultFirstYear.textContent = yen(firstYearCredit);
    els.resultTotal.textContent = manYen(totalCredit);
    els.resultIncomeTax.textContent = yen(taxAmount);

    if (overIncomeLimit) {
      els.verdict.textContent = "合計所得金額が2000万円を超えるため、この年は控除の対象外です";
      els.verdictSub.textContent = "住宅ローン控除には各年の合計所得金額が2,000万円以下という要件があります。年によって所得が変動する場合は、その年ごとに判定されます。";
    } else if (totalUnused > 0) {
      els.verdict.textContent = creditPeriod + "年間の控除額（実際に引ききれる分）は " + manYen(totalCredit) + " です";
      els.verdictSub.textContent =
        "年末残高から計算される控除枠のうち、合計 " + manYen(totalUnused) +
        " 分は所得税・住民税の負担額が足りず控除しきれない見込みです（原則、翌年への繰り越しはできません）。";
    } else {
      els.verdict.textContent = creditPeriod + "年間の控除額は合計 " + manYen(totalCredit) + " の見込みです";
      els.verdictSub.textContent = "この条件では、年末残高に基づく控除枠を所得税・住民税でちょうど（または余裕を持って）引ききれる見込みです。";
    }

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return (
          "<tr><td>" + r.year + "年目</td><td>" + yen(r.balance) + "</td><td>" + yen(r.rawCredit) +
          "</td><td>" + yen(r.incomeTaxUsed) + "</td><td>" + yen(r.residentTaxUsed) +
          "</td><td>" + (r.unused > 0 ? yen(r.unused) : "-") + "</td></tr>"
        );
      })
      .join("");

    var labels = rows.map(function (r) { return r.year + "年目"; });
    var data = {
      labels: labels,
      datasets: [
        {
          label: "所得税から控除",
          data: rows.map(function (r) { return Math.round(r.incomeTaxUsed); }),
          backgroundColor: "#0f5f4c",
          stack: "credit",
        },
        {
          label: "住民税から控除",
          data: rows.map(function (r) { return Math.round(r.residentTaxUsed); }),
          backgroundColor: "#4f9d84",
          stack: "credit",
        },
        {
          label: "控除しきれない額",
          data: rows.map(function (r) { return Math.round(r.unused); }),
          backgroundColor: "#d98e04",
          stack: "credit",
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: function (v) { return manYen(v); } } },
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

    var ctx = document.getElementById("creditChart").getContext("2d");
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "bar", data: data, options: options });
    }
  }

  [
    els.principal,
    els.loanRate,
    els.loanYears,
    els.category,
    els.kosodate,
    els.salaryIncome,
    els.hasSpouse,
    els.dependents,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

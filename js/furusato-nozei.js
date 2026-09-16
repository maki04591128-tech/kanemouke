(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var SELF_PAY_BASE = 2000;

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

  // 所得税用の控除額
  var INCOME_BASIC_DEDUCTION = 480000;
  var INCOME_SPOUSE_DEDUCTION = 380000;
  var INCOME_DEPENDENT_DEDUCTION = 380000;

  // 住民税用の控除額
  var RESIDENT_BASIC_DEDUCTION = 430000;
  var RESIDENT_SPOUSE_DEDUCTION = 330000;
  var RESIDENT_DEPENDENT_DEDUCTION = 330000;

  var els = {
    salaryIncome: document.getElementById("salaryIncome"),
    socialInsurance: document.getElementById("socialInsurance"),
    hasSpouse: document.getElementById("hasSpouse"),
    dependents: document.getElementById("dependents"),
    donationPlan: document.getElementById("donationPlan"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    limit: document.getElementById("result-limit"),
    salaryIncomeOut: document.getElementById("result-salary-income"),
    taxableIncome: document.getElementById("result-taxable-income"),
    taxRate: document.getElementById("result-tax-rate"),
    residentTax: document.getElementById("result-resident-tax"),
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

  // 給与所得（給与収入から給与所得控除を差し引いた額）
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

  // 所得税の限界税率（速算表の税率そのもの）
  function marginalIncomeTaxRate(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) return TAX_BRACKETS[i].rate;
    }
    return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
  }

  // ふるさと納税の控除上限額（総務省公表の近似計算式）
  // 限度額 = 住民税所得割額×20% ÷ (90% − 所得税率×102.1%) + 2,000円
  function donationLimit(residentTaxIncomeBased, marginalRate) {
    if (residentTaxIncomeBased <= 0) return 0;
    var specialDeductionCap = residentTaxIncomeBased * 0.2;
    var denominator = 0.9 - marginalRate * (1 + RECONSTRUCTION_TAX_RATE);
    return specialDeductionCap / denominator + SELF_PAY_BASE;
  }

  // 寄付額に対する自己負担額（上限内は2,000円、超過分は全額自己負担）
  function selfPay(donation, limit) {
    if (donation <= 0) return 0;
    if (donation <= limit) return SELF_PAY_BASE;
    return SELF_PAY_BASE + (donation - limit);
  }

  function render() {
    var grossIncome = clampNonNegative(els.salaryIncome.value);
    var socialInsurance = clampNonNegative(els.socialInsurance.value);
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.round(Number(els.dependents.value) || 0));
    var donationPlan = clampNonNegative(els.donationPlan.value);

    var salaryIncome = salaryIncomeAfterDeduction(grossIncome);

    var incomeDeductions =
      socialInsurance +
      INCOME_BASIC_DEDUCTION +
      (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) +
      dependents * INCOME_DEPENDENT_DEDUCTION;
    var taxableForIncomeTax = Math.max(0, salaryIncome - incomeDeductions);

    var residentDeductions =
      socialInsurance +
      RESIDENT_BASIC_DEDUCTION +
      (hasSpouse ? RESIDENT_SPOUSE_DEDUCTION : 0) +
      dependents * RESIDENT_DEPENDENT_DEDUCTION;
    var taxableForResidentTax = Math.max(0, salaryIncome - residentDeductions);

    var marginalRate = marginalIncomeTaxRate(taxableForIncomeTax);
    var residentIncomeLevy = taxableForResidentTax * RESIDENT_TAX_RATE;

    var limit = donationLimit(residentIncomeLevy, marginalRate);

    els.limit.textContent = manYen(limit);
    els.salaryIncomeOut.textContent = manYen(salaryIncome);
    els.taxableIncome.textContent = manYen(taxableForResidentTax);
    els.taxRate.textContent = (marginalRate * 100).toFixed(0) + " %";
    els.residentTax.textContent = manYen(residentIncomeLevy);

    if (limit <= SELF_PAY_BASE) {
      els.verdict.textContent = "この条件では控除上限額はごくわずかです";
      els.verdictSub.textContent = "課税所得や住民税所得割額が小さいため、ふるさと納税による控除メリットはほとんど見込めません。";
    } else if (donationPlan <= 0) {
      els.verdict.textContent = "寄付予定額を入力すると、自己負担額の目安がわかります";
      els.verdictSub.textContent = "控除上限額は " + manYen(limit) + " です。";
    } else if (donationPlan <= limit) {
      els.verdict.textContent =
        "寄付予定額 " + manYen(donationPlan) + " は上限内です。自己負担2,000円で寄付できます";
      els.verdictSub.textContent =
        "控除上限額 " + manYen(limit) + " まで、あと " + manYen(limit - donationPlan) + " 余裕があります。";
    } else {
      var over = donationPlan - limit;
      els.verdict.textContent =
        "寄付予定額 " + manYen(donationPlan) + " は上限を " + manYen(over) + " 超えています";
      els.verdictSub.textContent =
        "上限を超えた " + manYen(over) + " 分は控除の対象外となり、全額自己負担になります。";
    }

    var rows = [
      ["給与収入（額面）", yen(grossIncome)],
      ["給与所得", yen(salaryIncome)],
      ["社会保険料控除", yen(socialInsurance)],
      ["課税所得（所得税ベース）", yen(taxableForIncomeTax)],
      ["所得税率（速算表）", (marginalRate * 100).toFixed(0) + " %"],
      ["課税所得（住民税ベース）", yen(taxableForResidentTax)],
      ["住民税所得割額（概算）", yen(residentIncomeLevy)],
      ["ふるさと納税 控除上限額", yen(limit)],
      ["寄付予定額の自己負担（概算）", yen(selfPay(donationPlan, limit))],
    ];
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var maxX = Math.max(limit * 1.5, donationPlan * 1.2, 10000);
    var steps = 40;
    var curve = [];
    for (var i = 0; i <= steps; i++) {
      var x = Math.round((maxX * i) / steps);
      curve.push({ x: x, y: selfPay(x, limit) });
    }

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      datasets: [
        {
          label: "寄付額に対する自己負担額",
          data: curve,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0,
          pointRadius: 0,
          parsing: false,
        },
        {
          label: "あなたの寄付予定額",
          data: donationPlan > 0 ? [{ x: donationPlan, y: selfPay(donationPlan, limit) }] : [],
          borderColor: "#d98e04",
          backgroundColor: "#d98e04",
          showLine: false,
          pointRadius: 6,
          pointHoverRadius: 7,
          parsing: false,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "寄付額" },
          ticks: { callback: function (v) { return manYen(v); } },
        },
        y: {
          title: { display: true, text: "自己負担額" },
          ticks: { callback: function (v) { return manYen(v); } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：寄付 " + yen(ctx.parsed.x) + " → 自己負担 " + yen(ctx.parsed.y);
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

  [
    els.salaryIncome,
    els.socialInsurance,
    els.hasSpouse,
    els.dependents,
    els.donationPlan,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

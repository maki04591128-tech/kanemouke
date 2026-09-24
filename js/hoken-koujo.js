(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;

  var LIFE_INCOME_CATEGORY_CAP = 40000;
  var LIFE_INCOME_TOTAL_CAP = 120000;
  var LIFE_RESIDENT_CATEGORY_CAP = 28000;
  var LIFE_RESIDENT_TOTAL_CAP = 70000;
  var EARTHQUAKE_INCOME_CAP = 50000;
  var EARTHQUAKE_RESIDENT_CAP = 25000;

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

  // 給与所得控除額（2025年度税制改正後、最低保障額65万円）
  var SALARY_DEDUCTION_BRACKETS = [
    { limit: 1900000, calc: function () { return 650000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税用の控除額（基礎控除は2025年分以降の58万円。合計所得金額2,350万円以下の場合）
  var INCOME_BASIC_DEDUCTION = 580000;
  var INCOME_SPOUSE_DEDUCTION = 380000;
  var INCOME_DEPENDENT_DEDUCTION = 380000;

  var els = {
    salaryIncome: document.getElementById("hoken-salaryIncome"),
    socialInsurance: document.getElementById("hoken-socialInsurance"),
    hasSpouse: document.getElementById("hoken-hasSpouse"),
    dependents: document.getElementById("hoken-dependents"),
    generalLife: document.getElementById("hoken-generalLife"),
    medicalCare: document.getElementById("hoken-medicalCare"),
    personalPension: document.getElementById("hoken-personalPension"),
    earthquake: document.getElementById("hoken-earthquake"),
    verdict: document.getElementById("hoken-verdict"),
    verdictSub: document.getElementById("hoken-verdictSub"),
    lifeIncome: document.getElementById("hoken-result-life-income"),
    lifeResident: document.getElementById("hoken-result-life-resident"),
    eqIncome: document.getElementById("hoken-result-eq-income"),
    eqResident: document.getElementById("hoken-result-eq-resident"),
    taxRate: document.getElementById("hoken-result-tax-rate"),
    totalReduction: document.getElementById("hoken-result-total-reduction"),
    tableBody: document.getElementById("hoken-breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
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

  // 生命保険料控除（新制度、所得税）区分ごとの計算。上限40,000円。
  function newLifeDeductionIncome(premium) {
    if (premium <= 0) return 0;
    if (premium <= 20000) return premium;
    if (premium <= 40000) return premium / 2 + 10000;
    if (premium <= 80000) return premium / 4 + 20000;
    return LIFE_INCOME_CATEGORY_CAP;
  }

  // 生命保険料控除（新制度、住民税）区分ごとの計算。上限28,000円。
  function newLifeDeductionResident(premium) {
    if (premium <= 0) return 0;
    if (premium <= 12000) return premium;
    if (premium <= 32000) return premium / 2 + 6000;
    if (premium <= 56000) return premium / 4 + 14000;
    return LIFE_RESIDENT_CATEGORY_CAP;
  }

  function render() {
    var grossIncome = clampNonNegative(els.salaryIncome.value);
    var socialInsurance = clampNonNegative(els.socialInsurance.value);
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.round(Number(els.dependents.value) || 0));
    var generalLife = clampNonNegative(els.generalLife.value);
    var medicalCare = clampNonNegative(els.medicalCare.value);
    var personalPension = clampNonNegative(els.personalPension.value);
    var earthquake = clampNonNegative(els.earthquake.value);

    var salaryIncome = salaryIncomeAfterDeduction(grossIncome);

    var incomeDeductions =
      socialInsurance +
      INCOME_BASIC_DEDUCTION +
      (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) +
      dependents * INCOME_DEPENDENT_DEDUCTION;
    var taxableForIncomeTax = Math.max(0, salaryIncome - incomeDeductions);
    var marginalRate = marginalIncomeTaxRate(taxableForIncomeTax);

    var lifeIncomeRaw =
      newLifeDeductionIncome(generalLife) +
      newLifeDeductionIncome(medicalCare) +
      newLifeDeductionIncome(personalPension);
    var lifeIncome = Math.min(LIFE_INCOME_TOTAL_CAP, lifeIncomeRaw);

    var lifeResidentRaw =
      newLifeDeductionResident(generalLife) +
      newLifeDeductionResident(medicalCare) +
      newLifeDeductionResident(personalPension);
    var lifeResident = Math.min(LIFE_RESIDENT_TOTAL_CAP, lifeResidentRaw);

    var eqIncome = Math.min(EARTHQUAKE_INCOME_CAP, earthquake);
    var eqResident = Math.min(EARTHQUAKE_RESIDENT_CAP, earthquake * 0.5);

    var totalIncomeDeduction = lifeIncome + eqIncome;
    var totalResidentDeduction = lifeResident + eqResident;

    var incomeTaxRefund = totalIncomeDeduction * marginalRate;
    var residentTaxReduction = totalResidentDeduction * RESIDENT_TAX_RATE;
    var totalReduction = incomeTaxRefund + residentTaxReduction;

    els.lifeIncome.textContent = yen(lifeIncome);
    els.lifeResident.textContent = yen(lifeResident);
    els.eqIncome.textContent = yen(eqIncome);
    els.eqResident.textContent = yen(eqResident);
    els.taxRate.textContent = (marginalRate * 100).toFixed(0) + " %";
    els.totalReduction.textContent = yen(totalReduction);

    if (totalIncomeDeduction <= 0 && totalResidentDeduction <= 0) {
      els.verdict.textContent = "保険料の入力がないため控除額はありません";
      els.verdictSub.textContent = "生命保険料または地震保険料を入力すると、控除額と軽減される税額の目安が表示されます。";
    } else {
      els.verdict.textContent = "合計の軽減額（概算）は " + yen(totalReduction) + " です";
      els.verdictSub.textContent =
        "所得税の還付額 " + yen(incomeTaxRefund) + " ＋ 住民税の軽減額 " + yen(residentTaxReduction) + "。年末調整または確定申告で控除を受けられます。";
    }

    var rows = [
      ["給与収入（額面）", yen(grossIncome)],
      ["給与所得", yen(salaryIncome)],
      ["課税所得（所得税ベース）", yen(taxableForIncomeTax)],
      ["所得税率（速算表）", (marginalRate * 100).toFixed(0) + " %"],
      ["一般生命保険料の年間払込額", yen(generalLife)],
      ["介護医療保険料の年間払込額", yen(medicalCare)],
      ["個人年金保険料の年間払込額", yen(personalPension)],
      ["地震保険料の年間払込額", yen(earthquake)],
      ["生命保険料控除額（所得税・3区分合計）", yen(lifeIncome)],
      ["生命保険料控除額（住民税・3区分合計）", yen(lifeResident)],
      ["地震保険料控除額（所得税）", yen(eqIncome)],
      ["地震保険料控除額（住民税）", yen(eqResident)],
      ["所得税の還付額（概算）", yen(incomeTaxRefund)],
      ["住民税の軽減額（概算）", yen(residentTaxReduction)],
      ["合計の軽減額（概算）", yen(totalReduction)],
    ];
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var labels = ["一般生命保険料", "介護医療保険料", "個人年金保険料", "地震保険料"];
    var incomeValues = [
      newLifeDeductionIncome(generalLife),
      newLifeDeductionIncome(medicalCare),
      newLifeDeductionIncome(personalPension),
      eqIncome,
    ];
    var residentValues = [
      newLifeDeductionResident(generalLife),
      newLifeDeductionResident(medicalCare),
      newLifeDeductionResident(personalPension),
      eqResident,
    ];

    var ctx = document.getElementById("hoken-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "所得税の控除額",
          data: incomeValues,
          backgroundColor: "#0f5f4c",
        },
        {
          label: "住民税の控除額",
          data: residentValues,
          backgroundColor: "#d98e04",
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: "控除額（円）" },
          ticks: { callback: function (v) { return v.toLocaleString("ja-JP") + " 円"; } },
        },
      },
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：" + yen(ctx.parsed.y);
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
      chart = new Chart(ctx, { type: "bar", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("hoken-growthDataTable", chart);
  }

  [
    els.salaryIncome,
    els.socialInsurance,
    els.hasSpouse,
    els.dependents,
    els.generalLife,
    els.medicalCare,
    els.personalPension,
    els.earthquake,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

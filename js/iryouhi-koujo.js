(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var MEDICAL_DEDUCTION_CAP = 2000000;
  var MEDICAL_DEDUCTION_FLOOR = 100000;
  var SELF_MED_FLOOR = 12000;
  var SELF_MED_CAP = 88000;

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

  // 給与所得控除額（所得税用）。令和8年度税制改正により、令和8・9年分は最低保障額が74万円に時限的に
  // 引き上げられている（令和10年分以後は本則69万円に戻る予定）。
  var SALARY_DEDUCTION_BRACKETS = [
    { limit: 2200000, calc: function () { return 740000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税の基礎控除額。令和8年度税制改正により、令和8・9年分は合計所得金額（給与収入のみの場合の
  // 収入金額）に応じて段階的に引き上げられている。
  function incomeBasicDeduction(grossIncome) {
    if (grossIncome <= 2060000) return 1040000;
    if (grossIncome <= 6655556) return 620000;
    if (grossIncome <= 8500000) return 670000;
    return 620000; // 合計所得金額2,350万円超（収入2,545万円超）の逓減は簡易化のため未対応
  }
  var INCOME_SPOUSE_DEDUCTION = 380000;
  var INCOME_DEPENDENT_DEDUCTION = 380000;

  var els = {
    salaryIncome: document.getElementById("iryouhi-salaryIncome"),
    socialInsurance: document.getElementById("iryouhi-socialInsurance"),
    hasSpouse: document.getElementById("iryouhi-hasSpouse"),
    dependents: document.getElementById("iryouhi-dependents"),
    medicalTotal: document.getElementById("iryouhi-medicalTotal"),
    insuranceReimbursement: document.getElementById("iryouhi-insuranceReimbursement"),
    otcAmount: document.getElementById("iryouhi-otcAmount"),
    verdict: document.getElementById("iryouhi-verdict"),
    verdictSub: document.getElementById("iryouhi-verdictSub"),
    deduction: document.getElementById("iryouhi-result-deduction"),
    selfmed: document.getElementById("iryouhi-result-selfmed"),
    taxRate: document.getElementById("iryouhi-result-tax-rate"),
    incomeTaxRefund: document.getElementById("iryouhi-result-income-tax-refund"),
    residentTaxReduction: document.getElementById("iryouhi-result-resident-tax-reduction"),
    totalReduction: document.getElementById("iryouhi-result-total-reduction"),
    tableBody: document.getElementById("iryouhi-breakdown-body"),
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

  // 医療費控除額（通常制度）
  // 控除額 = 医療費合計 − 保険金等の補填額 − 10万円（総所得金額等の5%が10万円未満ならその5%）− 上限200万円
  function medicalDeduction(medicalTotal, reimbursement, totalIncome) {
    var netMedical = Math.max(0, medicalTotal - reimbursement);
    var floor = Math.min(MEDICAL_DEDUCTION_FLOOR, totalIncome * 0.05);
    return Math.max(0, Math.min(MEDICAL_DEDUCTION_CAP, netMedical - floor));
  }

  // セルフメディケーション税制の控除額（OTC購入額 − 12,000円、上限88,000円）
  function selfMedicationDeduction(otcAmount) {
    return Math.max(0, Math.min(SELF_MED_CAP, otcAmount - SELF_MED_FLOOR));
  }

  function render() {
    var grossIncome = clampNonNegative(els.salaryIncome.value);
    var socialInsurance = clampNonNegative(els.socialInsurance.value);
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.round(Number(els.dependents.value) || 0));
    var medicalTotal = clampNonNegative(els.medicalTotal.value);
    var reimbursement = clampNonNegative(els.insuranceReimbursement.value);
    var otcAmount = clampNonNegative(els.otcAmount.value);

    var salaryIncome = salaryIncomeAfterDeduction(grossIncome);

    var incomeDeductions =
      socialInsurance +
      incomeBasicDeduction(grossIncome) +
      (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) +
      dependents * INCOME_DEPENDENT_DEDUCTION;
    var taxableForIncomeTax = Math.max(0, salaryIncome - incomeDeductions);
    var marginalRate = marginalIncomeTaxRate(taxableForIncomeTax);

    var deduction = medicalDeduction(medicalTotal, reimbursement, salaryIncome);
    var selfMed = selfMedicationDeduction(otcAmount);

    var useSelfMed = selfMed > deduction && selfMed > 0;
    var appliedDeduction = useSelfMed ? selfMed : deduction;

    var incomeTaxRefund = appliedDeduction * marginalRate;
    var residentTaxReduction = appliedDeduction * RESIDENT_TAX_RATE;
    var totalReduction = incomeTaxRefund + residentTaxReduction;

    els.deduction.textContent = yen(deduction);
    els.selfmed.textContent = otcAmount > 0 ? yen(selfMed) : "未入力";
    els.taxRate.textContent = (marginalRate * 100).toFixed(0) + " %";
    els.incomeTaxRefund.textContent = yen(incomeTaxRefund);
    els.residentTaxReduction.textContent = yen(residentTaxReduction);
    els.totalReduction.textContent = yen(totalReduction);

    if (deduction <= 0 && selfMed <= 0) {
      els.verdict.textContent = "この条件では控除の対象になりません";
      els.verdictSub.textContent =
        "医療費合計が保険金補填額と足切り額（10万円目安）を超えていないため、控除額は発生しません。";
    } else if (useSelfMed) {
      els.verdict.textContent =
        "セルフメディケーション税制の方が有利です（控除額 " + yen(selfMed) + "）";
      els.verdictSub.textContent =
        "通常の医療費控除（" + yen(deduction) + "）より有利ですが、どちらか一方しか選択できません。合計の軽減額（概算）は " + yen(totalReduction) + " です。";
    } else {
      els.verdict.textContent =
        "通常の医療費控除の方が有利です（控除額 " + yen(deduction) + "）";
      els.verdictSub.textContent =
        otcAmount > 0
          ? "セルフメディケーション税制（" + yen(selfMed) + "）より有利です。合計の軽減額（概算）は " + yen(totalReduction) + " です。"
          : "確定申告（還付申告）により、合計の軽減額（概算）は " + yen(totalReduction) + " です。";
    }

    var rows = [
      ["給与収入（額面）", yen(grossIncome)],
      ["給与所得", yen(salaryIncome)],
      ["課税所得（所得税ベース）", yen(taxableForIncomeTax)],
      ["所得税率（速算表）", (marginalRate * 100).toFixed(0) + " %"],
      ["医療費合計額", yen(medicalTotal)],
      ["保険金などの補填額", yen(reimbursement)],
      ["医療費控除額（通常制度）", yen(deduction)],
      ["セルフメディケーション税制の控除額", yen(selfMed)],
      ["適用する控除額（有利な方）", yen(appliedDeduction)],
      ["所得税の還付額（概算）", yen(incomeTaxRefund)],
      ["住民税の軽減額（概算）", yen(residentTaxReduction)],
      ["合計の軽減額（概算）", yen(totalReduction)],
    ];
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var maxX = Math.max(medicalTotal * 1.6, reimbursement + MEDICAL_DEDUCTION_FLOOR * 3, 300000);
    var steps = 40;
    var curve = [];
    for (var i = 0; i <= steps; i++) {
      var x = Math.round((maxX * i) / steps);
      curve.push({ x: x, y: medicalDeduction(x, reimbursement, salaryIncome) });
    }

    var ctx = document.getElementById("iryouhi-growthChart").getContext("2d");
    var data = {
      datasets: [
        {
          label: "医療費合計に対する控除額（通常制度）",
          data: curve,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0,
          pointRadius: 0,
          parsing: false,
        },
        {
          label: "あなたの医療費合計額",
          data: medicalTotal > 0 ? [{ x: medicalTotal, y: deduction }] : [],
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
          title: { display: true, text: "医療費合計額" },
          ticks: { callback: function (v) { return manYen(v); } },
        },
        y: {
          title: { display: true, text: "医療費控除額" },
          ticks: { callback: function (v) { return manYen(v); } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：医療費 " + yen(ctx.parsed.x) + " → 控除額 " + yen(ctx.parsed.y);
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
    if (window.renderChartDataTable) window.renderChartDataTable("iryouhi-growthDataTable", chart);
  }

  [
    els.salaryIncome,
    els.socialInsurance,
    els.hasSpouse,
    els.dependents,
    els.medicalTotal,
    els.insuranceReimbursement,
    els.otcAmount,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

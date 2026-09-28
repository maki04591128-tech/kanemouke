(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var WITHHOLDING_RATE = 0.20315; // 上場株式等の配当の源泉徴収税率（所得税15.315%＋住民税5%）

  var DIVIDEND_CREDIT_THRESHOLD = 10000000; // 配当控除の税率が下がる課税所得のライン
  var DIVIDEND_CREDIT_INCOME_TAX_LOW = 0.10;
  var DIVIDEND_CREDIT_INCOME_TAX_HIGH = 0.05;
  var DIVIDEND_CREDIT_RESIDENT_TAX_LOW = 0.028;
  var DIVIDEND_CREDIT_RESIDENT_TAX_HIGH = 0.014;

  // 社会保険料率（本人負担分の目安。協会けんぽ全国平均・2025年度水準を想定した概算）
  var HEALTH_INSURANCE_RATE = 0.0499;
  var CARE_INSURANCE_RATE = 0.0080;
  var PENSION_RATE = 0.0915;
  var EMPLOYMENT_INSURANCE_RATE = 0.006;

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
  var SALARY_DEDUCTION_BRACKETS_INCOME_TAX = [
    { limit: 2200000, calc: function () { return 740000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 給与所得控除額（住民税用）。最低保障額の引き上げ（74万円）は所得税のみが対象で、
  // 個人住民税の最低保障額は令和8年度分もこれまでと同じ65万円。
  var SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX = [
    { limit: 1900000, calc: function () { return 650000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税の基礎控除額。令和8年度税制改正により、令和8・9年分は合計所得金額（給与所得＋配当所得等）に
  // 応じて段階的に引き上げられている（国税庁タックスアンサーNo.1199）。配当を総合課税で合算すると
  // 合計所得金額が変わり基礎控除の段階も変わるため、給与所得のみの場合／配当を合算した場合をそれぞれ
  // この関数で算出し直す。住民税の基礎控除（43万円）は今回の改正の対象外で変更なし。
  function incomeBasicDeduction(totalIncome) {
    if (totalIncome <= 4890000) return 1040000;
    if (totalIncome <= 6550000) return 670000;
    if (totalIncome <= 23500000) return 620000;
    if (totalIncome <= 24000000) return 480000;
    if (totalIncome <= 24500000) return 320000;
    if (totalIncome <= 25000000) return 160000;
    return 0;
  }
  var RESIDENT_BASIC_DEDUCTION = 430000; // 住民税の基礎控除
  var INCOME_SPOUSE_DEDUCTION = 380000;
  var RESIDENT_SPOUSE_DEDUCTION = 330000;
  var INCOME_DEPENDENT_DEDUCTION = 380000;
  var RESIDENT_DEPENDENT_DEDUCTION = 330000;

  var els = {
    income: document.getElementById("kazei-income"),
    ageGroup: document.getElementById("kazei-ageGroup"),
    hasSpouse: document.getElementById("kazei-hasSpouse"),
    dependents: document.getElementById("kazei-dependents"),
    dividend: document.getElementById("kazei-dividend"),
    verdict: document.getElementById("kazei-verdict"),
    verdictSub: document.getElementById("kazei-verdictSub"),
    netWithholding: document.getElementById("kazei-result-net-withholding"),
    netComprehensive: document.getElementById("kazei-result-net-comprehensive"),
    diff: document.getElementById("kazei-result-diff"),
    effectiveRate: document.getElementById("kazei-result-effective-rate"),
    compareBody: document.getElementById("kazei-compare-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function salaryDeduction(income, brackets) {
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (income <= b.limit) return b.calc(income);
    }
    return 1950000;
  }

  function taxByBracket(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      var b = TAX_BRACKETS[i];
      if (taxable <= b.limit) return Math.max(0, taxable * b.rate - b.deduct);
    }
    return 0;
  }

  // 課税所得（給与のみ）を基準に、配当所得を上乗せしたことで増える所得税・住民税を、
  // 配当控除（課税所得1,000万円を境に控除率が下がる部分）を考慮して試算する。
  function calc(income, ageGroup, hasSpouse, dependents, dividendIncome) {
    var socialInsuranceRate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    if (ageGroup === "40to64") socialInsuranceRate += CARE_INSURANCE_RATE;
    var socialInsurance = income * socialInsuranceRate;

    var salaryIncome = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var salaryIncomeForResident = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX));

    var spouseDependentIncome = (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) + INCOME_DEPENDENT_DEDUCTION * dependents;
    var incomeDeductions = incomeBasicDeduction(salaryIncome) + socialInsurance + spouseDependentIncome;
    var taxableBase = Math.max(0, salaryIncome - incomeDeductions);

    var residentDeductions = RESIDENT_BASIC_DEDUCTION + socialInsurance;
    if (hasSpouse) residentDeductions += RESIDENT_SPOUSE_DEDUCTION;
    residentDeductions += RESIDENT_DEPENDENT_DEDUCTION * dependents;
    var taxableResidentBase = Math.max(0, salaryIncomeForResident - residentDeductions);

    var incomeTaxBase = taxByBracket(taxableBase) * (1 + RECONSTRUCTION_TAX_RATE);
    var residentTaxBase = taxableResidentBase * RESIDENT_TAX_RATE;

    // 方式1: 確定申告不要制度（源泉徴収のみで課税関係が完結）
    var withholdingTax = dividendIncome * WITHHOLDING_RATE;
    var netWithholding = dividendIncome - withholdingTax;

    // 方式2: 申告分離課税（配当控除の対象外のため、税率は源泉徴収と同じ20.315%）
    var netSeparate = netWithholding;
    var separateTax = withholdingTax;

    // 方式3: 総合課税（他の所得と合算し累進税率＋配当控除を適用。増分のみを配当への税負担とみなす）
    // 配当所得を合算すると合計所得金額が変わり、所得税の基礎控除の段階（令和8・9年分）も変わりうるため
    // 基礎控除はここで合算後の金額から算出し直す（住民税の基礎控除43万円は段階制の対象外）。
    var incomeDeductionsWithDividend = incomeBasicDeduction(salaryIncome + dividendIncome) + socialInsurance + spouseDependentIncome;
    var taxableWithDividend = Math.max(0, salaryIncome + dividendIncome - incomeDeductionsWithDividend);
    var amountAbove10M = Math.max(0, taxableWithDividend - DIVIDEND_CREDIT_THRESHOLD);
    var dividendAbove10M = Math.min(dividendIncome, amountAbove10M);
    var dividendBelow10M = dividendIncome - dividendAbove10M;

    var incomeTaxCredit = dividendBelow10M * DIVIDEND_CREDIT_INCOME_TAX_LOW + dividendAbove10M * DIVIDEND_CREDIT_INCOME_TAX_HIGH;
    var incomeTaxGross = taxByBracket(taxableWithDividend);
    var incomeTaxWithDividend = Math.max(0, incomeTaxGross - incomeTaxCredit) * (1 + RECONSTRUCTION_TAX_RATE);
    var incomeTaxMarginal = Math.max(0, incomeTaxWithDividend - incomeTaxBase);

    var residentTaxCredit = dividendBelow10M * DIVIDEND_CREDIT_RESIDENT_TAX_LOW + dividendAbove10M * DIVIDEND_CREDIT_RESIDENT_TAX_HIGH;
    var residentTaxWithDividend = Math.max(0, (taxableResidentBase + dividendIncome) * RESIDENT_TAX_RATE - residentTaxCredit);
    var residentTaxMarginal = Math.max(0, residentTaxWithDividend - residentTaxBase);

    var comprehensiveTax = incomeTaxMarginal + residentTaxMarginal;
    var netComprehensive = dividendIncome - comprehensiveTax;

    return {
      netWithholding: netWithholding,
      withholdingTax: withholdingTax,
      netSeparate: netSeparate,
      separateTax: separateTax,
      netComprehensive: netComprehensive,
      comprehensiveTax: comprehensiveTax,
      marginalIncomeTaxRate: TAX_BRACKETS.filter(function (b) { return taxableWithDividend <= b.limit; })[0].rate,
    };
  }

  function render() {
    var income = clampNonNegative(els.income.value) * 10000;
    var ageGroup = els.ageGroup.value;
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.min(5, Math.round(Number(els.dependents.value) || 0)));
    var dividendIncome = clampNonNegative(els.dividend.value) * 10000;

    var r = calc(income, ageGroup, hasSpouse, dependents, dividendIncome);
    var diff = r.netComprehensive - r.netWithholding;
    var effectiveRate = dividendIncome > 0 ? (r.comprehensiveTax / dividendIncome) * 100 : 0;

    els.netWithholding.textContent = yen(r.netWithholding);
    els.netComprehensive.textContent = yen(r.netComprehensive);
    els.diff.textContent = (diff >= 0 ? "+" : "") + yen(diff);
    els.effectiveRate.textContent = effectiveRate.toFixed(1) + " %";

    if (dividendIncome <= 0) {
      els.verdict.textContent = "配当金額を入力すると、3つの課税方式を比較できます";
      els.verdictSub.textContent = "";
    } else if (diff > 0) {
      els.verdict.textContent = "この条件では「総合課税」を選んで確定申告した方が有利です";
      els.verdictSub.textContent =
        "確定申告不要制度（源泉徴収のみ）のままだと手取りは " + yen(r.netWithholding) + " ですが、総合課税を選んで配当控除を使うと手取りが " + yen(r.netComprehensive) + "（" + yen(diff) + " 増）になる計算です。ただし総合課税を選ぶと配当所得が合計所得金額に加算されるため、扶養控除の判定や国民健康保険料、配偶者控除の所得制限などに影響が出る場合があります。";
    } else {
      els.verdict.textContent = "この条件では「確定申告不要制度」のままが有利です";
      els.verdictSub.textContent =
        "総合課税を選ぶと配当所得が累進課税の対象になり、配当控除を差し引いても手取りは " + yen(r.netComprehensive) + "（源泉徴収のみの場合より " + yen(Math.abs(diff)) + " 少ない）計算になります。課税所得（給与所得＋配当所得）に対する所得税の限界税率がおおむね23%を超えてくると、総合課税は不利になりやすい傾向があります。";
    }

    var rows = [
      { label: "確定申告不要制度", tax: r.withholdingTax, net: r.netWithholding, note: "源泉徴収のみで完結。確定申告は不要。" },
      { label: "申告分離課税", tax: r.separateTax, net: r.netSeparate, note: "税率は源泉徴収と同じ20.315%。配当控除は使えないが、上場株式等の譲渡損失と損益通算できる。" },
      { label: "総合課税", tax: r.comprehensiveTax, net: r.netComprehensive, note: "累進税率＋配当控除を適用（実効税率 " + effectiveRate.toFixed(1) + "%）。所得税・住民税は同じ方式に統一される。" },
    ];
    els.compareBody.innerHTML = rows
      .map(function (row) {
        var isBest = Math.abs(row.net - Math.max(r.netWithholding, r.netComprehensive)) < 1;
        return (
          "<tr" + (isBest && dividendIncome > 0 ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + row.label + "</td>" +
          "<td>" + yen(row.tax) + "</td>" +
          "<td>" + yen(row.net) + "</td>" +
          "<td>" + row.note + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var ctx = document.getElementById("kazei-growthChart").getContext("2d");
    var data = {
      labels: ["確定申告不要", "申告分離課税", "総合課税"],
      datasets: [
        {
          label: "手取り配当額",
          data: [Math.round(r.netWithholding), Math.round(r.netSeparate), Math.round(r.netComprehensive)],
          backgroundColor: ["#7fa998", "#d98e04", "#0f5f4c"],
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { callback: function (v) { return yen(v); } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.label + "：" + yen(ctx.parsed.y); },
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
    if (window.renderChartDataTable) window.renderChartDataTable("kazei-growthDataTable", chart);
  }

  [els.income, els.ageGroup, els.hasSpouse, els.dependents, els.dividend].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

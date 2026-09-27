(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var WITHHOLDING_RATE = 0.20315; // 上場株式等の配当の源泉徴収税率（所得税15.315%＋住民税5%）
  var RESIDENT_CREDIT_RATIO = 0.30; // 住民税の外国税額控除限度額（所得税限度額の30% = 道府県民税12%+市町村民税18%相当）

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

  // 給与所得控除額（2025年度税制改正後、最低保障額65万円）
  var SALARY_DEDUCTION_BRACKETS = [
    { limit: 1900000, calc: function () { return 650000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  var INCOME_BASIC_DEDUCTION = 580000; // 所得税の基礎控除（2025年分以降）
  var RESIDENT_BASIC_DEDUCTION = 430000; // 住民税の基礎控除

  var els = {
    income: document.getElementById("gaikoku-income"),
    ageGroup: document.getElementById("gaikoku-ageGroup"),
    dividend: document.getElementById("gaikoku-dividend"),
    foreignRate: document.getElementById("gaikoku-foreignRate"),
    foreignRateOut: document.getElementById("gaikoku-foreignRateOut"),
    verdict: document.getElementById("gaikoku-verdict"),
    verdictSub: document.getElementById("gaikoku-verdictSub"),
    netNoFile: document.getElementById("gaikoku-result-net-nofile"),
    netFile: document.getElementById("gaikoku-result-net-file"),
    diff: document.getElementById("gaikoku-result-diff"),
    unusedCredit: document.getElementById("gaikoku-result-unused-credit"),
    breakdownBody: document.getElementById("gaikoku-breakdown-body"),
  };

  if (!els.income) return;

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function salaryDeduction(income) {
    for (var i = 0; i < SALARY_DEDUCTION_BRACKETS.length; i++) {
      var b = SALARY_DEDUCTION_BRACKETS[i];
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

  // 外国株の配当（外国税引前の額面）は日本国内では総合課税の配当所得として
  // 給与所得等に合算されるが、外国株のため配当控除は使えない。代わりに
  // 現地で源泉徴収された外国税額を、所得税額×（国外所得金額÷所得総額）を
  // 上限として所得税から控除（外国税額控除）でき、上限を超えた分はさらに
  // その30%を上限に住民税からも控除できる、という簡略化した実務の仕組みを試算する。
  function calc(income, ageGroup, dividendGross, foreignRate) {
    var socialInsuranceRate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    if (ageGroup === "40to64") socialInsuranceRate += CARE_INSURANCE_RATE;
    var socialInsurance = income * socialInsuranceRate;

    var salaryIncome = Math.max(0, income - salaryDeduction(income));

    var taxableBase = Math.max(0, salaryIncome - (INCOME_BASIC_DEDUCTION + socialInsurance));
    var taxableResidentBase = Math.max(0, salaryIncome - (RESIDENT_BASIC_DEDUCTION + socialInsurance));

    var taxableWithDividend = taxableBase + dividendGross;
    var taxableResidentWithDividend = taxableResidentBase + dividendGross;

    var incomeTaxBase = taxByBracket(taxableBase) * (1 + RECONSTRUCTION_TAX_RATE);
    var incomeTaxWithDividend = taxByBracket(taxableWithDividend) * (1 + RECONSTRUCTION_TAX_RATE);
    var residentTaxBase = taxableResidentBase * RESIDENT_TAX_RATE;
    var residentTaxWithDividend = taxableResidentWithDividend * RESIDENT_TAX_RATE;

    var foreignTax = dividendGross * foreignRate;

    // シナリオA: 確定申告しない場合（特定口座で外国税引後の配当額に対して
    // 国内で20.315%が自動的に源泉徴収され、課税関係が終了する）
    var netAfterForeign = dividendGross - foreignTax;
    var domesticWithholding = netAfterForeign * WITHHOLDING_RATE;
    var netNoFile = netAfterForeign - domesticWithholding;

    // シナリオB: 確定申告して総合課税を選び、外国税額控除を適用する場合
    var grossTotalIncome = salaryIncome + dividendGross;
    var limitIncomeTax = grossTotalIncome > 0 ? incomeTaxWithDividend * (dividendGross / grossTotalIncome) : 0;
    var creditedIncomeTax = Math.min(foreignTax, limitIncomeTax);
    var remainingForeignTax = Math.max(0, foreignTax - creditedIncomeTax);
    var limitResidentTax = limitIncomeTax * RESIDENT_CREDIT_RATIO;
    var creditedResidentTax = Math.min(remainingForeignTax, limitResidentTax);
    var unusedForeignTax = Math.max(0, remainingForeignTax - creditedResidentTax);

    var incomeTaxAfterCredit = Math.max(0, incomeTaxWithDividend - creditedIncomeTax);
    var residentTaxAfterCredit = Math.max(0, residentTaxWithDividend - creditedResidentTax);
    var japanTaxOnDividendAfterCredit =
      Math.max(0, incomeTaxAfterCredit - incomeTaxBase) + Math.max(0, residentTaxAfterCredit - residentTaxBase);

    var netFile = dividendGross - foreignTax - japanTaxOnDividendAfterCredit;

    return {
      foreignTax: foreignTax,
      domesticWithholding: domesticWithholding,
      netNoFile: netNoFile,
      japanTaxOnDividendAfterCredit: japanTaxOnDividendAfterCredit,
      creditedTotal: creditedIncomeTax + creditedResidentTax,
      unusedForeignTax: unusedForeignTax,
      netFile: netFile,
    };
  }

  function render() {
    var income = clampNonNegative(els.income.value) * 10000;
    var ageGroup = els.ageGroup.value;
    var dividendGross = clampNonNegative(els.dividend.value) * 10000;
    var foreignRate = clampNonNegative(els.foreignRate.value) / 100;
    els.foreignRateOut.textContent = Number(els.foreignRate.value).toFixed(1) + " %";

    var r = calc(income, ageGroup, dividendGross, foreignRate);
    var diff = r.netFile - r.netNoFile;

    els.netNoFile.textContent = yen(r.netNoFile);
    els.netFile.textContent = yen(r.netFile);
    els.diff.textContent = (diff >= 0 ? "+" : "") + yen(diff);
    els.unusedCredit.textContent = r.unusedForeignTax > 1 ? yen(r.unusedForeignTax) : "なし";

    if (dividendGross <= 0) {
      els.verdict.textContent = "外国株の年間配当額を入力すると、確定申告した方が得かどうかを比較できます";
      els.verdictSub.textContent = "";
    } else if (diff > 0) {
      els.verdict.textContent = "確定申告して「外国税額控除」を使った方が有利です";
      els.verdictSub.textContent =
        "確定申告しない場合の手取りは " + yen(r.netNoFile) + " ですが、総合課税を選んで外国税額控除を使うと手取りが " +
        yen(r.netFile) + "（" + yen(diff) + " 増）になる計算です。総合課税を選ぶと配当所得が合計所得金額に加算され、扶養控除の判定や国民健康保険料等に影響する場合がある点にご留意ください。";
    } else {
      els.verdict.textContent = "この条件では確定申告しない方が有利です";
      els.verdictSub.textContent =
        "総合課税を選ぶと配当所得が他の所得と合算されて累進税率がかかるため、外国税額控除を使っても手取りは " +
        yen(r.netFile) + "（確定申告しない場合より " + yen(Math.abs(diff)) + " 少ない）になる計算です。もともとの給与収入などが多く所得税の限界税率が高い方ほど、総合課税を選ぶこと自体が不利になりやすい傾向があります。";
    }

    var rows = [
      { label: "外国（現地）での源泉徴収税額", value: yen(r.foreignTax), note: "配当額面 × 現地源泉徴収税率" },
      { label: "確定申告しない場合の国内源泉徴収額", value: yen(r.domesticWithholding), note: "外国税引後の配当額に20.315%を自動で源泉徴収" },
      { label: "確定申告した場合の外国税額控除で軽減した税額", value: yen(r.creditedTotal), note: "所得税・住民税から控除（限度額あり）" },
      { label: "確定申告した場合の国内での税額（控除後）", value: yen(r.japanTaxOnDividendAfterCredit), note: "総合課税で配当を合算した分の所得税・住民税、控除後" },
      { label: "使いきれず翌年以降に繰り越せる外国税額（参考）", value: r.unusedForeignTax > 1 ? yen(r.unusedForeignTax) : "なし", note: "限度額を超えた分は3年間繰越可能（本ツールでは繰越後の計算は含めていません）" },
    ];
    els.breakdownBody.innerHTML = rows
      .map(function (row) {
        return "<tr><td>" + row.label + "</td><td>" + row.value + "</td><td>" + row.note + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("gaikoku-growthChart").getContext("2d");
    var data = {
      labels: ["確定申告しない場合", "確定申告して外国税額控除を使う場合"],
      datasets: [
        {
          label: "手取り配当額",
          data: [Math.round(r.netNoFile), Math.round(r.netFile)],
          backgroundColor: ["#7fa998", "#0f5f4c"],
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
    if (window.renderChartDataTable) window.renderChartDataTable("gaikoku-growthDataTable", chart);
  }

  [els.income, els.ageGroup, els.dividend, els.foreignRate].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

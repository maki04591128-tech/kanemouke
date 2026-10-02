(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var WITHHOLDING_RATE = 0.20315; // 上場株式等の配当の源泉徴収税率（所得税15.315%＋住民税5%）
  var WITHHOLDING_RATE_INCOME_TAX_PORTION = 0.15315; // 20.315%のうち所得税・復興特別所得税の部分（申告分離課税の税率も同じ）
  var WITHHOLDING_RATE_RESIDENT_TAX_PORTION = 0.05; // 20.315%のうち住民税の部分
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
    netFileSeparate: document.getElementById("gaikoku-result-net-file-separate"),
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

  // 外国株の配当（外国税引前の額面）は日本国内では総合課税の配当所得として
  // 給与所得等に合算されるが、外国株のため配当控除は使えない。代わりに
  // 現地で源泉徴収された外国税額を、所得税額×（国外所得金額÷所得総額）を
  // 上限として所得税から控除（外国税額控除）でき、上限を超えた分はさらに
  // その30%を上限に住民税からも控除できる、という簡略化した実務の仕組みを試算する。
  function calc(income, ageGroup, dividendGross, foreignRate) {
    var socialInsuranceRate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    if (ageGroup === "40to64") socialInsuranceRate += CARE_INSURANCE_RATE;
    var socialInsurance = income * socialInsuranceRate;

    var salaryIncome = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var salaryIncomeForResident = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX));

    var taxableBase = Math.max(0, salaryIncome - (incomeBasicDeduction(salaryIncome) + socialInsurance));
    var taxableResidentBase = Math.max(0, salaryIncomeForResident - (RESIDENT_BASIC_DEDUCTION + socialInsurance));

    // 配当所得を合算すると合計所得金額が変わり、所得税の基礎控除の段階（令和8・9年分）も変わりうるため
    // 基礎控除はここで合算後の金額から算出し直す（住民税の基礎控除43万円は段階制の対象外）。
    var taxableWithDividend = Math.max(
      0,
      salaryIncome + dividendGross - (incomeBasicDeduction(salaryIncome + dividendGross) + socialInsurance)
    );
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

    // シナリオC: 確定申告して申告分離課税を選び、外国税額控除を適用する場合。
    // 申告分離課税では配当所得は給与所得等と合算されず、常に一律20.315%
    // （所得税・復興特別所得税15.315%＋住民税5%）で課税される。外国税額控除の
    // 限度額は、総合課税のシナリオBと同じ「所得税額 ×（国外所得金額÷所得総額）」
    // の考え方を踏襲しつつ、所得税額には給与分の累進税額に分離課税分の
    // 一律税額を単純合算した金額を用いる（国税庁の実際の計算は所得の種類ごとの
    // 按分がより複雑だが、本ツールでは総合課税シナリオと同じ簡略化を適用する）。
    var dividendIncomeTaxSeparate = dividendGross * WITHHOLDING_RATE_INCOME_TAX_PORTION;
    var dividendResidentTaxSeparate = dividendGross * WITHHOLDING_RATE_RESIDENT_TAX_PORTION;
    var totalIncomeTaxSeparate = incomeTaxBase + dividendIncomeTaxSeparate;
    var limitIncomeTaxSeparate = grossTotalIncome > 0 ? totalIncomeTaxSeparate * (dividendGross / grossTotalIncome) : 0;
    var creditedIncomeTaxSeparate = Math.min(foreignTax, limitIncomeTaxSeparate);
    var remainingForeignTaxSeparate = Math.max(0, foreignTax - creditedIncomeTaxSeparate);
    var limitResidentTaxSeparate = limitIncomeTaxSeparate * RESIDENT_CREDIT_RATIO;
    var creditedResidentTaxSeparate = Math.min(remainingForeignTaxSeparate, limitResidentTaxSeparate);
    var unusedForeignTaxSeparate = Math.max(0, remainingForeignTaxSeparate - creditedResidentTaxSeparate);

    var japanTaxOnDividendSeparateAfterCredit =
      Math.max(0, dividendIncomeTaxSeparate - creditedIncomeTaxSeparate) +
      Math.max(0, dividendResidentTaxSeparate - creditedResidentTaxSeparate);

    var netFileSeparate = dividendGross - foreignTax - japanTaxOnDividendSeparateAfterCredit;

    return {
      foreignTax: foreignTax,
      domesticWithholding: domesticWithholding,
      netNoFile: netNoFile,
      japanTaxOnDividendAfterCredit: japanTaxOnDividendAfterCredit,
      creditedTotal: creditedIncomeTax + creditedResidentTax,
      unusedForeignTax: unusedForeignTax,
      netFile: netFile,
      japanTaxOnDividendSeparateAfterCredit: japanTaxOnDividendSeparateAfterCredit,
      creditedTotalSeparate: creditedIncomeTaxSeparate + creditedResidentTaxSeparate,
      unusedForeignTaxSeparate: unusedForeignTaxSeparate,
      netFileSeparate: netFileSeparate,
    };
  }

  function render() {
    var income = clampNonNegative(els.income.value) * 10000;
    var ageGroup = els.ageGroup.value;
    var dividendGross = clampNonNegative(els.dividend.value) * 10000;
    var foreignRate = clampNonNegative(els.foreignRate.value) / 100;
    els.foreignRateOut.textContent = Number(els.foreignRate.value).toFixed(1) + " %";

    var r = calc(income, ageGroup, dividendGross, foreignRate);

    var separateIsBetterFiling = r.netFileSeparate > r.netFile;
    var bestFileNet = separateIsBetterFiling ? r.netFileSeparate : r.netFile;
    var bestFileLabel = separateIsBetterFiling ? "申告分離課税" : "総合課税";
    var bestFileUnused = separateIsBetterFiling ? r.unusedForeignTaxSeparate : r.unusedForeignTax;
    var diff = bestFileNet - r.netNoFile;

    els.netNoFile.textContent = yen(r.netNoFile);
    els.netFile.textContent = yen(r.netFile);
    els.netFileSeparate.textContent = yen(r.netFileSeparate);
    els.diff.textContent = (diff >= 0 ? "+" : "") + yen(diff);
    els.unusedCredit.textContent = bestFileUnused > 1 ? yen(bestFileUnused) : "なし";

    els.netFile.parentElement.classList.toggle("accent", !separateIsBetterFiling);
    els.netFileSeparate.parentElement.classList.toggle("accent", separateIsBetterFiling);

    if (dividendGross <= 0) {
      els.verdict.textContent = "外国株の年間配当額を入力すると、確定申告した方が得かどうかを比較できます";
      els.verdictSub.textContent = "";
    } else if (diff > 0) {
      els.verdict.textContent = "確定申告して「" + bestFileLabel + "」で外国税額控除を使った方が有利です";
      els.verdictSub.textContent =
        "確定申告しない場合の手取りは " + yen(r.netNoFile) + " ですが、" + bestFileLabel + "を選んで外国税額控除を使うと手取りが " +
        yen(bestFileNet) + "（" + yen(diff) + " 増）になる計算です。総合課税を選ぶと配当所得が合計所得金額に加算され、扶養控除の判定や国民健康保険料等に影響する場合がある一方、申告分離課税は配当所得を他の所得と合算しないため、そうした影響を避けられます。";
    } else {
      els.verdict.textContent = "この条件では確定申告しない方が有利です";
      els.verdictSub.textContent =
        "確定申告して外国税額控除を使っても、最も有利な" + bestFileLabel + "で手取りは " +
        yen(bestFileNet) + "（確定申告しない場合より " + yen(Math.abs(diff)) + " 少ない）になる計算です。総合課税は配当所得が他の所得と合算されて累進税率がかかるため、もともとの給与収入が多く所得税の限界税率が高い方ほど不利になりやすく、申告分離課税（一律20.315%）でも外国税額控除の限度額を使いきれない場合は確定申告のメリットが出にくい傾向があります。";
    }

    var rows = [
      { label: "外国（現地）での源泉徴収税額", value: yen(r.foreignTax), note: "配当額面 × 現地源泉徴収税率" },
      { label: "確定申告しない場合の国内源泉徴収額", value: yen(r.domesticWithholding), note: "外国税引後の配当額に20.315%を自動で源泉徴収" },
      { label: "確定申告（総合課税）した場合の外国税額控除で軽減した税額", value: yen(r.creditedTotal), note: "所得税・住民税から控除（限度額あり）" },
      { label: "確定申告（総合課税）した場合の国内での税額（控除後）", value: yen(r.japanTaxOnDividendAfterCredit), note: "総合課税で配当を合算した分の所得税・住民税、控除後" },
      { label: "確定申告（申告分離課税）した場合の外国税額控除で軽減した税額", value: yen(r.creditedTotalSeparate), note: "所得税・住民税から控除（限度額あり）" },
      { label: "確定申告（申告分離課税）した場合の国内での税額（控除後）", value: yen(r.japanTaxOnDividendSeparateAfterCredit), note: "配当に一律20.315%課税した分の所得税・住民税、控除後" },
      { label: "使いきれず翌年以降に繰り越せる外国税額（有利な方法で申告した場合・参考）", value: bestFileUnused > 1 ? yen(bestFileUnused) : "なし", note: "限度額を超えた分は3年間繰越可能（本ツールでは繰越後の計算は含めていません）" },
    ];
    els.breakdownBody.innerHTML = rows
      .map(function (row) {
        return "<tr><td>" + row.label + "</td><td>" + row.value + "</td><td>" + row.note + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("gaikoku-growthChart").getContext("2d");
    var data = {
      labels: ["確定申告しない場合", "確定申告して総合課税+外国税額控除", "確定申告して申告分離課税+外国税額控除"],
      datasets: [
        {
          label: "手取り配当額",
          data: [Math.round(r.netNoFile), Math.round(r.netFile), Math.round(r.netFileSeparate)],
          backgroundColor: ["#7fa998", "#0f5f4c", "#3f7f9c"],
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

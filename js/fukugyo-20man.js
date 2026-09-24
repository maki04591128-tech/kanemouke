(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var THRESHOLD = 200000; // 20万円ルールの判定ライン（所得税のみ。住民税には適用されない）

  // 社会保険料率（本人負担分の目安。協会けんぽ全国平均・2025年度水準、40歳未満を想定した概算）
  var HEALTH_INSURANCE_RATE = 0.0499;
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
    salaryIncome: document.getElementById("fukugyo-salaryIncome"),
    sideIncome: document.getElementById("fukugyo-sideIncome"),
    sideExpense: document.getElementById("fukugyo-sideExpense"),
    verdict: document.getElementById("fukugyo-verdict"),
    verdictSub: document.getElementById("fukugyo-verdictSub"),
    noticeBox: document.getElementById("fukugyo-noticeBox"),
    sideProfit: document.getElementById("fukugyo-result-side-profit"),
    incomeTaxFiling: document.getElementById("fukugyo-result-income-tax-filing"),
    residentTaxFiling: document.getElementById("fukugyo-result-resident-tax-filing"),
    taxIfFiled: document.getElementById("fukugyo-result-tax-if-filed"),
    marginalRate: document.getElementById("fukugyo-result-marginal-rate"),
    compareBody: document.getElementById("fukugyo-compare-body"),
  };

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

  function marginalBracketRate(taxable) {
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) return TAX_BRACKETS[i].rate;
    }
    return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
  }

  // 給与年収から、副業所得（雑所得・事業所得を総合課税で合算した場合）を上乗せしたときに
  // 増える所得税額・住民税額を、既存ツールと共通の給与所得控除・所得税速算表ロジックで試算する。
  // 配偶者控除・扶養控除・年齢区分による社会保険料の違いは入力項目に含めず、簡易的な概算とする。
  function calc(salaryIncome, sideProfit) {
    var socialInsuranceRate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    var socialInsurance = salaryIncome * socialInsuranceRate;

    var salaryTaxableIncome = Math.max(0, salaryIncome - salaryDeduction(salaryIncome));

    var taxableBase = Math.max(0, salaryTaxableIncome - INCOME_BASIC_DEDUCTION - socialInsurance);
    var residentTaxableBase = Math.max(0, salaryTaxableIncome - RESIDENT_BASIC_DEDUCTION - socialInsurance);

    var incomeTaxBase = taxByBracket(taxableBase) * (1 + RECONSTRUCTION_TAX_RATE);
    var residentTaxBase = residentTaxableBase * RESIDENT_TAX_RATE;

    var taxableWithSide = taxableBase + sideProfit;
    var incomeTaxWithSide = taxByBracket(taxableWithSide) * (1 + RECONSTRUCTION_TAX_RATE);
    var incomeTaxMarginal = Math.max(0, incomeTaxWithSide - incomeTaxBase);

    var residentTaxableWithSide = residentTaxableBase + sideProfit;
    var residentTaxWithSide = residentTaxableWithSide * RESIDENT_TAX_RATE;
    var residentTaxMarginal = Math.max(0, residentTaxWithSide - residentTaxBase);

    return {
      salaryTaxableIncome: salaryTaxableIncome,
      taxableBase: taxableBase,
      incomeTaxMarginal: incomeTaxMarginal,
      residentTaxMarginal: residentTaxMarginal,
      marginalRate: marginalBracketRate(taxableWithSide),
    };
  }

  function render() {
    var salaryIncome = clampNonNegative(els.salaryIncome.value) * 10000;
    var sideIncome = clampNonNegative(els.sideIncome.value) * 10000;
    var sideExpense = clampNonNegative(els.sideExpense.value) * 10000;

    var rawProfit = sideIncome - sideExpense; // 赤字の場合は負の値もありうる
    var sideProfit = Math.max(0, rawProfit); // 税額試算・住民税判定に使う所得（赤字は0円として扱う簡易化）

    var needsIncomeTaxFiling = rawProfit > THRESHOLD;
    var needsResidentTaxFiling = rawProfit > 0;

    var r = calc(salaryIncome, sideProfit);
    var taxIfFiled = r.incomeTaxMarginal;

    els.sideProfit.textContent = yen(sideProfit) + (rawProfit < 0 ? "（赤字）" : "");
    els.incomeTaxFiling.textContent = needsIncomeTaxFiling ? "必要" : "不要";
    els.residentTaxFiling.textContent = needsResidentTaxFiling ? "必要" : "不要（所得なし）";
    els.taxIfFiled.textContent = yen(taxIfFiled);
    els.marginalRate.textContent = (r.marginalRate * 100).toFixed(0) + " %";

    if (sideIncome <= 0) {
      els.verdict.textContent = "副業の収入額を入力すると、確定申告の要否を判定します";
      els.verdictSub.textContent = "";
    } else if (!needsIncomeTaxFiling) {
      els.verdict.textContent = "この条件では所得税の確定申告は「不要」です（20万円ルール）";
      els.verdictSub.textContent =
        "副業所得（雑所得等）は " + yen(sideProfit) + " で、20万円以下のため、給与を1か所から受けて年末調整が済んでいるなど一般的な条件を満たしていれば、所得税の確定申告は不要です。ただし住民税の申告は別途必要になる場合があります（下記の注意点を参照）。";
    } else {
      els.verdict.textContent = "この条件では所得税の確定申告が「必要」です";
      els.verdictSub.textContent =
        "副業所得（雑所得等）は " + yen(sideProfit) + " で、20万円ルールの対象（20万円以下）を超えているため、所得税の確定申告が必要です。確定申告した場合の所得税額の目安は " + yen(taxIfFiled) + "（適用される限界税率の目安 " + (r.marginalRate * 100).toFixed(0) + "%）です。";
    }

    if (needsResidentTaxFiling) {
      els.noticeBox.style.display = "block";
      els.noticeBox.innerHTML =
        "<p><strong>住民税の申告をお忘れなく：</strong>20万円ルールは所得税のみの特例で、住民税には適用されません。所得税の確定申告が不要な場合でも、副業所得が" +
        (sideProfit > 0 ? "" : "20万円以下でも") +
        "発生している以上、お住まいの市区町村へ住民税の申告（住民税申告書の提出）が別途必要です。確定申告をした場合は、その内容が自動的に住民税にも反映されるため、住民税申告は別途行う必要はありません。";
    } else {
      els.noticeBox.style.display = "none";
      els.noticeBox.innerHTML = "";
    }

    var rows = [
      {
        label: "副業所得 20万円以下",
        income: "所得税の確定申告：不要（20万円ルール）",
        resident: "住民税の申告：必要（所得がある場合）",
        active: !needsIncomeTaxFiling && sideIncome > 0,
      },
      {
        label: "副業所得 20万円超",
        income: "所得税の確定申告：必要",
        resident: "住民税の申告：確定申告に含めて自動的に完了",
        active: needsIncomeTaxFiling,
      },
    ];
    els.compareBody.innerHTML = rows
      .map(function (row) {
        return (
          "<tr" + (row.active ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + row.label + "</td>" +
          "<td>" + row.income + "</td>" +
          "<td>" + row.resident + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var ctx = document.getElementById("fukugyo-growthChart").getContext("2d");
    var data = {
      labels: ["副業所得（雑所得等）", "必要経費"],
      datasets: [
        {
          data: [Math.round(sideProfit), Math.round(Math.min(sideExpense, sideIncome))],
          backgroundColor: ["#0f5f4c", "#d98e04"],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var value = ctx.parsed;
              var total = sideIncome > 0 ? sideIncome : 1;
              var pct = (value / total) * 100;
              return ctx.label + "：" + yen(value) + "（" + pct.toFixed(1) + "%）";
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
      chart = new Chart(ctx, { type: "doughnut", data: data, options: options });
    }
  }

  [els.salaryIncome, els.sideIncome, els.sideExpense].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

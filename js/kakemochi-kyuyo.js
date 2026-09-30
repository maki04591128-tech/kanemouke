(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var THRESHOLD = 200000; // 主たる給与以外の給与の収入金額の合計が20万円を超えると所得税の確定申告が必要

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

  // 給与所得控除額（所得税用）。令和8年度税制改正により、令和8・9年分は最低保障額が74万円に時限的に
  // 引き上げられている（令和10年分以後は本則69万円に戻る予定）。掛け持ちの場合もすべての勤務先の
  // 給与収入を合算した金額に対して1回だけ適用される点が本ツールの試算の核心。
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

  // 所得税の基礎控除額。令和8年度税制改正により、令和8・9年分は合計所得金額（給与収入のみの場合の
  // 収入金額）に応じて段階的に引き上げられている。住民税の基礎控除（43万円）は今回の改正の対象外で変更なし。
  function incomeBasicDeduction(grossIncome) {
    if (grossIncome <= 6655556) return 1040000;
    if (grossIncome <= 8500000) return 670000;
    return 620000; // 合計所得金額2,350万円超（収入2,545万円超）の逓減は簡易化のため未対応
  }
  var RESIDENT_BASIC_DEDUCTION = 430000; // 住民税の基礎控除

  var els = {
    mainIncome: document.getElementById("kakemochi-mainIncome"),
    subIncome: document.getElementById("kakemochi-subIncome"),
    verdict: document.getElementById("kakemochi-verdict"),
    verdictSub: document.getElementById("kakemochi-verdictSub"),
    noticeBox: document.getElementById("kakemochi-noticeBox"),
    subIncomeResult: document.getElementById("kakemochi-result-sub-income"),
    taxGap: document.getElementById("kakemochi-result-tax-gap"),
    incomeTaxFiling: document.getElementById("kakemochi-result-income-tax-filing"),
    residentTaxFiling: document.getElementById("kakemochi-result-resident-tax-filing"),
    combinedTax: document.getElementById("kakemochi-result-combined-tax"),
    marginalRate: document.getElementById("kakemochi-result-marginal-rate"),
    compareBody: document.getElementById("kakemochi-compare-body"),
  };
  if (!els.verdict) return;

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

  function marginalBracketRate(taxable) {
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) return TAX_BRACKETS[i].rate;
    }
    return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
  }

  // 給与収入1本分の所得税額・住民税額を試算する。給与所得控除は「収入」に対して1回だけ適用されるため、
  // 掛け持ち先が複数あっても、この関数には合算後の給与収入を渡す（分けて2回呼び出して合計してはいけない）。
  function calcSingle(income) {
    var socialInsuranceRate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    var socialInsurance = income * socialInsuranceRate;

    var salaryTaxable = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var salaryTaxableResident = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX));

    var taxableBase = Math.max(0, salaryTaxable - incomeBasicDeduction(income) - socialInsurance);
    var residentTaxableBase = Math.max(0, salaryTaxableResident - RESIDENT_BASIC_DEDUCTION - socialInsurance);

    var incomeTax = taxByBracket(taxableBase) * (1 + RECONSTRUCTION_TAX_RATE);
    var residentTax = residentTaxableBase * RESIDENT_TAX_RATE;

    return {
      incomeTax: incomeTax,
      residentTax: residentTax,
      taxableBase: taxableBase,
      marginalRate: marginalBracketRate(taxableBase),
    };
  }

  function render() {
    var mainIncome = clampNonNegative(els.mainIncome.value) * 10000;
    var subIncome = clampNonNegative(els.subIncome.value) * 10000;
    var totalIncome = mainIncome + subIncome;

    var needsIncomeTaxFiling = subIncome > THRESHOLD;
    var needsResidentTaxFiling = subIncome > 0;

    // 「年末調整のみ」＝主たる勤務先1社分の給与だけで年末調整が完了した場合に源泉徴収されている所得税額の目安。
    var mainOnly = calcSingle(mainIncome);
    // 「確定申告後」＝すべての勤務先の給与収入を合算し、給与所得控除・基礎控除を1回だけ適用して計算し直した、本来納めるべき所得税額・住民税額。
    var combined = calcSingle(totalIncome);

    var taxGap = Math.max(0, combined.incomeTax - mainOnly.incomeTax);

    els.subIncomeResult.textContent = yen(subIncome);
    els.taxGap.textContent = yen(taxGap);
    els.incomeTaxFiling.textContent = needsIncomeTaxFiling ? "必要" : "不要";
    els.residentTaxFiling.textContent = needsResidentTaxFiling ? "必要" : "不要（所得なし）";
    els.combinedTax.textContent = yen(combined.incomeTax);
    els.marginalRate.textContent = (combined.marginalRate * 100).toFixed(0) + " %";

    if (subIncome <= 0) {
      els.verdict.textContent = "従たる給与（2社目以降）の年収を入力すると、確定申告の要否を判定します";
      els.verdictSub.textContent = "";
    } else if (!needsIncomeTaxFiling) {
      els.verdict.textContent = "この条件では所得税の確定申告は「不要」です";
      els.verdictSub.textContent =
        "従たる給与（2社目以降）の年収は " + yen(subIncome) + " で、20万円以下のため、主たる給与で年末調整が済んでいれば所得税の確定申告は不要です。ただし住民税の申告は別途必要になる場合があります（下記の注意点を参照）。";
    } else {
      els.verdict.textContent = "この条件では所得税の確定申告が「必要」です";
      els.verdictSub.textContent =
        "従たる給与（2社目以降）の年収は " + yen(subIncome) + " で、20万円を超えているため、所得税の確定申告が必要です。すべての勤務先の給与を合算して確定申告した場合の所得税額の目安は " + yen(combined.incomeTax) + "（主たる給与だけで年末調整された場合との差額の目安 " + yen(taxGap) + "）です。";
    }

    if (needsResidentTaxFiling) {
      els.noticeBox.style.display = "block";
      els.noticeBox.innerHTML =
        "<p><strong>住民税の申告をお忘れなく：</strong>従たる給与の年収が20万円以下で所得税の確定申告が不要な場合でも、住民税にはこの特例がないため、お住まいの市区町村へ住民税の申告が別途必要です。確定申告をした場合は、その内容が自動的に住民税にも反映されるため、住民税申告を別途行う必要はありません。また、従たる給与は「乙欄」（扶養控除等申告書の未提出者向けの税額表）で源泉徴収されるのが一般的で、甲欄より税率が高めに設定されているため、確定申告で合算・精算すると税額の一部が還付されるケースもあります。実際に還付になるか追加納付になるかは、従たる給与から実際に源泉徴収された所得税額（源泉徴収票の「源泉徴収税額」欄）によって変わるため、あわせてご確認ください。";
    } else {
      els.noticeBox.style.display = "none";
      els.noticeBox.innerHTML = "";
    }

    var rows = [
      {
        label: "従たる給与の年収 20万円以下",
        income: "所得税の確定申告：不要",
        resident: "住民税の申告：必要（所得がある場合）",
        active: !needsIncomeTaxFiling && subIncome > 0,
      },
      {
        label: "従たる給与の年収 20万円超",
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

    var ctx = document.getElementById("kakemochi-growthChart").getContext("2d");
    var data = {
      labels: ["年末調整のみ（主たる給与分）", "確定申告後（合算した本来の税額）"],
      datasets: [
        {
          label: "所得税額（年間）",
          data: [Math.round(mainOnly.incomeTax), Math.round(combined.incomeTax)],
          backgroundColor: ["#8a97a8", "#0f5f4c"],
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: "所得税額（円）" },
          ticks: { callback: function (v) { return v.toLocaleString("ja-JP") + " 円"; } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return "所得税額：" + yen(ctx.parsed.y);
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
    if (window.renderChartDataTable) window.renderChartDataTable("kakemochi-growthDataTable", chart);
  }

  [els.mainIncome, els.subIncome].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

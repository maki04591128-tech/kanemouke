(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var THRESHOLD = 200000; // 主たる給与以外の給与の収入金額の合計が20万円を超えると所得税の確定申告が必要

  // 社会保険料率（本人負担分の目安。協会けんぽ全国平均・2025年度水準、40歳未満を想定した概算）
  var HEALTH_INSURANCE_RATE = 0.0499;
  var PENSION_RATE = 0.0915;
  var EMPLOYMENT_INSURANCE_RATE = 0.006;

  // 協会けんぽの都道府県単位保険料率（令和8年度3月分〜、全体の料率。本人負担分はその半分）。
  // js/nenshu-tedori.jsと同一のデータ（出典：全国健康保険協会「都道府県単位の保険料率」）。
  var PREFECTURE_HEALTH_INSURANCE_RATES = {
    "北海道": 0.1028, "青森県": 0.0985, "岩手県": 0.0951, "宮城県": 0.1010, "秋田県": 0.1001,
    "山形県": 0.0975, "福島県": 0.0950, "茨城県": 0.0952, "栃木県": 0.0982, "群馬県": 0.0968,
    "埼玉県": 0.0967, "千葉県": 0.0973, "東京都": 0.0985, "神奈川県": 0.0992, "新潟県": 0.0921,
    "富山県": 0.0959, "石川県": 0.0970, "福井県": 0.0971, "山梨県": 0.0955, "長野県": 0.0963,
    "岐阜県": 0.0980, "静岡県": 0.0961, "愛知県": 0.0993, "三重県": 0.0977, "滋賀県": 0.0988,
    "京都府": 0.0989, "大阪府": 0.1013, "兵庫県": 0.1012, "奈良県": 0.0991, "和歌山県": 0.1006,
    "鳥取県": 0.0986, "島根県": 0.0994, "岡山県": 0.1005, "広島県": 0.0978, "山口県": 0.1015,
    "徳島県": 0.1024, "香川県": 0.1002, "愛媛県": 0.0998, "高知県": 0.1005, "福岡県": 0.1011,
    "佐賀県": 0.1055, "長崎県": 0.1006, "熊本県": 0.1008, "大分県": 0.1008, "宮崎県": 0.0977,
    "鹿児島県": 0.1013, "沖縄県": 0.0944
  };

  function healthInsuranceRate(prefecture) {
    var totalRate = PREFECTURE_HEALTH_INSURANCE_RATES[prefecture];
    if (totalRate === undefined) return HEALTH_INSURANCE_RATE; // 全国平均（既定）
    return totalRate / 2; // 本人負担分（半分）
  }

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

  var INCOME_SPOUSE_DEDUCTION = 380000; // 所得税の配偶者控除（同一生計配偶者、年収136万円以下〈令和8年分以降〉想定の簡易値）
  var RESIDENT_SPOUSE_DEDUCTION = 330000; // 住民税の配偶者控除
  var INCOME_DEPENDENT_DEDUCTION = 380000; // 所得税の扶養控除（一般の扶養親族、1人あたり）
  var RESIDENT_DEPENDENT_DEDUCTION = 330000; // 住民税の扶養控除（1人あたり）

  // ひとり親控除・寡婦控除（いずれも本人の合計所得金額500万円以下が条件。js/nenshu-tedori.jsと同じ考え方で、
  // 主たる給与・従たる給与を合算した給与所得をもって合計所得金額の近似値とし、500万円超かどうかを判定する）。
  var INCOME_SINGLE_PARENT_DEDUCTION = 350000; // 所得税のひとり親控除
  var RESIDENT_SINGLE_PARENT_DEDUCTION = 300000; // 住民税のひとり親控除
  var INCOME_WIDOW_DEDUCTION = 270000; // 所得税の寡婦控除
  var RESIDENT_WIDOW_DEDUCTION = 260000; // 住民税の寡婦控除
  var SINGLE_PARENT_INCOME_LIMIT = 5000000; // ひとり親控除・寡婦控除の所得制限（合計所得金額500万円）

  var els = {
    mainIncome: document.getElementById("kakemochi-mainIncome"),
    subIncome: document.getElementById("kakemochi-subIncome"),
    prefecture: document.getElementById("kakemochi-prefecture"),
    hasSpouse: document.getElementById("kakemochi-hasSpouse"),
    dependents: document.getElementById("kakemochi-dependents"),
    singleParentStatus: document.getElementById("kakemochi-singleParentStatus"),
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

  // 合計所得金額が500万円を超えてひとり親控除・寡婦控除が対象外になった場合に表示する注記
  var singleParentField = els.singleParentStatus.closest(".field");
  var singleParentNote = document.createElement("p");
  singleParentNote.className = "field-note";
  singleParentNote.setAttribute("aria-live", "polite");
  els.singleParentStatus.insertAdjacentElement("afterend", singleParentNote);

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
  // 配偶者控除・扶養控除・ひとり親控除・寡婦控除は、主たる勤務先が年末調整の時点で把握している家族構成に
  // 基づくため、年末調整時（mainIncomeのみ）・確定申告後（合算後）のどちらでも同じ条件で適用する。
  function calcSingle(income, prefecture, hasSpouse, dependents, singleParentStatus, singleParentApplies) {
    var socialInsuranceRate = healthInsuranceRate(prefecture) + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    var socialInsurance = income * socialInsuranceRate;

    var salaryTaxable = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var salaryTaxableResident = Math.max(0, income - salaryDeduction(income, SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX));

    var incomeDeductions = incomeBasicDeduction(income) + socialInsurance;
    if (hasSpouse) incomeDeductions += INCOME_SPOUSE_DEDUCTION;
    incomeDeductions += INCOME_DEPENDENT_DEDUCTION * dependents;
    if (singleParentApplies && singleParentStatus === "hitorioya") incomeDeductions += INCOME_SINGLE_PARENT_DEDUCTION;
    else if (singleParentApplies && singleParentStatus === "kafu") incomeDeductions += INCOME_WIDOW_DEDUCTION;

    var residentDeductions = RESIDENT_BASIC_DEDUCTION + socialInsurance;
    if (hasSpouse) residentDeductions += RESIDENT_SPOUSE_DEDUCTION;
    residentDeductions += RESIDENT_DEPENDENT_DEDUCTION * dependents;
    if (singleParentApplies && singleParentStatus === "hitorioya") residentDeductions += RESIDENT_SINGLE_PARENT_DEDUCTION;
    else if (singleParentApplies && singleParentStatus === "kafu") residentDeductions += RESIDENT_WIDOW_DEDUCTION;

    var taxableBase = Math.max(0, salaryTaxable - incomeDeductions);
    var residentTaxableBase = Math.max(0, salaryTaxableResident - residentDeductions);

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
    var prefecture = els.prefecture ? els.prefecture.value : "";
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.min(5, Math.round(Number(els.dependents.value) || 0)));
    var singleParentStatus = els.singleParentStatus.value;

    var needsIncomeTaxFiling = subIncome > THRESHOLD;
    var needsResidentTaxFiling = subIncome > 0;

    // 合計所得金額（すべての給与収入の合算を給与所得で近似）が500万円を超える場合、
    // ひとり親控除・寡婦控除は対象外になる（js/nenshu-tedori.jsと同じ考え方）。
    var totalSalaryIncome = Math.max(0, totalIncome - salaryDeduction(totalIncome, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var singleParentDeductionBlocked = singleParentStatus !== "none" && totalSalaryIncome > SINGLE_PARENT_INCOME_LIMIT;
    var singleParentApplies = singleParentStatus !== "none" && !singleParentDeductionBlocked;

    if (singleParentDeductionBlocked) {
      singleParentField.classList.add("has-note");
      singleParentNote.textContent =
        "本人の合計所得金額（給与所得換算）が500万円を超えているため、ひとり親控除・寡婦控除の所得制限（国税庁タックスアンサーNo.1171・No.1170）により、この試算では控除を適用していません。";
    } else {
      singleParentField.classList.remove("has-note");
      singleParentNote.textContent = "";
    }

    // 「年末調整のみ」＝主たる勤務先1社分の給与だけで年末調整が完了した場合に源泉徴収されている所得税額の目安。
    var mainOnly = calcSingle(mainIncome, prefecture, hasSpouse, dependents, singleParentStatus, singleParentApplies);
    // 「確定申告後」＝すべての勤務先の給与収入を合算し、給与所得控除・基礎控除を1回だけ適用して計算し直した、本来納めるべき所得税額・住民税額。
    var combined = calcSingle(totalIncome, prefecture, hasSpouse, dependents, singleParentStatus, singleParentApplies);

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

  [els.mainIncome, els.subIncome, els.prefecture, els.hasSpouse, els.dependents, els.singleParentStatus].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

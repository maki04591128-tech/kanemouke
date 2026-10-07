(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var THRESHOLD = 200000; // 20万円ルールの判定ライン（所得税のみ。住民税には適用されない）

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

  // 子ども・子育て支援金率（令和8年4月分〜、全国一律・労使折半）。
  // 出典：こども家庭庁長官が定める率（2026年1月15日付け官報公示、2.3/1000）。
  var CHILDCARE_SUPPORT_LEVY_RATE = 0.0023;

  function healthInsuranceRate(prefecture) {
    var totalRate = PREFECTURE_HEALTH_INSURANCE_RATES[prefecture];
    if (totalRate === undefined) return HEALTH_INSURANCE_RATE + CHILDCARE_SUPPORT_LEVY_RATE / 2; // 全国平均（既定）
    return (totalRate + CHILDCARE_SUPPORT_LEVY_RATE) / 2; // 本人負担分（支援金を含めて折半）
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

  // 所得税の基礎控除額。令和8年度税制改正により、令和8・9年分は合計所得金額（給与収入のみの場合の
  // 収入金額）に応じて段階的に引き上げられている。住民税の基礎控除（43万円）は今回の改正の対象外で変更なし。
  function incomeBasicDeduction(grossIncome) {
    if (grossIncome <= 6655556) return 1040000;
    if (grossIncome <= 8500000) return 670000;
    return 620000; // 合計所得金額2,350万円超（収入2,545万円超）の逓減は簡易化のため未対応
  }
  var RESIDENT_BASIC_DEDUCTION = 430000; // 住民税の基礎控除

  var els = {
    salaryIncome: document.getElementById("fukugyo-salaryIncome"),
    sideIncome: document.getElementById("fukugyo-sideIncome"),
    sideExpense: document.getElementById("fukugyo-sideExpense"),
    prefecture: document.getElementById("fukugyo-prefecture"),
    verdict: document.getElementById("fukugyo-verdict"),
    verdictSub: document.getElementById("fukugyo-verdictSub"),
    noticeBox: document.getElementById("fukugyo-noticeBox"),
    sideProfit: document.getElementById("fukugyo-result-side-profit"),
    netTakeHome: document.getElementById("fukugyo-result-net-takehome"),
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

  // 給与年収から、副業所得（雑所得・事業所得を総合課税で合算した場合）を上乗せしたときに
  // 増える所得税額・住民税額を、既存ツールと共通の給与所得控除・所得税速算表ロジックで試算する。
  // 配偶者控除・扶養控除・年齢区分による社会保険料の違いは入力項目に含めず、簡易的な概算とする。
  function calc(salaryIncome, sideProfit, prefecture) {
    var socialInsuranceRate = healthInsuranceRate(prefecture) + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    var socialInsurance = salaryIncome * socialInsuranceRate;

    var salaryTaxableIncome = Math.max(0, salaryIncome - salaryDeduction(salaryIncome, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var salaryTaxableIncomeResident = Math.max(0, salaryIncome - salaryDeduction(salaryIncome, SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX));

    var taxableBase = Math.max(0, salaryTaxableIncome - incomeBasicDeduction(salaryIncome) - socialInsurance);
    var residentTaxableBase = Math.max(0, salaryTaxableIncomeResident - RESIDENT_BASIC_DEDUCTION - socialInsurance);

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
    var prefecture = els.prefecture ? els.prefecture.value : "";

    var rawProfit = sideIncome - sideExpense; // 赤字の場合は負の値もありうる
    var sideProfit = Math.max(0, rawProfit); // 税額試算・住民税判定に使う所得（赤字は0円として扱う簡易化）

    var needsIncomeTaxFiling = rawProfit > THRESHOLD;
    var needsResidentTaxFiling = rawProfit > 0;

    var r = calc(salaryIncome, sideProfit, prefecture);
    var taxIfFiled = r.incomeTaxMarginal;
    var incomeTaxOwed = needsIncomeTaxFiling ? r.incomeTaxMarginal : 0;
    var residentTaxOwed = needsResidentTaxFiling ? r.residentTaxMarginal : 0;
    var netTakeHome = rawProfit - incomeTaxOwed - residentTaxOwed;

    els.sideProfit.textContent = yen(sideProfit) + (rawProfit < 0 ? "（赤字）" : "");
    els.netTakeHome.textContent = yen(netTakeHome);
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
    if (window.renderChartDataTable) window.renderChartDataTable("fukugyo-growthDataTable", chart);
  }

  [els.salaryIncome, els.sideIncome, els.sideExpense, els.prefecture].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

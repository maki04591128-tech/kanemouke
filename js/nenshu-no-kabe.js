(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RESIDENT_PER_CAPITA = 5000; // 住民税均等割の目安（自治体により異なる）
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var SOCIAL_INSURANCE_RATE = 0.15; // 本人負担分の概算（年収に対する割合の目安）

  // 所得税の速算表（令和2年分以降。税率区分そのものは今回の改正で変更なし）
  var TAX_BRACKETS = [
    { limit: 1950000, rate: 0.05, deduct: 0 },
    { limit: 3300000, rate: 0.10, deduct: 97500 },
    { limit: 6950000, rate: 0.20, deduct: 427500 },
    { limit: 9000000, rate: 0.23, deduct: 636000 },
    { limit: 18000000, rate: 0.33, deduct: 1536000 },
    { limit: 40000000, rate: 0.40, deduct: 2796000 },
    { limit: Infinity, rate: 0.45, deduct: 4796000 },
  ];

  // 給与所得控除額（所得税用）。令和8年度税制改正（租税特別措置法第29条の4）により、
  // 令和8・9年分は最低保障額が74万円に時限的に引き上げられている（令和10年分以後は本則69万円に戻る予定）。
  // 本ツールは「現在（令和8年分）」の試算を優先し、令和8・9年分の値を採用する。
  var SALARY_DEDUCTION_BRACKETS_INCOME_TAX = [
    { limit: 2200000, calc: function () { return 740000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 給与所得控除額（住民税用）。令和8年度税制改正の最低保障額引き上げ（74万円）は所得税のみが対象で、
  // 個人住民税の最低保障額は令和8年度分はこれまでと同じ65万円（令和9年度分以後に5万円引き上げの予定）。
  var SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX = [
    { limit: 1900000, calc: function () { return 650000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税の基礎控除。令和8年度税制改正により、令和8・9年分は合計所得金額132万円以下の場合104万円に
  // 時限的に引き上げられている（令和10年分以後は99万円に戻る予定）。本ツールが対象とする年収帯
  // （パート・アルバイト収入で「壁」を意識する範囲）はこのケースに該当することを想定し、簡易的に一律で適用する。
  var INCOME_BASIC_DEDUCTION = 1040000;
  // 住民税の基礎控除（今回の改正でも変更なし）
  var RESIDENT_BASIC_DEDUCTION = 430000;

  var WALL_RESIDENT_TAX = 1080000; // 住民税がかかり始める目安（給与所得控除65万+住民税基礎控除43万）
  var WALL_INCOME_TAX = 1780000; // 所得税がかかり始める壁（いわゆる「103万円の壁」。令和8・9年分は時限特例で基礎控除104万+給与所得控除74万＝178万円）
  var WALL_106 = 1060000; // 社会保険の壁（要件に該当する勤務先の場合）
  var WALL_130 = 1300000; // 社会保険の壁（上記要件に該当しない場合）
  // 配偶者特別控除の壁も、令和8年度税制改正で配偶者の合計所得要件が引き上げられたことに伴い、
  // 満額維持の上限が給与収入換算150万円→159万円、消滅ラインが201万6千円→207万円に変わっている。
  var WALL_HAIGUSHA_MAX = 1590000; // 配偶者特別控除が満額(配偶者側38万円)から逓減し始める壁
  var WALL_HAIGUSHA_ZERO = 2070000; // 配偶者特別控除が消滅する壁（207万円以上）

  var els = {
    income: document.getElementById("kabe-income"),
    insuranceApplies: document.getElementById("kabe-insuranceApplies"),
    verdict: document.getElementById("kabe-verdict"),
    verdictSub: document.getElementById("kabe-verdictSub"),
    salaryIncome: document.getElementById("kabe-result-salary-income"),
    incomeTax: document.getElementById("kabe-result-income-tax"),
    residentTax: document.getElementById("kabe-result-resident-tax"),
    socialInsurance: document.getElementById("kabe-result-social-insurance"),
    takeHome: document.getElementById("kabe-result-take-home"),
    wallBody: document.getElementById("kabe-wall-body"),
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

  function salaryDeductionIncomeTax(income) {
    for (var i = 0; i < SALARY_DEDUCTION_BRACKETS_INCOME_TAX.length; i++) {
      var b = SALARY_DEDUCTION_BRACKETS_INCOME_TAX[i];
      if (income <= b.limit) return b.calc(income);
    }
    return 1950000;
  }

  function salaryDeductionResidentTax(income) {
    for (var i = 0; i < SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX.length; i++) {
      var b = SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX[i];
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

  // 年収から所得税・住民税・社会保険料（概算）を差し引いた手取り額を試算
  function takeHomeOf(income, insuranceApplies) {
    var salaryIncomeForIncomeTax = Math.max(0, income - salaryDeductionIncomeTax(income));
    var taxableIncomeTax = Math.max(0, salaryIncomeForIncomeTax - INCOME_BASIC_DEDUCTION);
    var incomeTax = taxByBracket(taxableIncomeTax) * (1 + RECONSTRUCTION_TAX_RATE);

    var salaryIncomeForResidentTax = Math.max(0, income - salaryDeductionResidentTax(income));
    var taxableResidentTax = Math.max(0, salaryIncomeForResidentTax - RESIDENT_BASIC_DEDUCTION);
    var residentTax = taxableResidentTax > 0 ? taxableResidentTax * RESIDENT_TAX_RATE + RESIDENT_PER_CAPITA : 0;

    var insuranceWall = insuranceApplies ? WALL_106 : WALL_130;
    var socialInsurance = income > insuranceWall ? income * SOCIAL_INSURANCE_RATE : 0;

    var takeHome = income - incomeTax - residentTax - socialInsurance;

    return {
      salaryIncome: salaryIncomeForIncomeTax,
      incomeTax: incomeTax,
      residentTax: residentTax,
      socialInsurance: socialInsurance,
      takeHome: takeHome,
    };
  }

  function wallRow(label, amount, income, note) {
    var crossed = income > amount;
    var status = crossed
      ? "超えています（あと " + manYen(income - amount) + " 前から超過中）"
      : "未満です（あと " + manYen(amount - income) + " で到達）";
    return (
      "<tr" + (crossed ? ' class="wall-crossed"' : "") + ">" +
      "<td>" + label + "</td>" +
      "<td>" + manYen(amount) + "</td>" +
      "<td>" + status + "</td>" +
      "<td>" + note + "</td>" +
      "</tr>"
    );
  }

  function render() {
    var income = clampNonNegative(els.income.value);
    var insuranceApplies = els.insuranceApplies.value === "yes";

    var r = takeHomeOf(income, insuranceApplies);

    els.salaryIncome.textContent = manYen(r.salaryIncome);
    els.incomeTax.textContent = yen(r.incomeTax);
    els.residentTax.textContent = yen(r.residentTax);
    els.socialInsurance.textContent = yen(r.socialInsurance);
    els.takeHome.textContent = manYen(r.takeHome);

    var insuranceWall = insuranceApplies ? WALL_106 : WALL_130;
    var insuranceWallLabel = insuranceApplies ? "106万円の壁（社会保険）" : "130万円の壁（社会保険）";

    if (income > insuranceWall) {
      els.verdict.textContent =
        "社会保険の壁（" + manYen(insuranceWall) + "）を超えています。手取りが目減りしやすいラインです";
      els.verdictSub.textContent =
        "年収 " + manYen(income) + " に対する手取りの目安は " + manYen(r.takeHome) +
        "。社会保険料の負担が始まることで、壁を超えた直後は手取りが一時的に伸び悩む・減ることがあります。";
    } else if (income > WALL_INCOME_TAX) {
      els.verdict.textContent =
        "所得税の壁（178万円）は超えていますが、社会保険の壁（" + manYen(insuranceWall) + "）は手前です";
      els.verdictSub.textContent =
        "あと " + manYen(insuranceWall - income) + " で社会保険の壁に到達します。手取りの目安は " + manYen(r.takeHome) + "。";
    } else if (income > WALL_RESIDENT_TAX) {
      els.verdict.textContent = "住民税はかかりますが、所得税・社会保険料の壁はまだ手前です";
      els.verdictSub.textContent =
        "所得税の壁（178万円）まであと " + manYen(WALL_INCOME_TAX - income) + "。手取りの目安は " + manYen(r.takeHome) + "。";
    } else {
      els.verdict.textContent = "どの壁も超えていません。税金・社会保険料はほとんど発生しない範囲です";
      els.verdictSub.textContent = "手取りの目安は年収とほぼ同じ " + manYen(r.takeHome) + " です。";
    }

    var rows = [
      wallRow("住民税（目安）", WALL_RESIDENT_TAX, income, "自治体により非課税ラインは異なります"),
      wallRow("所得税（いわゆる103万円の壁）", WALL_INCOME_TAX, income, "令和8・9年分は時限特例で178万円（令和10年分以後は168万円に戻る予定）"),
      wallRow(insuranceWallLabel, insuranceWall, income, insuranceApplies ? "従業員51人以上の企業等、加入条件に該当する場合" : "上記の加入条件に該当しない場合"),
      wallRow("配偶者特別控除 満額の壁", WALL_HAIGUSHA_MAX, income, "配偶者側の控除（最大38万円）が満額を維持できるライン"),
      wallRow("配偶者特別控除 消滅の壁", WALL_HAIGUSHA_ZERO, income, "207万円以上で配偶者側の控除がゼロに"),
    ];
    els.wallBody.innerHTML = rows.join("");

    var minX = 800000;
    var maxX = Math.max(2500000, income * 1.2);
    var stepX = 50000;
    var curve = [];
    var faceValue = [];
    for (var x = minX; x <= maxX; x += stepX) {
      var res = takeHomeOf(x, insuranceApplies);
      curve.push({ x: x, y: Math.round(res.takeHome) });
      faceValue.push({ x: x, y: x });
    }

    var ctx = document.getElementById("kabe-growthChart").getContext("2d");
    var data = {
      datasets: [
        {
          label: "額面年収（そのまま）",
          data: faceValue,
          borderColor: "#c9c2b4",
          borderDash: [4, 4],
          backgroundColor: "transparent",
          fill: false,
          tension: 0,
          pointRadius: 0,
          parsing: false,
        },
        {
          label: "手取り額の目安",
          data: curve,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0,
          pointRadius: 0,
          parsing: false,
        },
        {
          label: "あなたの年収",
          data: [{ x: income, y: Math.round(r.takeHome) }],
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
          title: { display: true, text: "年収（額面）" },
          ticks: { callback: function (v) { return manYen(v); } },
        },
        y: {
          title: { display: true, text: "手取り額" },
          ticks: { callback: function (v) { return manYen(v); } },
        },
      },
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：年収 " + yen(ctx.parsed.x) + " → " + yen(ctx.parsed.y);
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
    if (window.renderChartDataTable) window.renderChartDataTable("kabe-growthDataTable", chart);
  }

  [els.income, els.insuranceApplies].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

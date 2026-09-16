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

  // 給与所得控除額（2025年度税制改正後、最低保障額65万円）
  var SALARY_DEDUCTION_BRACKETS = [
    { limit: 1900000, calc: function () { return 650000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税の基礎控除（2025年分以降。合計所得金額2,350万円以下の場合）
  var INCOME_BASIC_DEDUCTION = 580000;
  // 住民税の基礎控除（今回の改正での変更なし）
  var RESIDENT_BASIC_DEDUCTION = 430000;

  var WALL_RESIDENT_TAX = 1080000; // 住民税がかかり始める目安（給与所得控除65万+住民税基礎控除43万）
  var WALL_INCOME_TAX = 1230000; // 所得税がかかり始める壁（いわゆる「103万円の壁」、2025年分以降は123万円）
  var WALL_106 = 1060000; // 社会保険の壁（要件に該当する勤務先の場合）
  var WALL_130 = 1300000; // 社会保険の壁（上記要件に該当しない場合）
  var WALL_HAIGUSHA_MAX = 1500000; // 配偶者特別控除が満額(配偶者側38万円)から逓減し始める壁
  var WALL_HAIGUSHA_ZERO = 2016000; // 配偶者特別控除が消滅する壁（201万6千円未満）

  var els = {
    income: document.getElementById("income"),
    insuranceApplies: document.getElementById("insuranceApplies"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    salaryIncome: document.getElementById("result-salary-income"),
    incomeTax: document.getElementById("result-income-tax"),
    residentTax: document.getElementById("result-resident-tax"),
    socialInsurance: document.getElementById("result-social-insurance"),
    takeHome: document.getElementById("result-take-home"),
    wallBody: document.getElementById("wall-body"),
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

  // 年収から所得税・住民税・社会保険料（概算）を差し引いた手取り額を試算
  function takeHomeOf(income, insuranceApplies) {
    var salaryIncome = Math.max(0, income - salaryDeduction(income));

    var taxableIncomeTax = Math.max(0, salaryIncome - INCOME_BASIC_DEDUCTION);
    var incomeTax = taxByBracket(taxableIncomeTax) * (1 + RECONSTRUCTION_TAX_RATE);

    var taxableResidentTax = Math.max(0, salaryIncome - RESIDENT_BASIC_DEDUCTION);
    var residentTax = taxableResidentTax > 0 ? taxableResidentTax * RESIDENT_TAX_RATE + RESIDENT_PER_CAPITA : 0;

    var insuranceWall = insuranceApplies ? WALL_106 : WALL_130;
    var socialInsurance = income > insuranceWall ? income * SOCIAL_INSURANCE_RATE : 0;

    var takeHome = income - incomeTax - residentTax - socialInsurance;

    return {
      salaryIncome: salaryIncome,
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
        "所得税の壁（123万円）は超えていますが、社会保険の壁（" + manYen(insuranceWall) + "）は手前です";
      els.verdictSub.textContent =
        "あと " + manYen(insuranceWall - income) + " で社会保険の壁に到達します。手取りの目安は " + manYen(r.takeHome) + "。";
    } else if (income > WALL_RESIDENT_TAX) {
      els.verdict.textContent = "住民税はかかりますが、所得税・社会保険料の壁はまだ手前です";
      els.verdictSub.textContent =
        "所得税の壁（123万円）まであと " + manYen(WALL_INCOME_TAX - income) + "。手取りの目安は " + manYen(r.takeHome) + "。";
    } else {
      els.verdict.textContent = "どの壁も超えていません。税金・社会保険料はほとんど発生しない範囲です";
      els.verdictSub.textContent = "手取りの目安は年収とほぼ同じ " + manYen(r.takeHome) + " です。";
    }

    var rows = [
      wallRow("住民税（目安）", WALL_RESIDENT_TAX, income, "自治体により非課税ラインは異なります"),
      wallRow("所得税（いわゆる103万円の壁）", WALL_INCOME_TAX, income, "2025年分以降は基礎控除等の引き上げで123万円に"),
      wallRow(insuranceWallLabel, insuranceWall, income, insuranceApplies ? "従業員51人以上の企業等、加入条件に該当する場合" : "上記の加入条件に該当しない場合"),
      wallRow("配偶者特別控除 満額の壁", WALL_HAIGUSHA_MAX, income, "配偶者側の控除（最大38万円）が満額を維持できるライン"),
      wallRow("配偶者特別控除 消滅の壁", WALL_HAIGUSHA_ZERO, income, "201万6千円以上で配偶者側の控除がゼロに"),
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

    var ctx = document.getElementById("growthChart").getContext("2d");
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
  }

  [els.income, els.insuranceApplies].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

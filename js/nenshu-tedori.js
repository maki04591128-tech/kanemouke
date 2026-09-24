(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RESIDENT_PER_CAPITA = 5000; // 住民税均等割の目安（自治体により異なる）
  var RECONSTRUCTION_TAX_RATE = 0.021;

  // 社会保険料率（本人負担分の目安。協会けんぽ全国平均・2025年度水準を想定した概算）
  var HEALTH_INSURANCE_RATE = 0.0499; // 健康保険（本人負担分）
  var CARE_INSURANCE_RATE = 0.0080; // 介護保険（40〜64歳、本人負担分）
  var PENSION_RATE = 0.0915; // 厚生年金保険（本人負担分）
  var EMPLOYMENT_INSURANCE_RATE = 0.006; // 雇用保険（本人負担分・一般の事業）

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

  var INCOME_SPOUSE_DEDUCTION = 380000; // 所得税の配偶者控除（同一生計配偶者、年収103万円以下想定の簡易値）
  var RESIDENT_SPOUSE_DEDUCTION = 330000; // 住民税の配偶者控除
  var INCOME_DEPENDENT_DEDUCTION = 380000; // 所得税の扶養控除（一般の扶養親族、1人あたり）
  var RESIDENT_DEPENDENT_DEDUCTION = 330000; // 住民税の扶養控除（1人あたり）

  var els = {
    income: document.getElementById("tedori-income"),
    ageGroup: document.getElementById("tedori-ageGroup"),
    hasSpouse: document.getElementById("tedori-hasSpouse"),
    dependents: document.getElementById("tedori-dependents"),
    verdict: document.getElementById("tedori-verdict"),
    verdictSub: document.getElementById("tedori-verdictSub"),
    takeHome: document.getElementById("tedori-result-take-home"),
    takeHomeRate: document.getElementById("tedori-result-take-home-rate"),
    takeHomeMonthly: document.getElementById("tedori-result-take-home-monthly"),
    totalDeduction: document.getElementById("tedori-result-total-deduction"),
    breakdownBody: document.getElementById("tedori-breakdown-body"),
    tableBody: document.getElementById("tedori-table-body"),
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

  // 年収・年齢区分・配偶者控除の有無・扶養人数から、社会保険料・所得税・住民税・手取り額を試算する。
  function calc(income, ageGroup, hasSpouse, dependents) {
    var socialInsuranceRate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    if (ageGroup === "40to64") socialInsuranceRate += CARE_INSURANCE_RATE;
    var socialInsurance = income * socialInsuranceRate;

    var salaryIncome = Math.max(0, income - salaryDeduction(income));

    var incomeDeductions = INCOME_BASIC_DEDUCTION + socialInsurance;
    if (hasSpouse) incomeDeductions += INCOME_SPOUSE_DEDUCTION;
    incomeDeductions += INCOME_DEPENDENT_DEDUCTION * dependents;

    var taxableIncomeTax = Math.max(0, salaryIncome - incomeDeductions);
    var incomeTax = taxByBracket(taxableIncomeTax) * (1 + RECONSTRUCTION_TAX_RATE);

    var residentDeductions = RESIDENT_BASIC_DEDUCTION + socialInsurance;
    if (hasSpouse) residentDeductions += RESIDENT_SPOUSE_DEDUCTION;
    residentDeductions += RESIDENT_DEPENDENT_DEDUCTION * dependents;

    var taxableResidentTax = Math.max(0, salaryIncome - residentDeductions);
    var residentTax = taxableResidentTax > 0 ? taxableResidentTax * RESIDENT_TAX_RATE + RESIDENT_PER_CAPITA : 0;

    var totalDeduction = socialInsurance + incomeTax + residentTax;
    var takeHome = income - totalDeduction;

    return {
      salaryIncome: salaryIncome,
      socialInsurance: socialInsurance,
      incomeTax: incomeTax,
      residentTax: residentTax,
      totalDeduction: totalDeduction,
      takeHome: takeHome,
    };
  }

  function render() {
    var income = clampNonNegative(els.income.value) * 10000;
    var ageGroup = els.ageGroup.value;
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.min(5, Math.round(Number(els.dependents.value) || 0)));

    var r = calc(income, ageGroup, hasSpouse, dependents);
    var rate = income > 0 ? (r.takeHome / income) * 100 : 0;

    els.takeHome.textContent = manYen(r.takeHome);
    els.takeHomeRate.textContent = rate.toFixed(1) + " %";
    els.takeHomeMonthly.textContent = manYen(r.takeHome / 12);
    els.totalDeduction.textContent = manYen(r.totalDeduction);

    els.verdict.textContent =
      "額面年収 " + manYen(income) + " に対する手取りの目安は " + manYen(r.takeHome) + "（手取り率 約" + rate.toFixed(1) + "%）です";
    els.verdictSub.textContent =
      "額面と手取りの差額は " + manYen(r.totalDeduction) + "。内訳は社会保険料 " + manYen(r.socialInsurance) +
      "、所得税 " + manYen(r.incomeTax) + "、住民税 " + manYen(r.residentTax) + " です。";

    els.breakdownBody.innerHTML =
      "<tr><td>給与所得控除後の給与所得</td><td>" + manYen(r.salaryIncome) + "</td></tr>" +
      "<tr><td>社会保険料（健康保険・厚生年金・雇用保険" + (ageGroup === "40to64" ? "・介護保険" : "") + "）</td><td>" + manYen(r.socialInsurance) + "</td></tr>" +
      "<tr><td>所得税（復興特別所得税込み）</td><td>" + manYen(r.incomeTax) + "</td></tr>" +
      "<tr><td>住民税（均等割込み）</td><td>" + manYen(r.residentTax) + "</td></tr>" +
      "<tr><td><strong>額面と手取りの差額（合計）</strong></td><td><strong>" + manYen(r.totalDeduction) + "</strong></td></tr>" +
      "<tr><td><strong>手取り年収</strong></td><td><strong>" + manYen(r.takeHome) + "</strong></td></tr>" +
      "<tr><td>手取り率</td><td>" + rate.toFixed(1) + " %</td></tr>" +
      "<tr><td>月あたりの手取り目安（年収÷12）</td><td>" + manYen(r.takeHome / 12) + "</td></tr>";

    var refIncomes = [3000000, 4000000, 5000000, 6000000, 7000000, 8000000, 10000000, 12000000, 15000000];
    var rows = refIncomes.map(function (x) {
      var res = calc(x, ageGroup, hasSpouse, dependents);
      var xRate = (res.takeHome / x) * 100;
      var isCurrent = Math.abs(x - income) < 1;
      return (
        "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
        "<td>" + manYen(x) + "</td>" +
        "<td>" + manYen(res.takeHome) + "</td>" +
        "<td>" + xRate.toFixed(1) + " %</td>" +
        "</tr>"
      );
    });
    els.tableBody.innerHTML = rows.join("");

    var ctx = document.getElementById("tedori-growthChart").getContext("2d");
    var data = {
      labels: ["手取り", "社会保険料", "所得税", "住民税"],
      datasets: [
        {
          data: [
            Math.round(r.takeHome),
            Math.round(r.socialInsurance),
            Math.round(r.incomeTax),
            Math.round(r.residentTax),
          ],
          backgroundColor: ["#0f5f4c", "#7fa998", "#d98e04", "#c96b3f"],
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
              var pct = income > 0 ? (value / income) * 100 : 0;
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

  [els.income, els.ageGroup, els.hasSpouse, els.dependents].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

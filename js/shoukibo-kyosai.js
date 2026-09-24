(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  // 基礎控除は2025年分以降の58万円（合計所得金額2,350万円以下の場合）
  var INCOME_BASIC_DEDUCTION = 580000;
  var RESIDENT_BASIC_DEDUCTION = 430000;

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

  var els = {
    monthly: document.getElementById("kyosai-monthly"),
    monthlyOut: document.getElementById("kyosai-monthlyOut"),
    years: document.getElementById("kyosai-years"),
    yearsOut: document.getElementById("kyosai-yearsOut"),
    taxableIncome: document.getElementById("kyosai-taxableIncome"),
    rate: document.getElementById("kyosai-rate"),
    rateOut: document.getElementById("kyosai-rateOut"),
    payoutMethod: document.getElementById("kyosai-payoutMethod"),
    ageGroupRow: document.getElementById("kyosai-ageGroupRow"),
    ageGroup: document.getElementById("kyosai-ageGroup"),
    verdict: document.getElementById("kyosai-verdict"),
    verdictSub: document.getElementById("kyosai-verdictSub"),
    annualSaving: document.getElementById("kyosai-result-annual-saving"),
    totalSaving: document.getElementById("kyosai-result-total-saving"),
    principal: document.getElementById("kyosai-result-principal"),
    kyosaikin: document.getElementById("kyosai-result-kyosaikin"),
    netCost: document.getElementById("kyosai-result-net-cost"),
    netPayout: document.getElementById("kyosai-result-net-payout"),
    tableBody: document.getElementById("kyosai-breakdown-body"),
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

  function marginalIncomeTaxRate(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) return TAX_BRACKETS[i].rate;
    }
    return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
  }

  function incomeTax(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      var b = TAX_BRACKETS[i];
      if (taxable <= b.limit) return Math.max(0, taxable * b.rate - b.deduct);
    }
    return 0;
  }

  function incomeTaxWithReconstruction(taxable) {
    var tax = incomeTax(taxable);
    return tax <= 0 ? 0 : tax * (1 + RECONSTRUCTION_TAX_RATE);
  }

  // 一括受取（共済金）は退職所得とみなされ、掛金納付月数を勤続年数とみなして
  // 退職所得控除額を計算する（国税庁の退職所得控除の速算表と同じ計算式）。
  function retirementDeduction(years) {
    var y = Math.max(1, Math.round(years));
    if (y <= 20) return Math.max(800000, y * 400000);
    return 8000000 + (y - 20) * 700000;
  }

  // 公的年金等の雑所得（令和2年分以降の速算表、その他の所得合計が1,000万円以下の前提）
  function pensionTaxableIncome(income, isOver65) {
    var v;
    if (isOver65) {
      if (income <= 1100000) v = 0;
      else if (income < 3300000) v = income - 1100000;
      else if (income < 4100000) v = income * 0.75 - 275000;
      else if (income < 7700000) v = income * 0.85 - 685000;
      else if (income < 10000000) v = income * 0.95 - 1455000;
      else v = income - 1955000;
    } else {
      if (income <= 600000) v = 0;
      else if (income < 1300000) v = income - 600000;
      else if (income < 4100000) v = income * 0.75 - 275000;
      else if (income < 7700000) v = income * 0.85 - 685000;
      else if (income < 10000000) v = income * 0.95 - 1455000;
      else v = income - 1955000;
    }
    return Math.max(0, v);
  }

  // 元本を年利rでN年かけて均等に取り崩す場合の毎年の受取額（年金現価方式）
  function annualAnnuityPayment(principal, rate, years) {
    if (rate === 0) return principal / years;
    return (principal * rate) / (1 - Math.pow(1 + rate, -years));
  }

  // 毎月初に掛金を拠出し、その月の運用益を乗せる（積立複利シミュレーターと同じ方式）
  function simulateGrowth(monthly, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var months = Math.round(years * 12);
    var balance = 0;
    var principal = 0;
    var yearly = [];

    for (var m = 1; m <= months; m++) {
      balance += monthly;
      principal += monthly;
      balance *= 1 + r;
      if (m % 12 === 0) {
        yearly.push({ year: m / 12, balance: balance, principal: principal });
      }
    }
    if (months % 12 !== 0) {
      yearly.push({ year: years, balance: balance, principal: principal });
    }
    if (yearly.length === 0) {
      yearly.push({ year: 0, balance: 0, principal: 0 });
    }
    return { balance: balance, principal: principal, yearly: yearly };
  }

  function updateAgeGroupVisibility() {
    els.ageGroupRow.style.display = els.payoutMethod.value === "lump" ? "none" : "";
  }

  function render() {
    var monthly = clampNonNegative(els.monthly.value);
    var years = Number(els.years.value);
    var taxableIncome = clampNonNegative(els.taxableIncome.value);
    var ratePct = Number(els.rate.value);
    var payoutMethod = els.payoutMethod.value;
    var isOver65 = els.ageGroup.value === "65";

    els.monthlyOut.textContent = yen(monthly);
    els.yearsOut.textContent = years + " 年";
    els.rateOut.textContent = ratePct.toFixed(1) + " %";

    var annualContribution = monthly * 12;
    var marginalRate = marginalIncomeTaxRate(taxableIncome);
    var combinedRate = marginalRate + RESIDENT_TAX_RATE;
    var annualSaving = annualContribution * combinedRate;
    var totalSaving = annualSaving * years;

    var growth = simulateGrowth(monthly, ratePct, years);
    var principal = growth.principal;
    var kyosaikin = growth.balance;
    var netCost = principal - totalSaving;

    var payoutYears = payoutMethod === "lump" ? 0 : (payoutMethod === "installment10" ? 10 : 15);
    var deduction = 0;
    var payoutTax = 0;
    var netPayout = 0;
    var paymentPerYear = 0;

    if (payoutMethod === "lump") {
      deduction = retirementDeduction(years);
      var retirementIncome = Math.max(0, kyosaikin - deduction) / 2;
      payoutTax = incomeTaxWithReconstruction(retirementIncome) + retirementIncome * RESIDENT_TAX_RATE;
      netPayout = kyosaikin - payoutTax;
    } else {
      paymentPerYear = annualAnnuityPayment(kyosaikin, ratePct / 100, payoutYears);
      var taxableEach = pensionTaxableIncome(paymentPerYear, isOver65);
      var incomeTaxBase = Math.max(0, taxableEach - INCOME_BASIC_DEDUCTION);
      var residentTaxBase = Math.max(0, taxableEach - RESIDENT_BASIC_DEDUCTION);
      var taxEach = incomeTaxWithReconstruction(incomeTaxBase) + residentTaxBase * RESIDENT_TAX_RATE;
      payoutTax = taxEach * payoutYears;
      netPayout = paymentPerYear * payoutYears - payoutTax;
    }

    els.annualSaving.textContent = yen(annualSaving);
    els.totalSaving.textContent = manYen(totalSaving);
    els.principal.textContent = manYen(principal);
    els.kyosaikin.textContent = manYen(kyosaikin);
    els.netCost.textContent = manYen(netCost);
    els.netPayout.textContent = manYen(netPayout);

    if (payoutMethod === "lump" && kyosaikin <= deduction) {
      els.verdict.textContent = "共済金（一括）は退職所得控除の範囲内のため、受取時の税額はゼロです";
      els.verdictSub.textContent =
        "掛金累計 " + manYen(principal) + " に加え、拠出中の累計節税額 " + manYen(totalSaving) + " が実質的な上乗せ効果になります。";
    } else if (payoutMethod === "lump") {
      els.verdict.textContent = "共済金（一括）の受取時手取りは " + manYen(netPayout) + " の見込みです";
      els.verdictSub.textContent =
        "退職所得控除（" + manYen(deduction) + "）を超えた部分の1/2に課税されるため、税負担は給与や事業所得より軽くなります。";
    } else {
      els.verdict.textContent =
        "分割受取（" + payoutYears + "年）では、税引前で毎年 " + manYen(paymentPerYear) + " を受け取る見込みです";
      els.verdictSub.textContent =
        "公的年金等の雑所得として課税され、" + payoutYears + "年間の合計税額は " + manYen(payoutTax) + " の見込みです。";
    }

    var rows = [
      ["掛金月額", yen(monthly)],
      ["加入年数（掛金拠出年数）", years + " 年"],
      ["入力した年間課税所得の目安", yen(taxableIncome)],
      ["所得税率（速算表）", (marginalRate * 100).toFixed(0) + " %"],
      ["年間節税額（所得税＋住民税）", yen(annualSaving)],
      ["加入期間中の累計節税額", manYen(totalSaving)],
      ["掛金累計額（元本）", manYen(principal)],
      ["共済金の目安（想定利率 " + ratePct.toFixed(1) + "%で試算）", manYen(kyosaikin)],
      ["実質負担額（掛金累計－累計節税額）", manYen(netCost)],
    ];
    if (payoutMethod === "lump") {
      rows.push(["退職所得控除額（加入年数ベース）", manYen(deduction)]);
      rows.push(["受取時の税額（一括・退職所得扱い）", manYen(payoutTax)]);
      rows.push(["受取時の手取り額（一括）", manYen(netPayout)]);
    } else {
      rows.push(["分割受取の年数", payoutYears + " 年"]);
      rows.push(["毎年の受取額（税引前）", manYen(paymentPerYear)]);
      rows.push([payoutYears + "年間の合計税額（公的年金等の雑所得扱い）", manYen(payoutTax)]);
      rows.push(["受取時の手取り総額（分割）", manYen(netPayout)]);
    }

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var labels = growth.yearly.map(function (d) { return d.year + "年"; });
    var principalData = growth.yearly.map(function (d) { return Math.round(d.principal); });
    var balanceData = growth.yearly.map(function (d) { return Math.round(d.balance); });

    var ctx = document.getElementById("kyosai-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "共済金の目安（掛金＋運用益）",
          data: balanceData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "掛金（累計拠出額）",
          data: principalData,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + "：" + yen(ctx.parsed.y); },
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

  els.payoutMethod.addEventListener("change", function () {
    updateAgeGroupVisibility();
    render();
  });
  [els.monthly, els.years, els.taxableIncome, els.rate, els.ageGroup].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  updateAgeGroupVisibility();
  render();
})();

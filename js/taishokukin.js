(function () {
  "use strict";

  // 基礎控除は2025年分以降の58万円（合計所得金額2,350万円以下の場合）
  var INCOME_BASIC_DEDUCTION = 580000;
  var RESIDENT_BASIC_DEDUCTION = 430000;
  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;

  // 所得税の速算表（分離課税の退職所得・総合課税の雑所得ともに同じ税率区分を使用）
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
    amount: document.getElementById("taishokukin-amount"),
    serviceYears: document.getElementById("taishokukin-serviceYears"),
    serviceYearsOut: document.getElementById("taishokukin-serviceYearsOut"),
    payoutYears: document.getElementById("taishokukin-payoutYears"),
    payoutYearsOut: document.getElementById("taishokukin-payoutYearsOut"),
    ageGroup: document.getElementById("taishokukin-ageGroup"),
    annuityRate: document.getElementById("taishokukin-annuityRate"),
    annuityRateOut: document.getElementById("taishokukin-annuityRateOut"),
    investRate: document.getElementById("taishokukin-investRate"),
    investRateOut: document.getElementById("taishokukin-investRateOut"),
    overlapEnable: document.getElementById("taishokukin-overlapEnable"),
    overlapFields: document.getElementById("taishokukin-overlapFields"),
    overlapType: document.getElementById("taishokukin-overlapType"),
    overlapYear: document.getElementById("taishokukin-overlapYear"),
    overlapServiceYears: document.getElementById("taishokukin-overlapServiceYears"),
    overlapAmount: document.getElementById("taishokukin-overlapAmount"),
    verdict: document.getElementById("taishokukin-verdict"),
    verdictSub: document.getElementById("taishokukin-verdictSub"),
    lumpNet: document.getElementById("taishokukin-result-lump-net"),
    lumpTax: document.getElementById("taishokukin-result-lump-tax"),
    pensionYearly: document.getElementById("taishokukin-result-pension-yearly"),
    finalLump: document.getElementById("taishokukin-result-final-lump"),
    finalPension: document.getElementById("taishokukin-result-final-pension"),
    pensionTaxTotal: document.getElementById("taishokukin-pension-tax-total"),
    deductionAmount: document.getElementById("taishokukin-deduction-amount"),
    overlapNote: document.getElementById("taishokukin-overlap-note"),
  };

  var THIS_YEAR = new Date().getFullYear();

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function incomeTax(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      var b = TAX_BRACKETS[i];
      if (taxable <= b.limit) {
        return Math.max(0, taxable * b.rate - b.deduct);
      }
    }
    return 0;
  }

  function incomeTaxWithReconstruction(taxable) {
    var tax = incomeTax(taxable);
    return tax <= 0 ? 0 : tax * (1 + RECONSTRUCTION_TAX_RATE);
  }

  // 退職所得控除額（勤続年数に応じた速算表）
  function retirementDeduction(years) {
    var y = Math.max(1, Math.round(years));
    if (y <= 20) return Math.max(800000, y * 400000);
    return 8000000 + (y - 20) * 700000;
  }

  // 前の退職一時金の受取額が、重複を考慮しない場合の退職所得控除額に満たないときの追加調整
  // （所得税法施行令第70条第2項）。この場合、前の一時金の勤続期間等の全期間ではなく、受取額を
  // 基に逆算した年数（800万円以下なら受取額÷40万円、800万円超なら(受取額-800万円)÷70万円+20）
  // を重複期間の算定に使う勤続年数とみなす。
  function deemedOverlapServiceYears(otherServiceYears, otherAmount) {
    if (!(otherAmount > 0)) return otherServiceYears;
    var standardDeduction = retirementDeduction(otherServiceYears);
    if (otherAmount >= standardDeduction) return otherServiceYears;
    var deemed =
      otherAmount <= 8000000
        ? Math.floor(otherAmount / 400000)
        : Math.floor((otherAmount - 8000000) / 700000) + 20;
    return Math.max(0, Math.min(deemed, otherServiceYears));
  }

  // 他の退職一時金との受け取り時期が近い場合の退職所得控除額の調整（所得税法施行令第70条）
  // 今回（今年）勤務先の退職金を一時金として受け取り、過去に別の退職一時金（勤務先の退職金 or
  // iDeCo等の確定拠出年金の老齢一時金）を受け取っている場合、勤続期間の重複部分に対応する控除額が
  // 差し引かれる。重複期間は、双方の勤続（拠出）年数のうち短い方（前の一時金側は上記の逆算調整後の
  // 年数）とみなして簡易的に算出する。
  function overlapAdjustedDeduction(baseYears, enabled, otherType, otherYear, otherServiceYears, otherAmount) {
    var baseDeduction = retirementDeduction(baseYears);
    var result = {
      deduction: baseDeduction,
      reduction: 0,
      overlapYears: 0,
      otherEffectiveYears: otherServiceYears,
      applied: false,
      threshold: otherType === "dc" ? (otherYear >= 2026 ? 9 : 4) : 4,
    };
    if (!enabled) return result;

    var gap = THIS_YEAR - otherYear;
    if (gap < 1 || gap > result.threshold) return result;
    if (!(otherServiceYears > 0)) return result;

    var otherEffectiveYears = deemedOverlapServiceYears(otherServiceYears, otherAmount);
    var overlapYears = Math.min(baseYears, otherEffectiveYears);
    var reduction = retirementDeduction(overlapYears);
    result.deduction = Math.max(0, baseDeduction - reduction);
    result.reduction = reduction;
    result.overlapYears = overlapYears;
    result.otherEffectiveYears = otherEffectiveYears;
    result.applied = true;
    return result;
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

  // 元本を年利rでN年かけて均等に取り崩す場合の毎年の受取額（ローン返済額と同じ考え方の年金現価方式）
  function annualAnnuityPayment(principal, rate, years) {
    if (rate === 0) return principal / years;
    return (principal * rate) / (1 - Math.pow(1 + rate, -years));
  }

  function render() {
    var amountMan = Math.max(0, Number(els.amount.value) || 0);
    var principal = amountMan * 10000;
    var serviceYears = Number(els.serviceYears.value);
    var payoutYears = Number(els.payoutYears.value);
    var isOver65 = els.ageGroup.value === "65";
    var annuityRatePct = Number(els.annuityRate.value);
    var investRatePct = Number(els.investRate.value);

    els.serviceYearsOut.textContent = serviceYears + " 年";
    els.payoutYearsOut.textContent = payoutYears + " 年";
    els.annuityRateOut.textContent = annuityRatePct.toFixed(1) + " %";
    els.investRateOut.textContent = investRatePct.toFixed(1) + " %";

    var annuityRate = annuityRatePct / 100;
    var investRate = investRatePct / 100;

    // --- A: 一時金で受け取る場合 ---
    var overlapEnabled = els.overlapEnable.value === "yes";
    els.overlapFields.hidden = !overlapEnabled;
    var overlapResult = overlapAdjustedDeduction(
      serviceYears,
      overlapEnabled,
      els.overlapType.value,
      Number(els.overlapYear.value),
      Number(els.overlapServiceYears.value),
      Math.max(0, Number(els.overlapAmount.value) || 0) * 10000
    );
    var deduction = overlapResult.deduction;
    var retirementIncome = Math.max(0, principal - deduction) / 2;
    var lumpIncomeTax = incomeTaxWithReconstruction(retirementIncome);
    var lumpResidentTax = retirementIncome * RESIDENT_TAX_RATE;
    var lumpTaxTotal = lumpIncomeTax + lumpResidentTax;
    var lumpNet = principal - lumpTaxTotal;

    // --- B: 年金（分割）で受け取る場合 ---
    var payment = annualAnnuityPayment(principal, annuityRate, payoutYears);
    var pensionTaxable = pensionTaxableIncome(payment, isOver65);
    var pensionIncomeTaxBase = Math.max(0, pensionTaxable - INCOME_BASIC_DEDUCTION);
    var pensionResidentTaxBase = Math.max(0, pensionTaxable - RESIDENT_BASIC_DEDUCTION);
    var pensionIncomeTax = incomeTaxWithReconstruction(pensionIncomeTaxBase);
    var pensionResidentTax = pensionResidentTaxBase * RESIDENT_TAX_RATE;
    var pensionTaxPerYear = pensionIncomeTax + pensionResidentTax;
    var netPayment = payment - pensionTaxPerYear;

    // 年ごとに推移をシミュレーション：Aは手取りを一括運用、Bは残りの年金原資を運用しつつ取り崩し、
    // 受け取った手取り分は都度再投資する。
    var seriesA = [{ year: 0, asset: lumpNet }];
    var seriesB = [{ year: 0, asset: principal }];
    var assetA = lumpNet;
    var balance = principal;
    var invested = 0;

    for (var k = 1; k <= payoutYears; k++) {
      assetA *= 1 + investRate;
      seriesA.push({ year: k, asset: assetA });

      balance = balance * (1 + annuityRate) - payment;
      if (balance < 0) balance = 0;
      invested += netPayment;
      invested *= 1 + investRate;
      seriesB.push({ year: k, asset: balance + invested });
    }

    var finalLumpAsset = assetA;
    var finalPensionAsset = balance + invested;
    var diff = finalLumpAsset - finalPensionAsset;

    els.lumpNet.textContent = manYen(lumpNet);
    els.lumpTax.textContent = manYen(lumpTaxTotal);
    var note = document.createElement("small");
    note.textContent = "（税引前 " + manYen(payment) + "）";
    els.pensionYearly.replaceChildren(
      document.createTextNode(manYen(netPayment)),
      document.createElement("br"),
      note
    );
    els.finalLump.textContent = manYen(finalLumpAsset);
    els.finalPension.textContent = manYen(finalPensionAsset);
    els.pensionTaxTotal.textContent = manYen(pensionTaxPerYear * payoutYears);
    els.deductionAmount.textContent = manYen(deduction);

    if (overlapResult.applied) {
      var overlapAmountNote = "";
      if (overlapResult.otherEffectiveYears < Number(els.overlapServiceYears.value)) {
        overlapAmountNote =
          "他の一時金の受取額が少ないため、重複期間の算定では勤続（拠出）年数を実際の" +
          els.overlapServiceYears.value + "年ではなく" + overlapResult.otherEffectiveYears +
          "年とみなしています（所得税法施行令第70条第2項）。";
      }
      els.overlapNote.textContent =
        "重複期間（" + overlapResult.overlapYears + "年分）の控除額 " + manYen(overlapResult.reduction) +
        " が差し引かれています（調整前の退職所得控除額：" + manYen(retirementDeduction(serviceYears)) + "）。" +
        overlapAmountNote;
    } else if (overlapEnabled) {
      els.overlapNote.textContent =
        "入力された条件では受け取り時期の間隔が" + overlapResult.threshold + "年を超えているため、控除額の調整は発生しません。";
    } else {
      els.overlapNote.textContent = "";
    }

    if (Math.abs(diff) < 1) {
      els.verdict.textContent = "どちらの受け取り方でもほぼ同じ試算結果です";
      els.verdictSub.textContent = "";
    } else if (diff > 0) {
      els.verdict.textContent = "この条件では「一時金」で受け取る方が " + manYen(diff) + " 有利です";
      els.verdictSub.textContent =
        "退職所得控除と1/2課税により税負担が軽く、手取り額を早期に運用へ回せることが主な理由です。";
    } else {
      els.verdict.textContent = "この条件では「年金」で受け取る方が " + manYen(-diff) + " 有利です";
      els.verdictSub.textContent =
        "据置期間中の運用利率が高い、または再投資の利回りが低い場合に年金方式が有利になりやすい傾向があります。";
    }

    var labels = seriesA.map(function (d) { return d.year + "年"; });
    var dataA = seriesA.map(function (d) { return Math.round(d.asset); });
    var dataB = seriesB.map(function (d) { return Math.round(d.asset); });

    var ctx = document.getElementById("taishokukin-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "A：一時金の手取りを運用",
          data: dataA,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "B：年金受け取り＋手取りを再投資",
          data: dataB,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
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
    if (window.renderChartDataTable) window.renderChartDataTable("taishokukin-growthDataTable", chart);
  }

  [
    els.amount,
    els.serviceYears,
    els.payoutYears,
    els.ageGroup,
    els.annuityRate,
    els.investRate,
    els.overlapEnable,
    els.overlapType,
    els.overlapYear,
    els.overlapServiceYears,
    els.overlapAmount,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

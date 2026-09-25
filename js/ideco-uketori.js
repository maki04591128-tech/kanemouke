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
    amount: document.getElementById("uketori-amount"),
    contribYears: document.getElementById("uketori-contribYears"),
    contribYearsOut: document.getElementById("uketori-contribYearsOut"),
    payoutYears: document.getElementById("uketori-payoutYears"),
    payoutYearsOut: document.getElementById("uketori-payoutYearsOut"),
    ageGroup: document.getElementById("uketori-ageGroup"),
    annuityRate: document.getElementById("uketori-annuityRate"),
    annuityRateOut: document.getElementById("uketori-annuityRateOut"),
    investRate: document.getElementById("uketori-investRate"),
    investRateOut: document.getElementById("uketori-investRateOut"),
    lumpRatio: document.getElementById("uketori-lumpRatio"),
    lumpRatioOut: document.getElementById("uketori-lumpRatioOut"),
    overlapEnable: document.getElementById("uketori-overlapEnable"),
    overlapFields: document.getElementById("uketori-overlapFields"),
    overlapType: document.getElementById("uketori-overlapType"),
    overlapYear: document.getElementById("uketori-overlapYear"),
    overlapServiceYears: document.getElementById("uketori-overlapServiceYears"),
    overlapAmount: document.getElementById("uketori-overlapAmount"),
    verdict: document.getElementById("uketori-verdict"),
    verdictSub: document.getElementById("uketori-verdictSub"),
    finalLump: document.getElementById("uketori-result-final-lump"),
    finalPension: document.getElementById("uketori-result-final-pension"),
    finalMix: document.getElementById("uketori-result-final-mix"),
    deductionAmount: document.getElementById("uketori-deduction-amount"),
    deductionUsed: document.getElementById("uketori-deduction-used"),
    overlapNote: document.getElementById("uketori-overlap-note"),
  };

  var THIS_YEAR = new Date().getFullYear();

  var chart = null;

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

  // 退職所得控除額（iDeCoの加入者等期間に応じた速算表。企業の退職一時金と共通の速算表を使用）
  function retirementDeduction(years) {
    var y = Math.max(1, Math.round(years));
    if (y <= 20) return Math.max(800000, y * 400000);
    return 8000000 + (y - 20) * 700000;
  }

  // 前の退職一時金（勤務先の退職金）の受取額が、重複を考慮しない場合の退職所得控除額に満たないとき
  // の追加調整（所得税法施行令第70条第2項）。この場合、前の一時金の勤続年数の全期間ではなく、受取額
  // を基に逆算した年数（800万円以下なら受取額÷40万円、800万円超なら(受取額-800万円)÷70万円+20）
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

  // 他の退職一時金を先に受け取り、その後iDeCo等の老齢一時金を一時金として受け取る場合の
  // 退職所得控除額の調整（所得税法施行令第70条第1項第2号ロ・ハ）。他の一時金の種類によって
  // 対象となる受け取り間隔が異なる：(1)勤務先の退職金（一般の退職手当等）が前の一時金の場合は
  // 前年以前19年内（ハ）、(2)他の確定拠出年金（企業型DCなど）の老齢一時金が前の一時金の場合は
  // 前年以前9年内（令和8年1月1日以後に受け取ったものに限る。それより前に受け取ったものは
  // 従来どおり前年以前4年内）（ロ）。重複期間は、双方の勤続（拠出）年数のうち短い方（前の
  // 一時金側は上記の逆算調整後の年数）とみなして簡易的に算出する。
  function overlapAdjustedDeduction(baseYears, enabled, otherType, otherYear, otherServiceYears, otherAmount) {
    var baseDeduction = retirementDeduction(baseYears);
    var threshold = otherType === "dc" ? (otherYear >= 2026 ? 9 : 4) : 19;
    var result = {
      deduction: baseDeduction,
      reduction: 0,
      overlapYears: 0,
      otherEffectiveYears: otherServiceYears,
      applied: false,
      threshold: threshold,
    };
    if (!enabled) return result;

    var gap = THIS_YEAR - otherYear;
    if (gap < 1 || gap > threshold) return result;
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

  // 元本を年利rでN年かけて均等に取り崩す場合の毎年の受取額（年金現価方式）
  function annualAnnuityPayment(principal, rate, years) {
    if (principal <= 0) return 0;
    if (rate === 0) return principal / years;
    return (principal * rate) / (1 - Math.pow(1 + rate, -years));
  }

  // ratio（一時金として受け取る割合 0〜1）を指定して、退職所得控除は一時金部分にのみ適用する
  // iDeCoの実際の受け取りルールに沿って一括計算する
  function computeScenario(principal, ratio, deduction, payoutYears, annuityRate, investRate, isOver65) {
    var lumpAmount = principal * ratio;
    var retirementIncome = Math.max(0, lumpAmount - deduction) / 2;
    var lumpTaxTotal = incomeTaxWithReconstruction(retirementIncome) + retirementIncome * RESIDENT_TAX_RATE;
    var lumpNet = lumpAmount - lumpTaxTotal;

    var pensionPrincipal = principal - lumpAmount;
    var payment = annualAnnuityPayment(pensionPrincipal, annuityRate, payoutYears);
    var pensionTaxable = pensionTaxableIncome(payment, isOver65);
    var pensionIncomeTaxBase = Math.max(0, pensionTaxable - INCOME_BASIC_DEDUCTION);
    var pensionResidentTaxBase = Math.max(0, pensionTaxable - RESIDENT_BASIC_DEDUCTION);
    var pensionTaxPerYear =
      incomeTaxWithReconstruction(pensionIncomeTaxBase) + pensionResidentTaxBase * RESIDENT_TAX_RATE;
    var netPayment = Math.max(0, payment - pensionTaxPerYear);

    var series = [{ year: 0, asset: lumpNet + pensionPrincipal }];
    var lumpAsset = lumpNet;
    var balance = pensionPrincipal;
    var invested = 0;

    for (var k = 1; k <= payoutYears; k++) {
      lumpAsset *= 1 + investRate;
      balance = balance * (1 + annuityRate) - payment;
      if (balance < 0) balance = 0;
      invested += netPayment;
      invested *= 1 + investRate;
      series.push({ year: k, asset: lumpAsset + balance + invested });
    }

    return {
      lumpAmount: lumpAmount,
      lumpNet: lumpNet,
      lumpTaxTotal: lumpTaxTotal,
      deductionUsed: Math.min(lumpAmount, deduction),
      netPayment: netPayment,
      finalAsset: series[series.length - 1].asset,
      series: series,
    };
  }

  function render() {
    var amountMan = Math.max(0, Number(els.amount.value) || 0);
    var principal = amountMan * 10000;
    var contribYears = Number(els.contribYears.value);
    var payoutYears = Number(els.payoutYears.value);
    var isOver65 = els.ageGroup.value === "65";
    var annuityRatePct = Number(els.annuityRate.value);
    var investRatePct = Number(els.investRate.value);
    var lumpRatioPct = Number(els.lumpRatio.value);

    els.contribYearsOut.textContent = contribYears + " 年";
    els.payoutYearsOut.textContent = payoutYears + " 年";
    els.annuityRateOut.textContent = annuityRatePct.toFixed(1) + " %";
    els.investRateOut.textContent = investRatePct.toFixed(1) + " %";
    els.lumpRatioOut.textContent = lumpRatioPct + " %";

    var annuityRate = annuityRatePct / 100;
    var investRate = investRatePct / 100;
    var lumpRatio = lumpRatioPct / 100;

    var overlapEnabled = els.overlapEnable.value === "yes";
    els.overlapFields.hidden = !overlapEnabled;
    var overlapResult = overlapAdjustedDeduction(
      contribYears,
      overlapEnabled,
      els.overlapType.value,
      Number(els.overlapYear.value),
      Number(els.overlapServiceYears.value),
      Math.max(0, Number(els.overlapAmount.value) || 0) * 10000
    );
    var deduction = overlapResult.deduction;

    var scenarioLump = computeScenario(principal, 1, deduction, payoutYears, annuityRate, investRate, isOver65);
    var scenarioPension = computeScenario(principal, 0, deduction, payoutYears, annuityRate, investRate, isOver65);
    var scenarioMix = computeScenario(principal, lumpRatio, deduction, payoutYears, annuityRate, investRate, isOver65);

    els.finalLump.textContent = manYen(scenarioLump.finalAsset);
    els.finalPension.textContent = manYen(scenarioPension.finalAsset);
    els.finalMix.textContent = manYen(scenarioMix.finalAsset);
    els.deductionAmount.textContent = manYen(deduction);
    els.deductionUsed.textContent = manYen(scenarioMix.deductionUsed);

    if (overlapResult.applied) {
      var overlapAmountNote = "";
      if (overlapResult.otherEffectiveYears < Number(els.overlapServiceYears.value)) {
        overlapAmountNote =
          "先に受け取った一時金の額が少ないため、重複期間の算定では勤続（拠出）年数を実際の" +
          els.overlapServiceYears.value + "年ではなく" + overlapResult.otherEffectiveYears +
          "年とみなしています（所得税法施行令第70条第2項）。";
      }
      els.overlapNote.textContent =
        "重複期間（" + overlapResult.overlapYears + "年分）の控除額 " + manYen(overlapResult.reduction) +
        " が差し引かれています（調整前の退職所得控除額：" + manYen(retirementDeduction(contribYears)) + "）。" +
        overlapAmountNote;
    } else if (overlapEnabled) {
      els.overlapNote.textContent =
        "入力された条件では受け取り時期の間隔が" + overlapResult.threshold + "年を超えているため、控除額の調整は発生しません。";
    } else {
      els.overlapNote.textContent = "";
    }

    var scenarios = [
      { name: "全額一時金", asset: scenarioLump.finalAsset },
      { name: "全額年金", asset: scenarioPension.finalAsset },
      { name: "併用（一時金 " + lumpRatioPct + "%）", asset: scenarioMix.finalAsset },
    ];
    scenarios.sort(function (a, b) { return b.asset - a.asset; });
    var best = scenarios[0];
    var second = scenarios[1];
    var diff = best.asset - second.asset;

    if (diff < 1) {
      els.verdict.textContent = "3パターンともほぼ同じ試算結果です";
      els.verdictSub.textContent = "";
    } else {
      els.verdict.textContent = "この条件では「" + best.name + "」が最も有利です（次点との差 " + manYen(diff) + "）";
      els.verdictSub.textContent =
        "退職所得控除は一時金として受け取る金額にのみ適用されるため、控除額（" + manYen(deduction) +
        "）を使い切る範囲で一時金を受け取り、残りを年金にすると税負担を抑えやすくなります。";
    }

    var labels = scenarioLump.series.map(function (d) { return d.year + "年"; });
    var data = {
      labels: labels,
      datasets: [
        {
          label: "全額一時金",
          data: scenarioLump.series.map(function (d) { return Math.round(d.asset); }),
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "全額年金",
          data: scenarioPension.series.map(function (d) { return Math.round(d.asset); }),
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "併用",
          data: scenarioMix.series.map(function (d) { return Math.round(d.asset); }),
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          fill: false,
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
            label: function (ctx) { return ctx.dataset.label + "：" + manYen(ctx.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(document.getElementById("uketori-growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("uketori-growthDataTable", chart);
  }

  [
    els.amount,
    els.contribYears,
    els.payoutYears,
    els.ageGroup,
    els.annuityRate,
    els.investRate,
    els.lumpRatio,
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

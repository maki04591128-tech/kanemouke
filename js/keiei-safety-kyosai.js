(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var CONTRIBUTION_CAP = 8000000; // 経営セーフティ共済の掛金積立限度額（800万円）
  var BUSINESS_TAX_DEDUCTION = 2900000; // 個人事業税の事業主控除（年290万円）
  var SME_CAPITAL_THRESHOLD = 100000000; // 中小法人向け軽減税率の対象となる資本金の上限（1億円）
  var CORP_RATE_TIER1 = 0.2137; // 資本金1億円以下・課税所得400万円以下の法定実効税率の目安（東京都特別区・標準税率）
  var CORP_RATE_TIER2 = 0.2317; // 資本金1億円以下・課税所得400万円超800万円以下の法定実効税率の目安
  var CORP_RATE_STANDARD = 0.3358; // 課税所得800万円超（または資本金1億円超）の法定実効税率の目安

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

  // 解約手当金の支給率（中小機構公表の解約手当金支給率表）。
  // 任意解約・みなし解散等・機構解約で支給率が異なり、40カ月以上納付した場合の
  // 任意解約・みなし解散等は掛金全額（100%）が返ってくる。機構解約（掛金未払い等による
  // 機構側からの解約）は最も支給率が低い。
  var CANCEL_RATIO_TABLE = {
    voluntary: [0.80, 0.85, 0.90, 0.95, 1.00],
    deemed: [0.85, 0.90, 0.95, 1.00, 1.00],
    forced: [0.75, 0.80, 0.85, 0.90, 0.95],
  };
  var CANCEL_TYPE_LABEL = {
    voluntary: "任意解約（自己都合でやめる場合）",
    deemed: "みなし解散等（事業譲渡・death・個人事業主の死亡など）",
    forced: "機構解約（掛金の未払いなど機構側からの解約）",
  };

  var els = {
    monthly: document.getElementById("safety-monthly"),
    monthlyOut: document.getElementById("safety-monthlyOut"),
    years: document.getElementById("safety-years"),
    yearsOut: document.getElementById("safety-yearsOut"),
    entityType: document.getElementById("safety-entityType"),
    incomeRow: document.getElementById("safety-incomeRow"),
    incomeEntry: document.getElementById("safety-incomeEntry"),
    incomeExit: document.getElementById("safety-incomeExit"),
    bizTaxRate: document.getElementById("safety-bizTaxRate"),
    rateRow: document.getElementById("safety-rateRow"),
    corpRateMode: document.getElementById("safety-corpRateMode"),
    corpAutoRow: document.getElementById("safety-corpAutoRow"),
    capital: document.getElementById("safety-capital"),
    corpIncomeEntry: document.getElementById("safety-corpIncomeEntry"),
    corpIncomeExit: document.getElementById("safety-corpIncomeExit"),
    rateEntry: document.getElementById("safety-rateEntry"),
    rateEntryOut: document.getElementById("safety-rateEntryOut"),
    rateExit: document.getElementById("safety-rateExit"),
    rateExitOut: document.getElementById("safety-rateExitOut"),
    cancelType: document.getElementById("safety-cancelType"),
    capNote: document.getElementById("safety-capNote"),
    chartLegendRefund: document.getElementById("safety-chart-legend-refund"),
    verdict: document.getElementById("safety-verdict"),
    verdictSub: document.getElementById("safety-verdictSub"),
    annualSaving: document.getElementById("safety-result-annual-saving"),
    totalSaving: document.getElementById("safety-result-total-saving"),
    principal: document.getElementById("safety-result-principal"),
    refund: document.getElementById("safety-result-refund"),
    netCost: document.getElementById("safety-result-net-cost"),
    netPayout: document.getElementById("safety-result-net-payout"),
    netBenefit: document.getElementById("safety-result-net-benefit"),
    tableBody: document.getElementById("safety-breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function signedManYen(n) {
    return (n >= 0 ? "+" : "") + manYen(n);
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

  // 事業所得が事業主控除（290万円）を超える場合のみ課される個人事業税。超えた部分に税率を掛ける近似。
  function businessTaxRate(taxable, bizRatePct) {
    if (taxable <= BUSINESS_TAX_DEDUCTION || bizRatePct <= 0) return 0;
    return bizRatePct / 100;
  }

  // 所得税の限界税率（復興特別所得税2.1%を加味）＋住民税率10%＋個人事業税率（対象業種・290万円超の場合）を合わせた、個人事業主の実効税率の近似値
  function combinedMarginalRate(taxable, bizRatePct) {
    var rate = marginalIncomeTaxRate(taxable);
    return rate * (1 + RECONSTRUCTION_TAX_RATE) + RESIDENT_TAX_RATE + businessTaxRate(taxable, bizRatePct);
  }

  // 資本金と年間課税所得から、法人税・地方法人税・法人事業税等を合計した法定実効税率の目安（%）を算出する。
  // 資本金1億円以下の中小法人は年800万円以下の所得部分に軽減税率が適用され、東京都特別区・標準税率を前提にすると
  // 課税所得400万円以下は約21.37%、400万円超800万円以下は約23.17%、800万円超（または資本金1億円超）は約33.58%となる。
  function corpEffectiveRatePct(capital, taxable) {
    var isSme = capital <= SME_CAPITAL_THRESHOLD;
    if (isSme && taxable <= 4000000) return CORP_RATE_TIER1 * 100;
    if (isSme && taxable <= 8000000) return CORP_RATE_TIER2 * 100;
    return CORP_RATE_STANDARD * 100;
  }

  function cancellationPayoutRatio(months, cancelType) {
    var m = Math.max(0, Math.round(months));
    if (m <= 11) return 0;
    var bands = CANCEL_RATIO_TABLE[cancelType] || CANCEL_RATIO_TABLE.voluntary;
    if (m <= 23) return bands[0];
    if (m <= 29) return bands[1];
    if (m <= 35) return bands[2];
    if (m <= 39) return bands[3];
    return bands[4];
  }

  // 積立限度額（800万円）に達する月数を踏まえた、実際に掛金を払い込める月数
  function contributionMonths(monthly, requestedMonths) {
    if (monthly <= 0) return 0;
    var capMonths = Math.floor(CONTRIBUTION_CAP / monthly);
    return Math.max(0, Math.min(requestedMonths, capMonths));
  }

  // 1年ごとの累計掛金額と、その時点で解約した場合の解約手当金額を計算する
  function simulateSchedule(monthly, totalMonths, cancelType) {
    var yearly = [];
    var contributed = 0;
    for (var m = 1; m <= totalMonths; m++) {
      contributed += monthly;
      if (m % 12 === 0) {
        yearly.push({
          months: m,
          year: m / 12,
          contribution: contributed,
          refund: contributed * cancellationPayoutRatio(m, cancelType),
        });
      }
    }
    if (totalMonths > 0 && totalMonths % 12 !== 0) {
      yearly.push({
        months: totalMonths,
        year: totalMonths / 12,
        contribution: contributed,
        refund: contributed * cancellationPayoutRatio(totalMonths, cancelType),
      });
    }
    if (yearly.length === 0) {
      yearly.push({ months: 0, year: 0, contribution: 0, refund: 0 });
    }
    return yearly;
  }

  function updateEntityVisibility() {
    var isCorp = els.entityType.value === "corp";
    els.incomeRow.style.display = isCorp ? "none" : "";
    els.rateRow.style.display = isCorp ? "" : "none";
    updateCorpRateModeVisibility();
  }

  function updateCorpRateModeVisibility() {
    var isAuto = els.corpRateMode.value === "auto";
    els.corpAutoRow.style.display = isAuto ? "" : "none";
    els.rateEntry.disabled = isAuto;
    els.rateExit.disabled = isAuto;
  }

  function render() {
    var monthly = clampNonNegative(els.monthly.value);
    var years = Number(els.years.value);
    var entityType = els.entityType.value;
    var cancelType = els.cancelType.value;

    els.monthlyOut.textContent = yen(monthly);
    els.yearsOut.textContent = years + " 年";

    var entryRate, exitRate;
    if (entityType === "corp") {
      var isAutoCorpRate = els.corpRateMode.value === "auto";
      var rateEntryPct, rateExitPct;
      if (isAutoCorpRate) {
        var capital = clampNonNegative(els.capital.value);
        var corpIncomeEntry = clampNonNegative(els.corpIncomeEntry.value);
        var corpIncomeExit = clampNonNegative(els.corpIncomeExit.value);
        rateEntryPct = corpEffectiveRatePct(capital, corpIncomeEntry);
        rateExitPct = corpEffectiveRatePct(capital, corpIncomeExit);
        // スライダーの目盛りはstep幅（0.5）に合わせて最も近い値へスナップされるため見た目用のみに使い、
        // 実際の節税額等の計算・表示には上記のスナップ前の値（rateEntryPct/rateExitPct）を使う。
        els.rateEntry.value = rateEntryPct;
        els.rateExit.value = rateExitPct;
      } else {
        rateEntryPct = Number(els.rateEntry.value);
        rateExitPct = Number(els.rateExit.value);
      }
      var corpRateSuffix = isAutoCorpRate ? " %（自動算出）" : " %";
      els.rateEntryOut.textContent = rateEntryPct.toFixed(isAutoCorpRate ? 2 : 1) + corpRateSuffix;
      els.rateExitOut.textContent = rateExitPct.toFixed(isAutoCorpRate ? 2 : 1) + corpRateSuffix;
      entryRate = rateEntryPct / 100;
      exitRate = rateExitPct / 100;
    } else {
      var incomeEntry = clampNonNegative(els.incomeEntry.value);
      var incomeExit = clampNonNegative(els.incomeExit.value);
      var bizRatePct = Number(els.bizTaxRate.value) || 0;
      entryRate = combinedMarginalRate(incomeEntry, bizRatePct);
      exitRate = combinedMarginalRate(incomeExit, bizRatePct);
    }

    var requestedMonths = Math.round(years * 12);
    var months = contributionMonths(monthly, requestedMonths);
    var capped = months < requestedMonths;

    var totalContribution = monthly * months;
    var payoutRatio = cancellationPayoutRatio(months, cancelType);
    var refund = totalContribution * payoutRatio;
    var shortfall = Math.max(0, totalContribution - refund);

    var annualSaving = monthly * 12 * entryRate;
    var totalSaving = totalContribution * entryRate;
    var netCost = totalContribution - totalSaving;
    var taxOnRefund = refund * exitRate;
    var netPayout = refund - taxOnRefund;
    // 累計節税額（先送り額）－解約時の税額－元本割れ額＝出口まで含めた実質的な損益
    var netBenefit = totalSaving - taxOnRefund - shortfall;

    els.capNote.textContent = capped
      ? "積立限度額（800万円）に達するため、実際の掛金払い込みは" + Math.floor(months / 12) + "年" + (months % 12) + "カ月（" + months + "カ月）で終了する前提で試算しています。"
      : "";

    els.annualSaving.textContent = yen(annualSaving);
    els.totalSaving.textContent = manYen(totalSaving);
    els.principal.textContent = manYen(totalContribution);
    els.refund.textContent = manYen(refund);
    els.netCost.textContent = manYen(netCost);
    els.netPayout.textContent = manYen(netPayout);
    els.netBenefit.textContent = signedManYen(netBenefit);
    els.chartLegendRefund.textContent = "解約した場合の解約手当金の目安（" + CANCEL_TYPE_LABEL[cancelType] + "）";

    var epsilon = Math.max(1000, totalContribution * 0.001);
    if (months < 12) {
      els.verdict.textContent = "掛金納付月数が12カ月未満のため、解約手当金は支給されません（掛け捨てです）";
      els.verdictSub.textContent = "経営セーフティ共済は加入から12カ月以上掛金を納付しないと、解約時に一切受け取れません。";
    } else {
      if (netBenefit > epsilon) {
        els.verdict.textContent = "出口（解約時）の実効税率が加入時より低いため、実質的な節税効果は " + manYen(netBenefit) + " の見込みです";
      } else if (netBenefit < -epsilon) {
        els.verdict.textContent = "出口（解約時）の実効税率が加入時より高いため、実質的に " + manYen(Math.abs(netBenefit)) + " の負担増になる見込みです";
      } else {
        els.verdict.textContent = "加入時と解約時の実効税率が同じ場合、税金を先送りするだけで実質的な節税効果はゼロの見込みです";
      }
      els.verdictSub.textContent = shortfall > 0
        ? "掛金納付" + months + "カ月・" + CANCEL_TYPE_LABEL[cancelType] + "の支給率は " + (payoutRatio * 100).toFixed(2) + "% のため、" + manYen(shortfall) + " の元本割れもあわせて発生します。"
        : "掛金納付" + months + "カ月・" + CANCEL_TYPE_LABEL[cancelType] + "の支給率は " + (payoutRatio * 100).toFixed(2) + "% で、元本割れは発生しません。解約時に受け取る金額は全額が収益として課税される点に注意してください。";
    }

    var rows = [["事業形態", entityType === "corp" ? "法人" : "個人事業主"]];
    if (entityType === "corp") {
      if (isAutoCorpRate) {
        var capitalForRows = clampNonNegative(els.capital.value);
        rows.push(["資本金", yen(capitalForRows)]);
        rows.push(["中小法人向け軽減税率の適用", capitalForRows <= SME_CAPITAL_THRESHOLD ? "あり（資本金1億円以下）" : "なし（資本金1億円超のため標準税率のみ）"]);
        rows.push(["加入時の年間課税所得の目安", yen(clampNonNegative(els.corpIncomeEntry.value))]);
        rows.push(["加入時の実効税率（自動算出）", rateEntryPct.toFixed(2) + " %"]);
        rows.push(["解約する年度の年間課税所得の目安", yen(clampNonNegative(els.corpIncomeExit.value))]);
        rows.push(["解約時の実効税率（自動算出）", rateExitPct.toFixed(2) + " %"]);
      } else {
        rows.push(["加入時の実効税率（想定）", Number(els.rateEntry.value).toFixed(1) + " %"]);
        rows.push(["解約時の実効税率（想定）", Number(els.rateExit.value).toFixed(1) + " %"]);
      }
    } else {
      var bizRatePctForRows = Number(els.bizTaxRate.value) || 0;
      rows.push(["加入時の事業の課税所得の目安", yen(clampNonNegative(els.incomeEntry.value))]);
      rows.push(["加入時の実効税率（所得税＋住民税＋個人事業税）", (entryRate * 100).toFixed(1) + " %"]);
      rows.push(["解約する年の事業の課税所得の目安", yen(clampNonNegative(els.incomeExit.value))]);
      rows.push(["解約時の実効税率（所得税＋住民税＋個人事業税）", (exitRate * 100).toFixed(1) + " %"]);
      rows.push(["個人事業税率の設定", bizRatePctForRows > 0 ? bizRatePctForRows.toFixed(0) + "%（事業所得290万円超の部分に適用）" : "考慮しない"]);
    }
    rows.push(["掛金月額", yen(monthly)]);
    rows.push(["加入年数（設定値）", years + " 年"]);
    rows.push(["実際の掛金払込月数", months + " カ月" + (capped ? "（積立限度額800万円に到達）" : "")]);
    rows.push(["掛金累計額（元本）", manYen(totalContribution)]);
    rows.push(["解約の種類", CANCEL_TYPE_LABEL[cancelType]]);
    rows.push(["解約手当金の支給率", (payoutRatio * 100).toFixed(2) + " %"]);
    rows.push(["解約手当金の額（支給率適用後）", manYen(refund)]);
    rows.push(shortfall > 0 ? ["元本割れ額（掛金累計－解約手当金）", manYen(shortfall)] : ["元本割れ", "なし"]);
    rows.push(["加入期間中の累計節税額（税金の先送り額）", manYen(totalSaving)]);
    rows.push(["実質負担額（掛金累計－累計節税額）", manYen(netCost)]);
    rows.push(["解約時の税額（解約手当金は全額課税対象）", manYen(taxOnRefund)]);
    rows.push(["解約時の手取り額", manYen(netPayout)]);
    rows.push(["出口まで含めた実質的な損益", signedManYen(netBenefit)]);

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var schedule = simulateSchedule(monthly, months, cancelType);
    var labels = schedule.map(function (d) { return d.year + "年"; });
    var contributionData = schedule.map(function (d) { return Math.round(d.contribution); });
    var refundData = schedule.map(function (d) { return Math.round(d.refund); });

    var ctx = document.getElementById("safety-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: els.chartLegendRefund.textContent,
          data: refundData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "掛金（累計拠出額）",
          data: contributionData,
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
    if (window.renderChartDataTable) window.renderChartDataTable("safety-growthDataTable", chart);
  }

  els.entityType.addEventListener("change", function () {
    updateEntityVisibility();
    render();
  });
  els.corpRateMode.addEventListener("change", function () {
    updateCorpRateModeVisibility();
    render();
  });
  [els.monthly, els.years, els.incomeEntry, els.incomeExit, els.bizTaxRate, els.capital, els.corpIncomeEntry, els.corpIncomeExit, els.rateEntry, els.rateExit, els.cancelType].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  updateEntityVisibility();
  render();
})();

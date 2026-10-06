(function () {
  "use strict";

  var els = {
    monthly: document.getElementById("gakushi-monthly"),
    years: document.getElementById("gakushi-years"),
    yearsOut: document.getElementById("gakushi-yearsOut"),
    returnRate: document.getElementById("gakushi-returnRate"),
    returnRateOut: document.getElementById("gakushi-returnRateOut"),
    nisaRate: document.getElementById("gakushi-nisaRate"),
    nisaRateOut: document.getElementById("gakushi-nisaRateOut"),
    costPct: document.getElementById("gakushi-costPct"),
    costPctOut: document.getElementById("gakushi-costPctOut"),
    costNote: document.getElementById("gakushi-costNote"),
    lifeDeductionEnable: document.getElementById("gakushi-lifeDeductionEnable"),
    lifeDeductionFields: document.getElementById("gakushi-lifeDeductionFields"),
    lifeTaxRate: document.getElementById("gakushi-lifeTaxRate"),
    verdict: document.getElementById("gakushi-verdict"),
    verdictSub: document.getElementById("gakushi-verdictSub"),
    resultPrincipal: document.getElementById("gakushi-result-principal"),
    resultHoken: document.getElementById("gakushi-result-hoken"),
    resultNisa: document.getElementById("gakushi-result-nisa"),
    resultDiff: document.getElementById("gakushi-result-diff"),
    resultTaxBenefitCard: document.getElementById("gakushi-result-taxBenefit-card"),
    resultHokenEffective: document.getElementById("gakushi-result-hokenEffective"),
    breakdownBody: document.getElementById("gakushi-breakdown-body"),
  };

  var chart = null;

  // 生命保険料控除（新制度）区分ごとの計算。学資保険は通常「一般生命保険料控除」の1区分のみに該当する前提の簡易版。
  var LIFE_INCOME_CATEGORY_CAP = 40000;
  var LIFE_RESIDENT_CATEGORY_CAP = 28000;
  var RESIDENT_TAX_RATE = 0.10;

  function lifeDeductionIncome(premium) {
    if (premium <= 0) return 0;
    if (premium <= 20000) return premium;
    if (premium <= 40000) return premium / 2 + 10000;
    if (premium <= 80000) return premium / 4 + 20000;
    return LIFE_INCOME_CATEGORY_CAP;
  }

  function lifeDeductionResident(premium) {
    if (premium <= 0) return 0;
    if (premium <= 12000) return premium;
    if (premium <= 32000) return premium / 2 + 6000;
    if (premium <= 56000) return premium / 4 + 14000;
    return LIFE_RESIDENT_CATEGORY_CAP;
  }

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // つみたてNISA：毎月一定額を積み立て、月次複利で運用（運用益は非課税）。
  function simulateNisa(monthly, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var months = Math.round(years * 12);
    var balance = 0;
    var principal = 0;
    var yearly = [{ year: 0, balance: 0, principal: 0 }];

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

    return { balance: balance, principal: principal, yearly: yearly };
  }

  function render() {
    var monthlyMan = Math.max(0, Number(els.monthly.value) || 0);
    var monthly = monthlyMan * 10000;
    var years = Number(els.years.value);
    var returnRatePct = Number(els.returnRate.value);
    var nisaRatePct = Number(els.nisaRate.value);
    var costPct = Math.max(0, Number(els.costPct.value) || 0);
    var netNisaRatePct = nisaRatePct - costPct;

    els.yearsOut.textContent = years + " 年";
    els.returnRateOut.textContent = returnRatePct.toFixed(1) + " %";
    els.nisaRateOut.textContent = nisaRatePct.toFixed(1) + " %";
    els.costPctOut.textContent = costPct.toFixed(1) + " %";

    els.costNote.textContent = costPct > 0
      ? "運用コスト" + costPct.toFixed(1) + "%を差し引いた年率" + netNisaRatePct.toFixed(1) + "%で運用する前提で試算しています。"
      : "";

    var lifeDeductionEnabled = els.lifeDeductionEnable.value === "yes";
    els.lifeDeductionFields.hidden = !lifeDeductionEnabled;
    var lifeTaxRatePct = Number(els.lifeTaxRate.value);

    var principal = monthly * 12 * years;
    var hokenPayout = principal * (returnRatePct / 100);

    var annualPremium = monthly * 12;
    var annualLifeIncomeDed = lifeDeductionIncome(annualPremium);
    var annualLifeResidentDed = lifeDeductionResident(annualPremium);
    var annualTaxBenefit = lifeDeductionEnabled
      ? annualLifeIncomeDed * (lifeTaxRatePct / 100) + annualLifeResidentDed * RESIDENT_TAX_RATE
      : 0;
    var totalTaxBenefit = annualTaxBenefit * years;
    var hokenEffective = hokenPayout + totalTaxBenefit;

    var nisa = simulateNisa(monthly, netNisaRatePct, years);
    var nisaFinal = nisa.balance;

    els.resultPrincipal.textContent = yen(principal);
    els.resultHoken.textContent = yen(hokenPayout);
    els.resultNisa.textContent = yen(nisaFinal);
    els.resultTaxBenefitCard.hidden = !lifeDeductionEnabled;
    if (lifeDeductionEnabled) {
      els.resultHokenEffective.textContent = yen(hokenEffective);
    }

    var diff = nisaFinal - hokenEffective;
    els.resultDiff.textContent = (diff >= 0 ? "+" : "") + manYen(diff) + "（NISA－学資保険）";

    if (Math.abs(diff) < 5000) {
      els.verdict.textContent = "この条件では受取額にほとんど差がありません";
      els.verdictSub.textContent = "想定利回りと返戻率が近い水準のため、金額だけを見ると優劣がつきにくい条件です。下記の「保障」の違いも踏まえて検討しましょう。";
    } else if (diff > 0) {
      els.verdict.textContent = "積立NISAが有利です（差額 " + manYen(diff) + "）";
      els.verdictSub.textContent = "ただし積立NISAの運用成果は市場変動により保証されていません。学資保険は運用成果に関わらず契約時に定めた返戻率どおりの受取額が確定している点が異なります。";
    } else {
      els.verdict.textContent = "学資保険が有利です（差額 " + manYen(-diff) + "）";
      els.verdictSub.textContent = "想定したNISAの利回りが低め、または学資保険の返戻率が高めの条件です。元本保証を重視する場合、学資保険が選択肢になりえます。";
    }

    if (returnRatePct < 100) {
      els.verdictSub.textContent += "　なお返戻率が100%を下回る条件は、保障を手厚くしたタイプなどで払込保険料より受取総額が少なくなる「元本割れ」を意味します。";
    }

    if (lifeDeductionEnabled) {
      els.verdictSub.textContent +=
        "　学資保険料にかかる生命保険料控除の軽減額（払込期間合計、概算 " + yen(totalTaxBenefit) + "）を学資保険側の受取額に加算して比較しています。";
    }

    els.breakdownBody.innerHTML =
      "<tr><td>毎月の払込・積立額</td><td colspan=\"2\">" + manYen(monthly) + "</td></tr>" +
      "<tr><td>払込・積立期間</td><td colspan=\"2\">" + years + " 年（" + (years * 12) + " 回）</td></tr>" +
      "<tr><td>払込・積立累計額（元本）</td><td>" + yen(principal) + "</td><td>" + yen(principal) + "</td></tr>" +
      "<tr><td>適用する率</td><td>返戻率 " + returnRatePct.toFixed(1) + " %</td><td>想定利回り 年 " + nisaRatePct.toFixed(1) + " %" + (costPct > 0 ? "－運用コスト " + costPct.toFixed(1) + " % ＝ 実効 " + netNisaRatePct.toFixed(1) + " %" : "") + "（複利）</td></tr>" +
      "<tr><td><strong>満期・運用終了時点の受取額</strong></td><td><strong>" + yen(hokenPayout) + "</strong></td><td><strong>" + yen(nisaFinal) + "</strong></td></tr>" +
      (lifeDeductionEnabled
        ? "<tr><td>生命保険料控除による軽減額（年間、所得税＋住民税の概算）</td><td colspan=\"2\">" + yen(annualTaxBenefit) + "</td></tr>" +
          "<tr><td>軽減額の払込期間合計（概算、学資保険側に加算）</td><td colspan=\"2\">" + yen(totalTaxBenefit) + "</td></tr>" +
          "<tr><td><strong>控除を考慮した実質受取額</strong></td><td><strong>" + yen(hokenEffective) + "</strong></td><td><strong>" + yen(nisaFinal) + "</strong></td></tr>"
        : "");

    var labels = nisa.yearly.map(function (d) { return d.year + "年"; });
    var hokenSeries = nisa.yearly.map(function () { return Math.round(hokenPayout); });
    var principalSeries = nisa.yearly.map(function (d) { return Math.round(d.principal); });
    var nisaSeries = nisa.yearly.map(function (d) { return Math.round(d.balance); });

    var data = {
      labels: labels,
      datasets: [
        {
          label: "積立NISA 評価額",
          data: nisaSeries,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "学資保険 満期受取額（参考・返戻率どおり確定）",
          data: hokenSeries,
          borderColor: "#d98e04",
          borderDash: [6, 4],
          backgroundColor: "rgba(217, 142, 4, 0.08)",
          fill: false,
          tension: 0,
          pointRadius: 0,
        },
        {
          label: "払込・積立累計額（元本）",
          data: principalSeries,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
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
      chart = new Chart(document.getElementById("gakushi-growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("gakushi-growthDataTable", chart);
  }

  [els.monthly, els.years, els.returnRate, els.nisaRate, els.costPct, els.lifeDeductionEnable, els.lifeTaxRate].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

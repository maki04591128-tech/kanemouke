(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var COMBINED_CAP_EMPLOYEE = 55000;
  var NISA_MONTHLY_CAP = 300000; // つみたて投資枠10万円+成長投資枠20万円（生涯枠の消化ペースは別ツールで試算）

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

  // 2024年12月の制度改正後の職業区分ごとの拠出限度額ルール（iDeCo拠出限度額シミュレーターと共通）
  var CATEGORIES = {
    self_employed: { label: "自営業者・フリーランス・学生（国民年金第1号被保険者）", baseCap: 68000, hasOffset: true, combinedCap: 68000 },
    employee_no_pension: { label: "会社員（お勤め先に企業年金制度がない）", baseCap: 23000, hasOffset: false },
    employee_dc_only: { label: "会社員（企業型DCのみ加入）", baseCap: 20000, hasOffset: true, combinedCap: COMBINED_CAP_EMPLOYEE },
    employee_db: { label: "会社員（DBに加入、またはDBと企業型DCの両方に加入）", baseCap: 20000, hasOffset: true, combinedCap: COMBINED_CAP_EMPLOYEE },
    civil_servant: { label: "公務員（国民年金第2号被保険者）", baseCap: 20000, hasOffset: true, combinedCap: COMBINED_CAP_EMPLOYEE },
    dependent_spouse: { label: "専業主婦・主夫（国民年金第3号被保険者）", baseCap: 23000, hasOffset: false },
    voluntary: { label: "国民年金任意加入被保険者（60歳以降の任意加入など）", baseCap: 68000, hasOffset: true, combinedCap: 68000 },
  };

  var els = {
    category: document.getElementById("yuusen-category"),
    offsetRow: document.getElementById("yuusen-offsetRow"),
    offsetAmount: document.getElementById("yuusen-offsetAmount"),
    budget: document.getElementById("yuusen-budget"),
    taxableIncome: document.getElementById("yuusen-taxableIncome"),
    rate: document.getElementById("yuusen-rate"),
    rateOut: document.getElementById("yuusen-rateOut"),
    years: document.getElementById("yuusen-years"),
    yearsOut: document.getElementById("yuusen-yearsOut"),
    liquidityNeed: document.getElementById("yuusen-liquidityNeed"),
    verdict: document.getElementById("yuusen-verdict"),
    verdictSub: document.getElementById("yuusen-verdictSub"),
    idecoCap: document.getElementById("yuusen-result-ideco-cap"),
    marginalRate: document.getElementById("yuusen-result-marginal-rate"),
    baseAsset: document.getElementById("yuusen-result-base-asset"),
    bonusAsset: document.getElementById("yuusen-result-bonus-asset"),
    splitBody: document.getElementById("yuusen-split-body"),
    compareBody: document.getElementById("yuusen-compare-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
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

  function calcIdecoMonthlyCap(category, offset) {
    if (!category.hasOffset) return category.baseCap;
    var remainingOfCombined = Math.max(0, category.combinedCap - offset);
    return Math.min(category.baseCap, remainingOfCombined);
  }

  function updateOffsetVisibility() {
    var category = CATEGORIES[els.category.value];
    els.offsetRow.style.display = category.hasOffset ? "" : "none";
  }

  // 毎月「積立→運用」の順で複利計算した、n年後の資産評価額
  function futureValue(monthlyContribution, monthlyRate, months) {
    var balance = 0;
    for (var m = 0; m < months; m++) {
      balance = (balance + monthlyContribution) * (1 + monthlyRate);
    }
    return balance;
  }

  // 毎年の節税額を、その年末にNISAへ上乗せ投資したと仮定した場合の、期間終了時点での増加分
  function reinvestedTaxSavingBonus(annualTaxSaving, annualRate, years) {
    if (annualTaxSaving <= 0) return 0;
    var bonus = 0;
    for (var y = 1; y <= years; y++) {
      bonus += annualTaxSaving * Math.pow(1 + annualRate, years - y);
    }
    return bonus;
  }

  var STRATEGIES = [
    {
      key: "idecoFirst",
      label: "iDeCo優先",
      note: "iDeCoの拠出上限まで先に埋め、残りをNISAに回す",
      split: function (budget, idecoCap) {
        var ideco = Math.min(budget, idecoCap);
        return { ideco: ideco, nisa: budget - ideco };
      },
    },
    {
      key: "nisaFirst",
      label: "NISA優先",
      note: "NISA（月30万円まで）を先に埋め、残りをiDeCoに回す",
      split: function (budget, idecoCap) {
        var nisa = Math.min(budget, NISA_MONTHLY_CAP);
        var ideco = Math.min(budget - nisa, idecoCap);
        return { ideco: ideco, nisa: budget - ideco };
      },
    },
    {
      key: "half",
      label: "半分ずつ",
      note: "毎月の投資可能額を半分に分け、iDeCoの上限を超える分はNISAに回す",
      split: function (budget, idecoCap) {
        var ideco = Math.min(budget / 2, idecoCap);
        return { ideco: ideco, nisa: budget - ideco };
      },
    },
  ];

  function render() {
    var categoryKey = els.category.value;
    var category = CATEGORIES[categoryKey];
    var offset = category.hasOffset ? clampNonNegative(els.offsetAmount.value) : 0;
    var idecoCap = calcIdecoMonthlyCap(category, offset);

    var budget = clampNonNegative(els.budget.value);
    var taxableIncome = clampNonNegative(els.taxableIncome.value);
    var ratePct = Number(els.rate.value);
    var years = Number(els.years.value);
    var liquidityNeed = els.liquidityNeed.value;

    els.rateOut.textContent = ratePct.toFixed(1) + " %";
    els.yearsOut.textContent = years + " 年";

    var marginalRate = marginalIncomeTaxRate(taxableIncome);
    var combinedRate = marginalRate + RESIDENT_TAX_RATE;
    var monthlyRate = ratePct / 100 / 12;
    var months = years * 12;

    els.idecoCap.textContent = yen(idecoCap) + " / 月";
    els.marginalRate.textContent = (combinedRate * 100).toFixed(0) + " %（所得税" + (marginalRate * 100).toFixed(0) + "%＋住民税10%）";

    var results = STRATEGIES.map(function (s) {
      var split = s.split(budget, idecoCap);
      var idecoBalance = futureValue(split.ideco, monthlyRate, months);
      var nisaBalance = futureValue(split.nisa, monthlyRate, months);
      var baseAsset = idecoBalance + nisaBalance;
      var annualTaxSaving = split.ideco * 12 * combinedRate;
      var totalTaxSavingSimple = annualTaxSaving * years;
      var bonus = reinvestedTaxSavingBonus(annualTaxSaving, ratePct / 100, years);
      return {
        strategy: s,
        split: split,
        idecoBalance: idecoBalance,
        nisaBalance: nisaBalance,
        baseAsset: baseAsset,
        annualTaxSaving: annualTaxSaving,
        totalTaxSavingSimple: totalTaxSavingSimple,
        bonus: bonus,
        finalAssetWithBonus: baseAsset + bonus,
      };
    });

    els.splitBody.innerHTML = results
      .map(function (item) {
        return (
          "<tr><td>" + item.strategy.label + "</td><td>" + yen(item.split.ideco) + "</td><td>" + yen(item.split.nisa) + "</td><td>" + item.strategy.note + "</td></tr>"
        );
      })
      .join("");

    els.compareBody.innerHTML = results
      .map(function (item) {
        return (
          "<tr><td>" +
          item.strategy.label +
          "</td><td>" +
          yen(item.baseAsset) +
          "</td><td>" +
          yen(item.annualTaxSaving) +
          "</td><td>" +
          yen(item.totalTaxSavingSimple) +
          "</td><td>" +
          yen(item.idecoBalance) +
          "</td></tr>"
        );
      })
      .join("");

    var idecoFirst = results[0];
    var nisaFirst = results[1];
    els.baseAsset.textContent = yen(idecoFirst.baseAsset);
    els.bonusAsset.textContent = yen(idecoFirst.finalAssetWithBonus);

    if (idecoCap <= 0) {
      els.verdict.textContent = "他制度の掛金が合算枠に達しているため、iDeCoの拠出余地がありません";
      els.verdictSub.textContent = "この場合は毎月の投資可能額を全額NISAに回すのが基本的な選択になります。";
    } else if (liquidityNeed === "yes") {
      els.verdict.textContent = "60歳より前に使う可能性があるなら、NISA優先がおすすめです";
      els.verdictSub.textContent =
        "iDeCoは原則60歳まで資産を引き出せません。「iDeCo優先」を" + years + "年続けると、" + yen(idecoFirst.idecoBalance) + " が60歳まで動かせなくなります。当面使う予定がない資金だけをiDeCoに回しましょう。";
    } else {
      var diff = idecoFirst.finalAssetWithBonus - nisaFirst.finalAssetWithBonus;
      els.verdict.textContent = "60歳まで使わない前提なら、iDeCo優先がおすすめです";
      if (diff > 0) {
        els.verdictSub.textContent =
          "拠出時点の資産評価額はどの配分でも" + yen(idecoFirst.baseAsset) + "で同じですが、iDeCo優先で得られる節税額（合計 " + yen(idecoFirst.totalTaxSavingSimple) + "）を毎年NISAに上乗せ投資すると、NISA優先より最終的に " + yen(diff) + " 資産が多くなる計算です（iDeCoの受け取り時にかかる税金は別ツールでご確認ください）。";
      } else {
        els.verdictSub.textContent = "この条件ではiDeCoの拠出余地が小さいため、節税額による差はわずかです。無理のない範囲でiDeCoの上限まで拠出することを検討してください。";
      }
    }

    var labels = results.map(function (r) { return r.strategy.label; });
    var ctx = document.getElementById("yuusen-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "資産評価額（節税額の再投資なし）",
          data: results.map(function (r) { return Math.round(r.baseAsset); }),
          backgroundColor: "#0f5f4c",
        },
        {
          label: "節税額を毎年NISAに再投資した場合",
          data: results.map(function (r) { return Math.round(r.finalAssetWithBonus); }),
          backgroundColor: "#d98e04",
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { callback: function (v) { return yen(v); } } },
      },
      plugins: {
        legend: { display: true, position: "top" },
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
      chart = new Chart(ctx, { type: "bar", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("yuusen-growthDataTable", chart);
  }

  els.category.addEventListener("change", function () {
    updateOffsetVisibility();
    render();
  });
  [els.offsetAmount, els.budget, els.taxableIncome, els.rate, els.years, els.liquidityNeed].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  updateOffsetVisibility();
  render();
})();

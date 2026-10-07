(function () {
  "use strict";

  // 高額療養費制度シミュレーター。
  //
  // 1か月（同一月・同一医療機関等）の医療費の自己負担額が高額になった場合に、
  // 所得区分ごとに決められた「自己負担限度額」を超えた分が後から支給される制度。
  // 令和8年8月〜令和9年7月診療分（本ツール作成時点の現行制度）の金額を使用する。
  //
  // 69歳以下は標準報酬月額（≒年収）に応じた5区分（ア〜オ）、70歳以上は
  // 現役並み所得者（ア〜ウと同じ3区分）・一般・低所得Ⅱ・低所得Ⅰの6区分で、
  // 区分ごとに「限度額の計算式（高額な区分は医療費に応じた1%加算あり）」
  // 「直近12か月に3回以上該当した場合の多数回該当（4回目以降）の金額」が決まっている。
  // 70歳以上の一般・低所得は、外来（通院）のみの場合に使う个人ごとの上限も別に定められている
  // （現役並みは外来のみの個人上限が廃止され、入院を含む世帯の限度額と同じ式を使う）。
  //
  // 世帯合算（同じ医療保険の複数の家族の医療費を合算する仕組み）は本ツールの対象外。

  var TIERS_UNDER70 = {
    a: { label: "ア：標準報酬月額83万円以上（年収約1,160万円〜）", base: 270300, threshold: 901000, rate: 0.01, multi: 140100 },
    i: { label: "イ：53万〜79万円（年収約770万〜約1,160万円）", base: 179100, threshold: 597000, rate: 0.01, multi: 93000 },
    u: { label: "ウ：28万〜50万円（年収約370万〜約770万円）", base: 85800, threshold: 286000, rate: 0.01, multi: 44400 },
    e: { label: "エ：26万円以下（年収約370万円未満）", base: 61500, threshold: null, rate: 0, multi: 44400 },
    o: { label: "オ：住民税非課税世帯", base: 36900, threshold: null, rate: 0, multi: 24600 },
  };

  var TIERS_OVER70 = {
    gen_a: { label: "現役並みⅢ：標準報酬月額83万円以上", base: 270300, threshold: 901000, rate: 0.01, multi: 140100, outpatient: null },
    gen_i: { label: "現役並みⅡ：53万〜79万円", base: 179100, threshold: 597000, rate: 0.01, multi: 93000, outpatient: null },
    gen_u: { label: "現役並みⅠ：28万〜50万円", base: 85800, threshold: 286000, rate: 0.01, multi: 44400, outpatient: null },
    ippan: { label: "一般：標準報酬月額26万円以下", base: 61500, threshold: null, rate: 0, multi: 44400, outpatient: 22000 },
    low2: { label: "低所得Ⅱ：世帯全員が住民税非課税", base: 25700, threshold: null, rate: 0, multi: 24600, outpatient: 11000 },
    low1: { label: "低所得Ⅰ：住民税非課税かつ年金収入のみ80万円以下など", base: 15700, threshold: null, rate: 0, multi: null, outpatient: 8000 },
  };

  var els = {
    ageGroup: document.getElementById("kougaku-ageGroup"),
    under70Field: document.getElementById("kougaku-under70-field"),
    over70Field: document.getElementById("kougaku-over70-field"),
    tierUnder70: document.getElementById("kougaku-tierUnder70"),
    tierOver70: document.getElementById("kougaku-tierOver70"),
    outpatientOnly: document.getElementById("kougaku-outpatientOnly"),
    coPayRate: document.getElementById("kougaku-coPayRate"),
    counterPayment: document.getElementById("kougaku-counterPayment"),
    priorCount: document.getElementById("kougaku-priorCount"),

    verdict: document.getElementById("kougaku-verdict"),
    verdictSub: document.getElementById("kougaku-verdictSub"),
    resultTotalMedical: document.getElementById("kougaku-result-totalMedical"),
    resultLimit: document.getElementById("kougaku-result-limit"),
    resultRefund: document.getElementById("kougaku-result-refund"),
    resultBurden: document.getElementById("kougaku-result-burden"),
    resultOutpatientRef: document.getElementById("kougaku-result-outpatientRef"),
    tableBody: document.getElementById("kougaku-breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function currentTier() {
    if (els.ageGroup.value === "over70") {
      return { tier: TIERS_OVER70[els.tierOver70.value], isOver70: true };
    }
    return { tier: TIERS_UNDER70[els.tierUnder70.value], isOver70: false };
  }

  function limitFor(tier, totalMedical, isMulti, useOutpatient) {
    if (useOutpatient && tier.outpatient != null) {
      return tier.outpatient;
    }
    if (isMulti && tier.multi != null) {
      return tier.multi;
    }
    if (tier.rate > 0) {
      return tier.base + Math.max(0, totalMedical - tier.threshold) * tier.rate;
    }
    return tier.base;
  }

  function updateFieldVisibility() {
    var isOver70 = els.ageGroup.value === "over70";
    els.under70Field.style.display = isOver70 ? "none" : "";
    els.over70Field.style.display = isOver70 ? "" : "none";
  }

  function render() {
    updateFieldVisibility();

    var info = currentTier();
    var tier = info.tier;
    var isOver70 = info.isOver70;

    var coPayRate = Number(els.coPayRate.value) || 0.3;
    var counterPayment = clampNonNegative(els.counterPayment.value);
    var totalMedical = coPayRate > 0 ? counterPayment / coPayRate : 0;
    var priorCount = Number(els.priorCount.value) || 0;
    var isMulti = priorCount >= 3;
    var useOutpatient = isOver70 && els.outpatientOnly.value === "outpatient" && tier.outpatient != null;

    var limit = limitFor(tier, totalMedical, isMulti && !useOutpatient, useOutpatient);
    var refund = Math.max(0, counterPayment - limit);
    var burden = Math.min(counterPayment, limit);

    els.resultTotalMedical.textContent = yen(totalMedical);
    els.resultLimit.textContent = yen(limit);
    els.resultRefund.textContent = yen(refund);
    els.resultBurden.textContent = yen(burden);

    if (isOver70 && tier.outpatient != null) {
      els.resultOutpatientRef.textContent = yen(tier.outpatient) + "（通院のみの場合の個人ごとの上限、多数回該当の適用なし）";
    } else if (isOver70) {
      els.resultOutpatientRef.textContent = "この区分には外来のみの個人ごとの上限はありません（世帯の限度額と同じ式を使います）";
    } else {
      els.resultOutpatientRef.textContent = "70歳未満にはこの制度はありません";
    }

    if (refund > 0) {
      els.verdict.textContent = "高額療養費として " + yen(refund) + " が戻る計算です";
      els.verdictSub.textContent =
        "窓口での支払い " + yen(counterPayment) + " のうち、自己負担限度額 " + yen(limit) +
        " を超えた分が高額療養費として支給されます（" +
        (isMulti && !useOutpatient ? "直近12か月で4回目以降の「多数回該当」の限度額を適用" : "通常の限度額を適用") +
        "）。事前に「限度額適用認定証」またはマイナ保険証（オンライン資格確認）を医療機関に提示すれば、窓口での支払い自体をこの限度額まで抑えられます。";
    } else {
      els.verdict.textContent = "高額療養費の対象外です（上限に達していません）";
      els.verdictSub.textContent =
        "窓口での支払い " + yen(counterPayment) + " は、自己負担限度額 " + yen(limit) + " を超えていないため、高額療養費としての追加の支給はありません。";
    }

    var rows = [
      ["年齢区分", isOver70 ? "70歳以上" : "69歳以下"],
      ["所得区分", tier.label],
      ["窓口で支払った金額", yen(counterPayment)],
      ["総医療費（10割相当、概算）", yen(totalMedical)],
      ["直近12か月の該当回数（今回を含めない）", priorCount >= 3 ? "3回以上（今回が多数回該当）" : priorCount + "回"],
      ["自己負担限度額（今回の上限額）", yen(limit)],
      ["高額療養費として支給される金額", yen(refund)],
      ["実質の自己負担額", yen(burden)],
    ];
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("kougaku-growthChart").getContext("2d");
    var data = {
      labels: ["総医療費（10割）", "窓口での支払い", "自己負担限度額（実質負担）"],
      datasets: [
        {
          label: "金額",
          data: [totalMedical, counterPayment, burden],
          backgroundColor: ["#9aa5b1", "#d98e04", "#0f5f4c"],
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.label + "：" + yen(ctx.parsed.y);
            },
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: "金額（円）" },
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
    if (window.renderChartDataTable) window.renderChartDataTable("kougaku-growthDataTable", chart);
  }

  els.ageGroup.addEventListener("change", render);
  [
    els.tierUnder70,
    els.tierOver70,
    els.outpatientOnly,
    els.coPayRate,
    els.counterPayment,
    els.priorCount,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

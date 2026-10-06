(function () {
  "use strict";

  // 国民健康保険料（国保）シミュレーター。
  //
  // 全国一律の制度（令和8年度）：
  // - 医療分・後期高齢者支援金分・介護納付金分（40〜64歳）・子ども・子育て支援納付金分
  //   （令和8年度新設）の4区分で構成される。
  // - 各区分とも「所得割（(所得−基礎控除43万円)×所得割率）＋均等割（加入者数×1人あたり額）
  //   ＋平等割（1世帯あたり額、採用していない自治体もある）」で計算する。
  // - 低所得世帯への軽減（7割・5割・2割）は所得基準額が全国一律で定められている。
  // - 未就学児（0〜5歳）は医療分・支援金分の均等割がさらに5割軽減される（令和4年度から全国一律）。
  // - 18歳未満は子ども・子育て支援納付金分の均等割が全額免除される（令和8年度から全国一律）。
  // - 各区分の年間上限額も全国一律（政令で規定）。
  //
  // 一方、所得割率・均等割額・平等割額そのものは市区町村ごとに異なるため、
  // このツールでは東京都世田谷区の令和8年度の公表値を初期値として表示し、
  // 利用者が自分の自治体の値に書き換えられるようにしている。

  var BASIC_DEDUCTION = 430000;
  var REDUCTION_7_BASE = 430000;
  var REDUCTION_7_PER_EARNER = 100000;
  var REDUCTION_5_PER_MEMBER = 290000;
  var REDUCTION_2_PER_MEMBER = 535000;

  var CAPS = {
    iryo: 670000,
    shien: 260000,
    kaigo: 170000,
    kodomo: 30000,
  };

  var els = {
    members: document.getElementById("kokuho-members"),
    kaigoMembers: document.getElementById("kokuho-kaigoMembers"),
    childMembers: document.getElementById("kokuho-childMembers"),
    preschoolMembers: document.getElementById("kokuho-preschoolMembers"),
    totalIncome: document.getElementById("kokuho-totalIncome"),
    earnerCount: document.getElementById("kokuho-earnerCount"),

    iryoRate: document.getElementById("kokuho-iryoRate"),
    iryoPerCapita: document.getElementById("kokuho-iryoPerCapita"),
    iryoHousehold: document.getElementById("kokuho-iryoHousehold"),
    shienRate: document.getElementById("kokuho-shienRate"),
    shienPerCapita: document.getElementById("kokuho-shienPerCapita"),
    shienHousehold: document.getElementById("kokuho-shienHousehold"),
    kaigoRate: document.getElementById("kokuho-kaigoRate"),
    kaigoPerCapita: document.getElementById("kokuho-kaigoPerCapita"),
    kaigoHousehold: document.getElementById("kokuho-kaigoHousehold"),
    kodomoRate: document.getElementById("kokuho-kodomoRate"),
    kodomoPerCapita: document.getElementById("kokuho-kodomoPerCapita"),
    kodomoHousehold: document.getElementById("kokuho-kodomoHousehold"),

    verdict: document.getElementById("kokuho-verdict"),
    verdictSub: document.getElementById("kokuho-verdictSub"),
    resultIryo: document.getElementById("kokuho-result-iryo"),
    resultShien: document.getElementById("kokuho-result-shien"),
    resultKaigo: document.getElementById("kokuho-result-kaigo"),
    resultKodomo: document.getElementById("kokuho-result-kodomo"),
    resultReduction: document.getElementById("kokuho-result-reduction"),
    resultTotal: document.getElementById("kokuho-result-total"),
    resultMonthly: document.getElementById("kokuho-result-monthly"),
    tableBody: document.getElementById("kokuho-breakdown-body"),
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

  function clampNonNegativeInt(n) {
    return Math.max(0, Math.round(Number(n) || 0));
  }

  function reductionRateFor(totalIncome, members, earnerCount) {
    var adjEarner = Math.max(0, earnerCount - 1);
    var threshold7 = REDUCTION_7_BASE + REDUCTION_7_PER_EARNER * adjEarner;
    var threshold5 = threshold7 + REDUCTION_5_PER_MEMBER * members;
    var threshold2 = threshold7 + REDUCTION_2_PER_MEMBER * members;
    if (totalIncome <= threshold7) return 0.7;
    if (totalIncome <= threshold5) return 0.5;
    if (totalIncome <= threshold2) return 0.2;
    return 0;
  }

  // 1区分（医療分・支援金分・介護分・子ども分）の年間保険料を計算する。
  // perCapitaCount: 均等割の対象人数（区分ごとに異なる）
  // preschoolCount: このうち均等割がさらに5割軽減される人数（医療分・支援金分のみ使用、他は0を渡す）
  function componentAmount(assessedIncome, rate, perCapitaCount, perCapita, preschoolCount, household, reductionRate, cap) {
    var shotokuwari = assessedIncome * (rate / 100);

    var fullCount = Math.max(0, perCapitaCount - preschoolCount);
    var kintouwari = fullCount * perCapita + preschoolCount * perCapita * 0.5;
    kintouwari = kintouwari * (1 - reductionRate);

    var heitouwari = perCapitaCount > 0 ? household * (1 - reductionRate) : 0;

    var total = Math.floor(shotokuwari) + Math.floor(kintouwari) + Math.floor(heitouwari);
    return Math.min(cap, total);
  }

  function render() {
    var members = Math.max(1, clampNonNegativeInt(els.members.value));
    var kaigoMembers = Math.min(members, clampNonNegativeInt(els.kaigoMembers.value));
    var childMembers = Math.min(members, clampNonNegativeInt(els.childMembers.value));
    var preschoolMembers = Math.min(childMembers, clampNonNegativeInt(els.preschoolMembers.value));
    var totalIncome = clampNonNegative(els.totalIncome.value);
    var earnerCount = Math.min(members, clampNonNegativeInt(els.earnerCount.value));

    var iryoRate = clampNonNegative(els.iryoRate.value);
    var iryoPerCapita = clampNonNegative(els.iryoPerCapita.value);
    var iryoHousehold = clampNonNegative(els.iryoHousehold.value);
    var shienRate = clampNonNegative(els.shienRate.value);
    var shienPerCapita = clampNonNegative(els.shienPerCapita.value);
    var shienHousehold = clampNonNegative(els.shienHousehold.value);
    var kaigoRate = clampNonNegative(els.kaigoRate.value);
    var kaigoPerCapita = clampNonNegative(els.kaigoPerCapita.value);
    var kaigoHousehold = clampNonNegative(els.kaigoHousehold.value);
    var kodomoRate = clampNonNegative(els.kodomoRate.value);
    var kodomoPerCapita = clampNonNegative(els.kodomoPerCapita.value);
    var kodomoHousehold = clampNonNegative(els.kodomoHousehold.value);

    var assessedIncome = Math.max(0, totalIncome - BASIC_DEDUCTION);
    var reductionRate = reductionRateFor(totalIncome, members, earnerCount);

    var kodomoPayingMembers = Math.max(0, members - childMembers);

    var iryo = componentAmount(assessedIncome, iryoRate, members, iryoPerCapita, preschoolMembers, iryoHousehold, reductionRate, CAPS.iryo);
    var shien = componentAmount(assessedIncome, shienRate, members, shienPerCapita, preschoolMembers, shienHousehold, reductionRate, CAPS.shien);
    var kaigo = kaigoMembers > 0
      ? componentAmount(assessedIncome, kaigoRate, kaigoMembers, kaigoPerCapita, 0, kaigoHousehold, reductionRate, CAPS.kaigo)
      : 0;
    var kodomo = kodomoPayingMembers > 0
      ? componentAmount(assessedIncome, kodomoRate, kodomoPayingMembers, kodomoPerCapita, 0, kodomoHousehold, reductionRate, CAPS.kodomo)
      : 0;

    var total = iryo + shien + kaigo + kodomo;
    var monthly = total / 12;

    var reductionLabel = reductionRate > 0 ? Math.round(reductionRate * 100) + "% 軽減" : "軽減なし";

    els.resultIryo.textContent = yen(iryo);
    els.resultShien.textContent = yen(shien);
    els.resultKaigo.textContent = kaigoMembers > 0 ? yen(kaigo) : "対象者なし（0円）";
    els.resultKodomo.textContent = yen(kodomo);
    els.resultReduction.textContent = reductionLabel;
    els.resultTotal.textContent = yen(total);
    els.resultMonthly.textContent = yen(monthly) + "／月（目安）";

    els.verdict.textContent = "年間の国民健康保険料は " + yen(total) + "（目安）";
    els.verdictSub.textContent =
      "医療分 " + manYen(iryo) + "＋支援金分 " + manYen(shien) +
      (kaigoMembers > 0 ? "＋介護分 " + manYen(kaigo) : "") +
      "＋子ども・子育て支援金分 " + manYen(kodomo) +
      "の合計です。入力した所得割率・均等割額・平等割額はお住まいの市区町村の公表値に置き換えて使ってください。";

    var rows = [
      ["世帯の国保加入者数", members + " 人（うち40〜64歳 " + kaigoMembers + " 人、18歳未満 " + childMembers + " 人、うち未就学児 " + preschoolMembers + " 人）"],
      ["世帯の合計所得金額（前年）", yen(totalIncome)],
      ["所得割の算定基礎（合計所得金額−基礎控除43万円）", yen(assessedIncome)],
      ["低所得世帯の軽減区分", reductionLabel],
      ["医療分（年額、上限67万円）", yen(iryo)],
      ["後期高齢者支援金分（年額、上限26万円）", yen(shien)],
      ["介護納付金分（年額、上限17万円、40〜64歳が対象）", kaigoMembers > 0 ? yen(kaigo) : "対象者なし（0円）"],
      ["子ども・子育て支援納付金分（年額、上限3万円）", yen(kodomo)],
      ["年間合計（目安）", yen(total)],
      ["月額換算（目安、実際の支払回数は自治体により異なる）", yen(monthly)],
    ];
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("kokuho-growthChart").getContext("2d");
    var data = {
      labels: ["医療分", "支援金分", "介護分", "子ども・子育て支援金分"],
      datasets: [
        {
          label: "年間保険料（区分別）",
          data: [iryo, shien, kaigo, kodomo],
          backgroundColor: ["#0f5f4c", "#1d7a63", "#d98e04", "#8a6fd6"],
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
          title: { display: true, text: "年間保険料" },
          ticks: { callback: function (v) { return manYen(v); } },
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
    if (window.renderChartDataTable) window.renderChartDataTable("kokuho-growthDataTable", chart);
  }

  [
    els.members,
    els.kaigoMembers,
    els.childMembers,
    els.preschoolMembers,
    els.totalIncome,
    els.earnerCount,
    els.iryoRate,
    els.iryoPerCapita,
    els.iryoHousehold,
    els.shienRate,
    els.shienPerCapita,
    els.shienHousehold,
    els.kaigoRate,
    els.kaigoPerCapita,
    els.kaigoHousehold,
    els.kodomoRate,
    els.kodomoPerCapita,
    els.kodomoHousehold,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

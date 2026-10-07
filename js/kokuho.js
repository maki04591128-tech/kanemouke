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

  // 退職後の健康保険比較（任意継続 vs 国民健康保険）用の定数。
  // 任意継続は健康保険のみの制度（厚生年金・雇用保険は対象外）で、在職中と異なり
  // 会社との折半が無く、保険料率全体（事業主負担分を含む）を全額自己負担する。
  var NINI_KEIZOKU_REMUNERATION_CAP = 320000; // 標準報酬月額の上限（協会けんぽ、令和8年度）
  var NATIONWIDE_AVERAGE_HEALTH_INSURANCE_RATE = 0.0998; // 全国平均（協会けんぽ、事業主負担分を含む全体の料率）
  var NATIONWIDE_KAIGO_INSURANCE_RATE = 0.0162; // 介護保険料率（全国一律、令和8年度、事業主負担分を含む）
  // 健康保険（任意継続）の子ども・子育て支援金率（令和8年4月分〜、全国一律）。
  // 下の国保側「子ども・子育て支援納付金分」（kodomoRate等、所得割・均等割方式で市区町村ごとに異なる）とは別の制度・別の金額。
  var NINI_KEIZOKU_CHILDCARE_SUPPORT_LEVY_RATE = 0.0023;

  // 協会けんぽの都道府県単位保険料率（令和8年度3月分〜、全体の料率）。
  // js/nenshu-no-kabe.js等と同一のデータ（出典：全国健康保険協会「都道府県単位の保険料率」）。
  var PREFECTURE_HEALTH_INSURANCE_RATES = {
    "北海道": 0.1028, "青森県": 0.0985, "岩手県": 0.0951, "宮城県": 0.1010, "秋田県": 0.1001,
    "山形県": 0.0975, "福島県": 0.0950, "茨城県": 0.0952, "栃木県": 0.0982, "群馬県": 0.0968,
    "埼玉県": 0.0967, "千葉県": 0.0973, "東京都": 0.0985, "神奈川県": 0.0992, "新潟県": 0.0921,
    "富山県": 0.0959, "石川県": 0.0970, "福井県": 0.0971, "山梨県": 0.0955, "長野県": 0.0963,
    "岐阜県": 0.0980, "静岡県": 0.0961, "愛知県": 0.0993, "三重県": 0.0977, "滋賀県": 0.0988,
    "京都府": 0.0989, "大阪府": 0.1013, "兵庫県": 0.1012, "奈良県": 0.0991, "和歌山県": 0.1006,
    "鳥取県": 0.0986, "島根県": 0.0994, "岡山県": 0.1005, "広島県": 0.0978, "山口県": 0.1015,
    "徳島県": 0.1024, "香川県": 0.1002, "愛媛県": 0.0998, "高知県": 0.1005, "福岡県": 0.1011,
    "佐賀県": 0.1055, "長崎県": 0.1006, "熊本県": 0.1008, "大分県": 0.1008, "宮崎県": 0.0977,
    "鹿児島県": 0.1013, "沖縄県": 0.0944
  };

  function niniKeizokuHealthRate(prefecture) {
    var totalRate = PREFECTURE_HEALTH_INSURANCE_RATES[prefecture];
    return totalRate === undefined ? NATIONWIDE_AVERAGE_HEALTH_INSURANCE_RATE : totalRate;
  }

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

    niniSalary: document.getElementById("kokuho-nini-salary"),
    niniPrefecture: document.getElementById("kokuho-nini-prefecture"),
    niniAge: document.getElementById("kokuho-nini-age"),
    niniVerdict: document.getElementById("kokuho-nini-verdict"),
    niniVerdictSub: document.getElementById("kokuho-nini-verdictSub"),
    niniResultTotal: document.getElementById("kokuho-nini-result-total"),
    niniResultMonthly: document.getElementById("kokuho-nini-result-monthly"),

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

    var niniSalary = clampNonNegative(els.niniSalary.value);
    var niniPrefecture = els.niniPrefecture.value;
    var niniIsAge4064 = els.niniAge.value === "yes";
    var niniStandardRemuneration = Math.min(NINI_KEIZOKU_REMUNERATION_CAP, niniSalary);
    var niniRate = niniKeizokuHealthRate(niniPrefecture) + NINI_KEIZOKU_CHILDCARE_SUPPORT_LEVY_RATE +
      (niniIsAge4064 ? NATIONWIDE_KAIGO_INSURANCE_RATE : 0);
    var niniMonthly = niniStandardRemuneration * niniRate;
    var niniTotal = niniMonthly * 12;

    els.niniResultTotal.textContent = yen(niniTotal);
    els.niniResultMonthly.textContent = yen(niniMonthly) + "／月（目安）";

    var niniDiff = Math.abs(total - niniTotal);
    if (total < niniTotal) {
      els.niniVerdict.textContent = "国民健康保険の方が年間 " + yen(niniDiff) + " 安い計算です（目安）";
    } else if (niniTotal < total) {
      els.niniVerdict.textContent = "任意継続の方が年間 " + yen(niniDiff) + " 安い計算です（目安）";
    } else {
      els.niniVerdict.textContent = "どちらもほぼ同額の計算です（目安）";
    }
    els.niniVerdictSub.textContent =
      "任意継続：標準報酬月額 " + yen(niniStandardRemuneration) + "（上限32万円）に、健康保険料率" +
      (niniIsAge4064 ? "＋介護保険料率1.62%" : "") +
      "を全額自己負担で掛けた概算です。国民健康保険：上の年間 " + yen(total) + "（目安）との比較です。" +
      "扶養家族の有無や実際の標準報酬月額の等級によって変わるため、両方の正式な見積もり額も確認してください。";

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
    els.niniSalary,
    els.niniPrefecture,
    els.niniAge,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

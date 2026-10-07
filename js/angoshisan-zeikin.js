(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var RECONSTRUCTION_TAX_RATE = 0.021;
  var THRESHOLD = 200000; // 20万円ルールの判定ライン（所得税のみ。住民税には適用されない）
  var STOCK_WITHHOLDING_RATE = 0.20315; // 参考比較用：上場株式等の譯渡益・配当の申告分離課税・源泉徴収の税率（所得税15.315%＋住民税5%）

  // 社会保険料率（本人負担分の目安。協会けんぽ全国平均・2025年度水準、40歳未満を想定した概算）
  var HEALTH_INSURANCE_RATE = 0.0499;
  var PENSION_RATE = 0.0915;
  var EMPLOYMENT_INSURANCE_RATE = 0.006;

  // 協会けんぽの都道府県単位保険料率（令和8年度3月分〜、全体の料率。本人負担分はその半分）。
  // js/nenshu-tedori.jsと同一のデータ（出典：全国健康保険協会「都道府県単位の保険料率」）。
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

  // 子ども・子育て支援金率（令和8年4月分〜、全国一律・労使折半）。
  // 出典：こども家庭庁長官が定める率（2026年1月15日付け官報公示、2.3/1000）。
  var CHILDCARE_SUPPORT_LEVY_RATE = 0.0023;

  function healthInsuranceRate(prefecture) {
    var totalRate = PREFECTURE_HEALTH_INSURANCE_RATES[prefecture];
    if (totalRate === undefined) return HEALTH_INSURANCE_RATE + CHILDCARE_SUPPORT_LEVY_RATE / 2; // 全国平均（既定）
    return (totalRate + CHILDCARE_SUPPORT_LEVY_RATE) / 2; // 本人負担分（支援金を含めて折半）
  }

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

  // 給与所得控除額（所得税用）。令和8年度税制改正により、令和8・9年分は最低保障額が74万円に時限的に
  // 引き上げられている（令和10年分以後は本則69万円に戻る予定）。
  var SALARY_DEDUCTION_BRACKETS_INCOME_TAX = [
    { limit: 2200000, calc: function () { return 740000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 給与所得控除額（住民税用）。最低保障額の引き上げ（74万円）は所得税のみが対象で、
  // 個人住民税の最低保障額は令和8年度分もこれまでと同じ65万円。
  var SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX = [
    { limit: 1900000, calc: function () { return 650000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税の基礎控除額。令和8年度税制改正により、令和8・9年分は合計所得金額（給与収入＋暗号資産の利益）に
  // 応じて段階的に引き上げられている。住民税の基礎控除（43万円）は今回の改正の対象外で変更なし。
  function incomeBasicDeduction(totalIncome) {
    if (totalIncome <= 4890000) return 1040000;
    if (totalIncome <= 6550000) return 670000;
    if (totalIncome <= 23500000) return 620000;
    if (totalIncome <= 24000000) return 480000;
    if (totalIncome <= 24500000) return 320000;
    if (totalIncome <= 25000000) return 160000;
    return 0;
  }
  var RESIDENT_BASIC_DEDUCTION = 430000; // 住民税の基礎控除

  // Node.js（単体テスト）向けに公開
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { calc: calc };
  }

  // ブラウザ環境でなければここで終了（Node での単体テストを想定）
  if (typeof document === "undefined") {
    return;
  }

  var els = {
    salaryIncome: document.getElementById("ango-salaryIncome"),
    cryptoGain: document.getElementById("ango-cryptoGain"),
    prefecture: document.getElementById("ango-prefecture"),
    verdict: document.getElementById("ango-verdict"),
    verdictSub: document.getElementById("ango-verdictSub"),
    noticeBox: document.getElementById("ango-noticeBox"),
    cryptoGainResult: document.getElementById("ango-result-crypto-gain"),
    incomeTaxFiling: document.getElementById("ango-result-income-tax-filing"),
    residentTaxFiling: document.getElementById("ango-result-resident-tax-filing"),
    taxIfFiled: document.getElementById("ango-result-tax-if-filed"),
    netTakeHome: document.getElementById("ango-result-net-takehome"),
    marginalRate: document.getElementById("ango-result-marginal-rate"),
    effectiveRate: document.getElementById("ango-result-effective-rate"),
    compareBody: document.getElementById("ango-compare-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function salaryDeduction(income, brackets) {
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
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

  function marginalBracketRate(taxable) {
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) return TAX_BRACKETS[i].rate;
    }
    return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
  }

  // 給与年収に、暗号資産の利益（雑所得として総合課税で合算した場合）を上乗せしたときに
  // 増える所得税額・住民税額を試算する。暗号資産は上場株式等と異なり申告分離課税・確定申告
  // 不要制度を選べず、総合課税のみが適用される点が既存の配当課税シミュレーターとの違い。
  function calc(salaryIncome, cryptoGain, prefecture) {
    var socialInsuranceRate = healthInsuranceRate(prefecture) + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    var socialInsurance = salaryIncome * socialInsuranceRate;

    var salaryTaxableIncome = Math.max(0, salaryIncome - salaryDeduction(salaryIncome, SALARY_DEDUCTION_BRACKETS_INCOME_TAX));
    var salaryTaxableIncomeResident = Math.max(0, salaryIncome - salaryDeduction(salaryIncome, SALARY_DEDUCTION_BRACKETS_RESIDENT_TAX));

    var taxableBase = Math.max(0, salaryTaxableIncome - incomeBasicDeduction(salaryIncome) - socialInsurance);
    var residentTaxableBase = Math.max(0, salaryTaxableIncomeResident - RESIDENT_BASIC_DEDUCTION - socialInsurance);

    var incomeTaxBase = taxByBracket(taxableBase) * (1 + RECONSTRUCTION_TAX_RATE);
    var residentTaxBase = residentTaxableBase * RESIDENT_TAX_RATE;

    // 暗号資産の利益を合算すると合計所得金額が変わり、所得税の基礎控除の段階（令和8・9年分）も
    // 変わりうるため、基礎控除は合算後の金額から算出し直す（住民税の基礎控除43万円は対象外）。
    var taxableBaseWithGain = Math.max(
      0,
      salaryTaxableIncome + cryptoGain - incomeBasicDeduction(salaryIncome + cryptoGain) - socialInsurance
    );
    var incomeTaxWithGain = taxByBracket(taxableBaseWithGain) * (1 + RECONSTRUCTION_TAX_RATE);
    var incomeTaxMarginal = Math.max(0, incomeTaxWithGain - incomeTaxBase);

    var residentTaxableWithGain = residentTaxableBase + cryptoGain;
    var residentTaxWithGain = residentTaxableWithGain * RESIDENT_TAX_RATE;
    var residentTaxMarginal = Math.max(0, residentTaxWithGain - residentTaxBase);

    return {
      incomeTaxMarginal: incomeTaxMarginal,
      residentTaxMarginal: residentTaxMarginal,
      marginalRate: marginalBracketRate(taxableBaseWithGain),
    };
  }

  function render() {
    var salaryIncome = clampNonNegative(els.salaryIncome.value) * 10000;
    var cryptoGain = clampNonNegative(els.cryptoGain.value) * 10000;
    var prefecture = els.prefecture ? els.prefecture.value : "";

    var needsIncomeTaxFiling = cryptoGain > THRESHOLD;
    var needsResidentTaxFiling = cryptoGain > 0;

    var r = calc(salaryIncome, cryptoGain, prefecture);
    var taxIfFiled = r.incomeTaxMarginal + r.residentTaxMarginal;
    var incomeTaxOwed = needsIncomeTaxFiling ? r.incomeTaxMarginal : 0;
    var residentTaxOwed = needsResidentTaxFiling ? r.residentTaxMarginal : 0;
    var netTakeHome = cryptoGain - incomeTaxOwed - residentTaxOwed;
    var effectiveRate = cryptoGain > 0 ? (taxIfFiled / cryptoGain) * 100 : 0;

    // 参考比較：同じ利益額が上場株式等の譯渡益・配当だった場合（申告分離課税・一律20.315%）
    var stockTax = cryptoGain * STOCK_WITHHOLDING_RATE;
    var stockNet = cryptoGain - stockTax;

    els.cryptoGainResult.textContent = yen(cryptoGain);
    els.incomeTaxFiling.textContent = needsIncomeTaxFiling ? "必要" : "不要";
    els.residentTaxFiling.textContent = needsResidentTaxFiling ? "必要" : "不要（所得なし）";
    els.taxIfFiled.textContent = yen(taxIfFiled);
    els.netTakeHome.textContent = yen(netTakeHome);
    els.marginalRate.textContent = (r.marginalRate * 100).toFixed(0) + " %";
    els.effectiveRate.textContent = effectiveRate.toFixed(1) + " %";

    if (cryptoGain <= 0) {
      els.verdict.textContent = "暗号資産の利益額を入力すると、確定申告の要否と税額の目安を計算します";
      els.verdictSub.textContent = "";
    } else if (!needsIncomeTaxFiling) {
      els.verdict.textContent = "この条件では所得税の確定申告は「不要」です（20万円ルール）";
      els.verdictSub.textContent =
        "暗号資産の利益（雑所得）は " + yen(cryptoGain) + " で、20万円以下のため、給与を1か所から受けて年末調整が済んでいるなど一般的な条件を満たしていれば、所得税の確定申告は不要です。ただし住民税の申告は別途必要になる場合があります（下記の注意点を参照）。";
    } else {
      els.verdict.textContent = "この条件では所得税の確定申告が「必要」です";
      els.verdictSub.textContent =
        "暗号資産の利益（雑所得）は " + yen(cryptoGain) + " で、20万円ルールの対象（20万円以下）を超えているため、所得税の確定申告が必要です。総合課税で合算した場合の税額の目安は " + yen(taxIfFiled) + "（所得税の限界税率の目安 " + (r.marginalRate * 100).toFixed(0) + "%、所得税・復興特別所得税・住民税を合わせた実効税率の目安 " + effectiveRate.toFixed(1) + "%）です。";
    }

    if (needsResidentTaxFiling) {
      els.noticeBox.style.display = "block";
      els.noticeBox.innerHTML =
        "<p><strong>住民税の申告をお忘れなく：</strong>20万円ルールは所得税のみの特例で、住民税には適用されません。所得税の確定申告が不要な場合でも、暗号資産の利益が発生している以上、お住まいの市区町村へ住民税の申告（住民税申告書の提出）が別途必要です。確定申告をした場合は、その内容が自動的に住民税にも反映されるため、住民税申告は別途行う必要はありません。</p>";
    } else {
      els.noticeBox.style.display = "none";
      els.noticeBox.innerHTML = "";
    }

    var rows = [
      {
        label: "暗号資産（雑所得・総合課税のみ）",
        tax: taxIfFiled,
        net: netTakeHome,
        note: "申告分離課税・確定申告不要制度は選べず、必ず他の所得と合算した総合課税の対象になります。",
      },
      {
        label: "参考：上場株式等の譯渡益・配当だった場合",
        tax: stockTax,
        net: stockNet,
        note: "申告分離課税（一律20.315%）または確定申告不要制度（源泉徴収のみ）を選べるため、所得が高いほど暗号資産より税負担が軽くなりやすい計算です。",
      },
    ];
    els.compareBody.innerHTML = rows
      .map(function (row) {
        var isBest = cryptoGain > 0 && Math.abs(row.net - Math.max(netTakeHome, stockNet)) < 1;
        return (
          "<tr" + (isBest ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + row.label + "</td>" +
          "<td>" + yen(row.tax) + "</td>" +
          "<td>" + yen(row.net) + "</td>" +
          "<td>" + row.note + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var ctx = document.getElementById("ango-growthChart").getContext("2d");
    var data = {
      labels: ["暗号資産（総合課税のみ）", "参考：上場株式等だった場合"],
      datasets: [
        {
          label: "手取り額",
          data: [Math.round(netTakeHome), Math.round(stockNet)],
          backgroundColor: ["#0f5f4c", "#d98e04"],
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
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.label + "：" + yen(ctx.parsed.y); },
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
    if (window.renderChartDataTable) window.renderChartDataTable("ango-growthDataTable", chart);
  }

  [els.salaryIncome, els.cryptoGain, els.prefecture].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

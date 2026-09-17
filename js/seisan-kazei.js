(function () {
  "use strict";

  // ---- 相続税（js/souzokuzei.js・js/zouyo-souzoku.js と完全に同じ値・ロジック） ----
  var BASIC_DEDUCTION_FIXED = 30000000;
  var BASIC_DEDUCTION_PER_HEIR = 6000000;

  var INHERITANCE_TAX_BRACKETS = [
    { limit: 10000000, rate: 0.10, deduct: 0 },
    { limit: 30000000, rate: 0.15, deduct: 500000 },
    { limit: 50000000, rate: 0.20, deduct: 2000000 },
    { limit: 100000000, rate: 0.30, deduct: 7000000 },
    { limit: 200000000, rate: 0.40, deduct: 17000000 },
    { limit: 300000000, rate: 0.45, deduct: 27000000 },
    { limit: 600000000, rate: 0.50, deduct: 42000000 },
    { limit: Infinity, rate: 0.55, deduct: 72000000 },
  ];

  // ---- 暦年贈与（js/zouyo-souzoku.js と同じ。特例贈与財産用、直系尊属→18歳以上の子・孫） ----
  var KOYEN_BASIC_DEDUCTION = 1100000;
  var KOYEN_GIFT_TAX_BRACKETS = [
    { limit: 2000000, rate: 0.10, deduct: 0 },
    { limit: 4000000, rate: 0.15, deduct: 100000 },
    { limit: 6000000, rate: 0.20, deduct: 300000 },
    { limit: 10000000, rate: 0.30, deduct: 900000 },
    { limit: 15000000, rate: 0.40, deduct: 1900000 },
    { limit: 30000000, rate: 0.45, deduct: 2650000 },
    { limit: 45000000, rate: 0.50, deduct: 4150000 },
    { limit: Infinity, rate: 0.55, deduct: 6400000 },
  ];
  var KOYEN_EXTENDED_PERIOD_EXCLUSION = 1000000; // 7年ルックバックの延長4年間分・合計100万円控除

  // ---- 相続時精算課税制度（2024年1月以降の贈与から適用） ----
  var SEISAN_BASIC_DEDUCTION = 1100000; // 受贈者1人・1年あたり。暦年贈与と異なり、相続時にこの部分は一切加算されない
  var SEISAN_SPECIAL_DEDUCTION = 25000000; // 受贈者1人あたり累計（贈与者との組み合わせごと）
  var SEISAN_FLAT_RATE = 0.20; // 特別控除を使い切った後の超過分にかかる税率

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function clampNonNegativeInt(n) {
    return Math.max(0, Math.round(Number(n) || 0));
  }

  function taxByBrackets(amount, brackets) {
    if (amount <= 0) return 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (amount <= b.limit) {
        return Math.max(0, amount * b.rate - b.deduct);
      }
    }
    return 0;
  }

  function taxOnInheritanceShare(amount) {
    return taxByBrackets(amount, INHERITANCE_TAX_BRACKETS);
  }

  function koyenGiftTaxPerYear(annualGift) {
    var taxable = Math.max(0, annualGift - KOYEN_BASIC_DEDUCTION);
    return taxByBrackets(taxable, KOYEN_GIFT_TAX_BRACKETS);
  }

  // 相続人構成から法定相続人数・法定相続分を判定（配偶者＋子〈第1順位〉のケースのみ対応）
  function legalHeirs(hasSpouse, childCount) {
    if (hasSpouse) {
      if (childCount > 0) {
        return { count: 1 + childCount, spouseShare: 0.5, childShareEach: 0.5 / childCount };
      }
      return { count: 1, spouseShare: 1, childShareEach: 0 };
    }
    if (childCount > 0) {
      return { count: childCount, spouseShare: 0, childShareEach: 1 / childCount };
    }
    return { count: 0, spouseShare: 0, childShareEach: 0 };
  }

  function inheritanceTaxTotal(taxableEstate, heirs, childCount) {
    if (taxableEstate <= 0 || heirs.count === 0) return 0;
    var spouseTaxableShare = taxableEstate * heirs.spouseShare;
    var childTaxableShareEach = taxableEstate * heirs.childShareEach;
    return taxOnInheritanceShare(spouseTaxableShare) + childCount * taxOnInheritanceShare(childTaxableShareEach);
  }

  /**
   * 暦年贈与を選んだ場合の、1受贈者あたりの生前贈与加算（持ち戻し）額・贈与税額控除を算出する。
   * js/zouyo-souzoku.js の calcAddback と同一ロジック（暦年課税は基礎控除以下の部分も含めて持ち戻し対象になる点に注意）。
   */
  function koyenAddback(annualGift, annualGiftTax, effectiveGiftYears, yearsUntilInheritance, lookbackPeriod) {
    var addbackGross = 0;
    var addbackGiftTaxGross = 0;
    var extendedAmount = 0;

    for (var i = 1; i <= effectiveGiftYears; i++) {
      var distanceFromDeath = yearsUntilInheritance - i + 1;
      if (distanceFromDeath >= 1 && distanceFromDeath <= lookbackPeriod) {
        addbackGross += annualGift;
        addbackGiftTaxGross += annualGiftTax;
        if (lookbackPeriod === 7 && distanceFromDeath >= 4) {
          extendedAmount += annualGift;
        }
      }
    }

    var reduction = lookbackPeriod === 7 ? Math.min(KOYEN_EXTENDED_PERIOD_EXCLUSION, extendedAmount) : 0;
    var addbackNet = Math.max(0, addbackGross - reduction);
    var creditRatio = addbackGross > 0 ? addbackNet / addbackGross : 0;
    var giftTaxCredit = addbackGiftTaxGross * creditRatio;

    return { addbackNet: addbackNet, giftTaxCredit: giftTaxCredit };
  }

  /**
   * 相続時精算課税制度を選んだ場合の、1受贈者あたりの累計値を算出する。
   * 毎年同額を贈与するものとし、年110万円の基礎控除（2024年〜新設、相続時に加算されない）を除いた超過分を
   * 特別控除2,500万円（累計）にまず充当し、使い切った分にのみ20%の税率で贈与税がかかる。
   * 超過分（基礎控除を除く全額）は贈与時の価額で相続財産に加算され、納めた贈与税は全額が相続税から控除（還付含む）される。
   * 暦年贈与と異なり、相続開始までの期間に関係なく加算対象になる代わりに、年110万円の基礎控除部分は
   * 何年前の贈与であっても一切加算されない。
   */
  function seisanKazeiPerRecipient(annualGift, effectiveGiftYears) {
    var totalGift = effectiveGiftYears * annualGift;
    var basicDeductionUsedPerYear = Math.min(annualGift, SEISAN_BASIC_DEDUCTION);
    var totalBasicDeductionUsed = effectiveGiftYears * basicDeductionUsedPerYear;
    var totalExcess = effectiveGiftYears * Math.max(0, annualGift - SEISAN_BASIC_DEDUCTION);
    var specialDeductionUsed = Math.min(totalExcess, SEISAN_SPECIAL_DEDUCTION);
    var taxablePortion = Math.max(0, totalExcess - SEISAN_SPECIAL_DEDUCTION);
    var giftTax = taxablePortion * SEISAN_FLAT_RATE;

    return {
      totalGift: totalGift,
      totalBasicDeductionUsed: totalBasicDeductionUsed,
      totalExcess: totalExcess,
      specialDeductionUsed: specialDeductionUsed,
      taxablePortion: taxablePortion,
      giftTax: giftTax,
      addback: totalExcess, // 基礎控除分を除く全額が相続財産に加算される
      giftTaxCredit: giftTax, // 全額が相続税額から控除される（超過分は還付）
    };
  }

  /**
   * メインの計算関数。DOM に依存せず、単体テスト可能。
   * @param {Object} input
   *   estateTotal: 生前贈与前の相続財産総額（円）
   *   hasSpouse: boolean
   *   childCount: 整数
   *   giftRecipients: 整数（受贈者数、暦年贈与・相続時精算課税とも共通）
   *   annualGiftPerRecipient: 受贈者1人あたりの年間贈与額（円、両シナリオ共通）
   *   giftYears: 生前贈与を続ける年数
   *   yearsUntilInheritance: 相続開始までの残り年数
   *   lookbackPeriod: 3 または 7（暦年贈与の持ち戻し対象期間）
   */
  function calc(input) {
    var estateTotal = clampNonNegative(input.estateTotal);
    var hasSpouse = !!input.hasSpouse;
    var childCount = clampNonNegativeInt(input.childCount);
    var giftRecipients = clampNonNegativeInt(input.giftRecipients);
    var annualGift = clampNonNegative(input.annualGiftPerRecipient);
    var giftYears = clampNonNegativeInt(input.giftYears);
    var yearsUntilInheritance = clampNonNegativeInt(input.yearsUntilInheritance);
    var lookbackPeriod = Number(input.lookbackPeriod) === 3 ? 3 : 7;

    var heirs = legalHeirs(hasSpouse, childCount);
    var basicDeduction = BASIC_DEDUCTION_FIXED + BASIC_DEDUCTION_PER_HEIR * heirs.count;

    var effectiveGiftYears = Math.min(giftYears, yearsUntilInheritance);
    if (!isFinite(effectiveGiftYears) || effectiveGiftYears < 0) effectiveGiftYears = 0;

    // ---- シナリオB：暦年贈与を選んだ場合 ----
    var koyenAnnualGiftTax = koyenGiftTaxPerYear(annualGift);
    var koyenAddbackResult = koyenAddback(annualGift, koyenAnnualGiftTax, effectiveGiftYears, yearsUntilInheritance, lookbackPeriod);

    var totalGiftAmountB = giftRecipients * effectiveGiftYears * annualGift;
    var totalGiftTaxB = giftRecipients * effectiveGiftYears * koyenAnnualGiftTax;
    var totalAddbackNetB = giftRecipients * koyenAddbackResult.addbackNet;
    var totalGiftTaxCreditB = giftRecipients * koyenAddbackResult.giftTaxCredit;

    var estateAfterGiftsB = Math.max(0, estateTotal - totalGiftAmountB);
    var taxableForInheritanceB = estateAfterGiftsB + totalAddbackNetB;
    var taxableEstateB = Math.max(0, taxableForInheritanceB - basicDeduction);
    var totalTaxB = inheritanceTaxTotal(taxableEstateB, heirs, childCount);
    var familyInheritanceTaxB = Math.max(0, totalTaxB * (1 - heirs.spouseShare) - totalGiftTaxCreditB);
    var scenarioBTotal = totalGiftTaxB + familyInheritanceTaxB;

    // ---- シナリオC：相続時精算課税制度を選んだ場合 ----
    var seisan = seisanKazeiPerRecipient(annualGift, effectiveGiftYears);

    var totalGiftAmountC = giftRecipients * seisan.totalGift;
    var totalBasicDeductionUsedC = giftRecipients * seisan.totalBasicDeductionUsed;
    var totalGiftTaxC = giftRecipients * seisan.giftTax;
    var totalAddbackC = giftRecipients * seisan.addback;
    var totalGiftTaxCreditC = giftRecipients * seisan.giftTaxCredit;

    var estateAfterGiftsC = Math.max(0, estateTotal - totalGiftAmountC);
    var taxableForInheritanceC = estateAfterGiftsC + totalAddbackC;
    var taxableEstateC = Math.max(0, taxableForInheritanceC - basicDeduction);
    var totalTaxC = inheritanceTaxTotal(taxableEstateC, heirs, childCount);
    var familyInheritanceTaxC = Math.max(0, totalTaxC * (1 - heirs.spouseShare) - totalGiftTaxCreditC);
    var scenarioCTotal = totalGiftTaxC + familyInheritanceTaxC;

    var diff = scenarioBTotal - scenarioCTotal; // 正なら相続時精算課税制度が有利

    return {
      heirs: heirs,
      estateTotal: estateTotal,
      effectiveGiftYears: effectiveGiftYears,
      basicDeduction: basicDeduction,

      scenarioB: {
        totalGiftAmount: totalGiftAmountB,
        totalGiftTax: totalGiftTaxB,
        addbackNet: totalAddbackNetB,
        giftTaxCredit: totalGiftTaxCreditB,
        taxableForInheritance: taxableForInheritanceB,
        taxableEstate: taxableEstateB,
        totalTax: totalTaxB,
        familyInheritanceTax: familyInheritanceTaxB,
        total: scenarioBTotal,
      },
      scenarioC: {
        totalGiftAmount: totalGiftAmountC,
        totalBasicDeductionUsed: totalBasicDeductionUsedC,
        totalGiftTax: totalGiftTaxC,
        addback: totalAddbackC,
        giftTaxCredit: totalGiftTaxCreditC,
        taxableForInheritance: taxableForInheritanceC,
        taxableEstate: taxableEstateC,
        totalTax: totalTaxC,
        familyInheritanceTax: familyInheritanceTaxC,
        total: scenarioCTotal,
      },
      diff: diff,
    };
  }

  // Node.js（単体テスト）向けに公開
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      calc: calc,
      koyenGiftTaxPerYear: koyenGiftTaxPerYear,
      seisanKazeiPerRecipient: seisanKazeiPerRecipient,
      taxOnInheritanceShare: taxOnInheritanceShare,
      legalHeirs: legalHeirs,
    };
  }

  // ブラウザ環境でなければここで終了（Node での単体テストを想定）
  if (typeof document === "undefined") {
    return;
  }

  var els = {
    estateTotal: document.getElementById("estateTotal"),
    hasSpouse: document.getElementById("hasSpouse"),
    childCount: document.getElementById("childCount"),
    giftRecipients: document.getElementById("giftRecipients"),
    annualGift: document.getElementById("annualGift"),
    giftYears: document.getElementById("giftYears"),
    yearsUntilInheritance: document.getElementById("yearsUntilInheritance"),
    lookbackPeriod: document.getElementById("lookbackPeriod"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    scenarioBTotal: document.getElementById("result-scenario-b-total"),
    scenarioCTotal: document.getElementById("result-scenario-c-total"),
    diff: document.getElementById("result-diff"),
    permanentExclusion: document.getElementById("result-permanent-exclusion"),
    tableBody: document.getElementById("breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function render() {
    var childCount = Math.max(0, Math.min(10, Math.round(Number(els.childCount.value) || 0)));

    var r = calc({
      estateTotal: clampNonNegative(els.estateTotal.value) * 10000,
      hasSpouse: els.hasSpouse.value === "yes",
      childCount: childCount,
      giftRecipients: els.giftRecipients.value,
      annualGiftPerRecipient: clampNonNegative(els.annualGift.value) * 10000,
      giftYears: els.giftYears.value,
      yearsUntilInheritance: els.yearsUntilInheritance.value,
      lookbackPeriod: els.lookbackPeriod.value,
    });

    if (r.heirs.count === 0) {
      els.verdict.textContent = "相続人の情報を入力してください";
      els.verdictSub.textContent =
        "本ツールは「配偶者＋子（第1順位）」が相続人となるケースを想定しています。子がおらず父母・兄弟姉妹のみが相続人になるケースには対応していません。";
      [els.scenarioBTotal, els.scenarioCTotal, els.diff, els.permanentExclusion].forEach(function (el) {
        el.textContent = "－";
      });
      els.tableBody.innerHTML = "";
      if (chart) {
        chart.destroy();
        chart = null;
      }
      return;
    }

    els.scenarioBTotal.textContent = manYen(r.scenarioB.total);
    els.scenarioCTotal.textContent = manYen(r.scenarioC.total);
    els.diff.textContent = (r.diff >= 0 ? "" : "－") + manYen(Math.abs(r.diff));
    els.permanentExclusion.textContent = manYen(r.scenarioC.totalBasicDeductionUsed);

    var THRESHOLD = 10000;
    if (Math.abs(r.diff) < THRESHOLD) {
      els.verdict.textContent = "この条件では暦年贈与・相続時精算課税でほぼ差がありません";
      els.verdictSub.textContent =
        "暦年贈与を選んだ場合の負担額 " + manYen(r.scenarioB.total) + " と、相続時精算課税制度を選んだ場合の負担額 " + manYen(r.scenarioC.total) + " はほぼ同水準です。";
    } else if (r.diff > 0) {
      els.verdict.textContent = "この条件では相続時精算課税制度を選んだ方が有利です";
      els.verdictSub.textContent =
        "暦年贈与を選んだ場合の負担額合計が " + manYen(r.scenarioB.total) + " なのに対し、相続時精算課税制度を選んだ場合は " + manYen(r.scenarioC.total) + "（" + manYen(r.diff) + " 少ない）になる試算です。年110万円の基礎控除部分が相続開始直前の贈与でも加算対象にならない点が主な要因です。";
    } else {
      els.verdict.textContent = "この条件では暦年贈与を選んだ方が有利です";
      els.verdictSub.textContent =
        "相続時精算課税制度を選んだ場合の負担額合計は " + manYen(r.scenarioC.total) + " となり、暦年贈与を選んだ場合の負担額 " + manYen(r.scenarioB.total) + " より " + manYen(Math.abs(r.diff)) + " 多くなる試算です。生前贈与加算の対象期間（3年・7年）より前の贈与が暦年贈与では相続財産から完全に切り離せている可能性があります。";
    }

    var rows = [
      ["【シナリオB：暦年贈与を選んだ場合】", ""],
      ["生前贈与の累計額（実行分）", manYen(r.scenarioB.totalGiftAmount)],
      ["贈与税の累計額", manYen(r.scenarioB.totalGiftTax)],
      ["相続財産への持ち戻し額（生前贈与加算、基礎控除以下の部分も含む）", manYen(r.scenarioB.addbackNet)],
      ["贈与税額控除（持ち戻し分の二重課税排除）", manYen(r.scenarioB.giftTaxCredit)],
      ["相続税の課税価格", manYen(r.scenarioB.taxableForInheritance)],
      ["課税遺産総額", manYen(r.scenarioB.taxableEstate)],
      ["相続税の家族負担額（贈与税額控除後）", manYen(r.scenarioB.familyInheritanceTax)],
      ["負担額合計（贈与税＋相続税）", manYen(r.scenarioB.total)],
      ["【シナリオC：相続時精算課税制度を選んだ場合】", ""],
      ["生前贈与の累計額（実行分）", manYen(r.scenarioC.totalGiftAmount)],
      ["年110万円の基礎控除の累計活用額（相続財産から永久に除外）", manYen(r.scenarioC.totalBasicDeductionUsed)],
      ["贈与税の累計額（特別控除2,500万円超過分に一律20%）", manYen(r.scenarioC.totalGiftTax)],
      ["相続財産への加算額（基礎控除を除く全額、贈与時の価額）", manYen(r.scenarioC.addback)],
      ["贈与税額控除（納付済み贈与税を全額控除）", manYen(r.scenarioC.giftTaxCredit)],
      ["相続税の課税価格", manYen(r.scenarioC.taxableForInheritance)],
      ["課税遺産総額", manYen(r.scenarioC.taxableEstate)],
      ["相続税の家族負担額（贈与税額控除後）", manYen(r.scenarioC.familyInheritanceTax)],
      ["負担額合計（贈与税＋相続税）", manYen(r.scenarioC.total)],
    ];
    els.tableBody.innerHTML = rows
      .map(function (row) {
        var isHeader = row[1] === "";
        return isHeader
          ? '<tr class="wall-crossed"><td colspan="2"><strong>' + row[0] + "</strong></td></tr>"
          : "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: ["B：暦年贈与", "C：相続時精算課税制度"],
      datasets: [
        {
          label: "贈与税",
          data: [Math.round(r.scenarioB.totalGiftTax), Math.round(r.scenarioC.totalGiftTax)],
          backgroundColor: "#d98e04",
        },
        {
          label: "相続税",
          data: [Math.round(r.scenarioB.familyInheritanceTax), Math.round(r.scenarioC.familyInheritanceTax)],
          backgroundColor: "#0f5f4c",
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: function (v) { return yen(v); } } },
      },
      plugins: {
        legend: { display: true, position: "bottom" },
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
  }

  [
    els.estateTotal,
    els.hasSpouse,
    els.childCount,
    els.giftRecipients,
    els.annualGift,
    els.giftYears,
    els.yearsUntilInheritance,
    els.lookbackPeriod,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

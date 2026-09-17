(function () {
  "use strict";

  // ---- 相続税（js/souzokuzei.js と完全に同じ値・ロジック） ----
  var BASIC_DEDUCTION_FIXED = 30000000;
  var BASIC_DEDUCTION_PER_HEIR = 6000000;
  var SPOUSE_TAX_FREE_MIN = 160000000;

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

  // ---- 贈与税（暦年課税・特例贈与財産用。直系尊属→18歳以上の子・孫） ----
  var GIFT_BASIC_DEDUCTION = 1100000;
  var GIFT_TAX_BRACKETS = [
    { limit: 2000000, rate: 0.10, deduct: 0 },
    { limit: 4000000, rate: 0.15, deduct: 100000 },
    { limit: 6000000, rate: 0.20, deduct: 300000 },
    { limit: 10000000, rate: 0.30, deduct: 900000 },
    { limit: 15000000, rate: 0.40, deduct: 1900000 },
    { limit: 30000000, rate: 0.45, deduct: 2650000 },
    { limit: 45000000, rate: 0.50, deduct: 4150000 },
    { limit: Infinity, rate: 0.55, deduct: 6400000 },
  ];

  // 生前贈与加算の「延長された4年間（4〜7年目）」分について、合計100万円まで加算対象から控除できる特例
  var EXTENDED_PERIOD_EXCLUSION = 1000000;

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

  // 受贈者1人・1年あたりの贈与税額（暦年課税・基礎控除110万円控除後に特例贈与の速算表を適用）
  function giftTaxPerYear(annualGift) {
    var taxable = Math.max(0, annualGift - GIFT_BASIC_DEDUCTION);
    return taxByBrackets(taxable, GIFT_TAX_BRACKETS);
  }

  // 相続人構成から法定相続人数・法定相続分を判定（配偶者＋子〈第1順位〉のケースのみ対応。js/souzokuzei.js と同じ）
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

  // 課税価格から相続税の総額を算出（js/souzokuzei.js と同じ考え方）
  function inheritanceTaxTotal(taxableEstate, heirs, childCount) {
    if (taxableEstate <= 0 || heirs.count === 0) return 0;
    var spouseTaxableShare = taxableEstate * heirs.spouseShare;
    var childTaxableShareEach = taxableEstate * heirs.childShareEach;
    return taxOnInheritanceShare(spouseTaxableShare) + childCount * taxOnInheritanceShare(childTaxableShareEach);
  }

  /**
   * 生前贈与を実行した場合の、1受贈者・1年あたりの贈与のうち「相続財産への持ち戻し（生前贈与加算）」対象額と、
   * それに対応する贈与税額を算出する。
   *
   * 簡略化モデル：
   * - 贈与は毎年、相続開始（想定）までの year=1..effectiveGiftYears の間、同額を実行するものとする。
   * - 相続開始の直前 lookbackPeriod 年以内（3年 or 7年）に行われた贈与だけを持ち戻し対象とする。
   * - 7年を選択した場合、延長された4年間（相続開始前4〜7年目）分の贈与のうち合計100万円までは
   *   持ち戻し対象額から控除する（実際の制度の経過措置の年ごとの適用スケジュールは考慮していない簡略化）。
   * - 持ち戻し対象から除外された分は、対応する贈与税額控除の対象からも除外する（二重に有利にしないため）。
   */
  function calcAddback(annualGift, annualGiftTax, effectiveGiftYears, yearsUntilInheritance, lookbackPeriod) {
    var addbackGross = 0;
    var addbackGiftTaxGross = 0;
    var extendedAmount = 0;

    for (var i = 1; i <= effectiveGiftYears; i++) {
      // この年の贈与が相続開始の何年前に行われたか（1年前〜）
      var distanceFromDeath = yearsUntilInheritance - i + 1;
      if (distanceFromDeath >= 1 && distanceFromDeath <= lookbackPeriod) {
        addbackGross += annualGift;
        addbackGiftTaxGross += annualGiftTax;
        if (lookbackPeriod === 7 && distanceFromDeath >= 4) {
          extendedAmount += annualGift;
        }
      }
    }

    var reduction = lookbackPeriod === 7 ? Math.min(EXTENDED_PERIOD_EXCLUSION, extendedAmount) : 0;
    var addbackNet = Math.max(0, addbackGross - reduction);
    var creditRatio = addbackGross > 0 ? addbackNet / addbackGross : 0;
    var giftTaxCredit = addbackGiftTaxGross * creditRatio;

    return {
      addbackGross: addbackGross,
      addbackNet: addbackNet,
      giftTaxCredit: giftTaxCredit,
    };
  }

  /**
   * メインの計算関数。DOM に依存せず、単体テスト可能。
   * @param {Object} input
   *   estateTotal: 相続財産総額（円）
   *   hasSpouse: boolean
   *   childCount: 整数
   *   giftRecipients: 整数（受贈者数）
   *   annualGiftPerRecipient: 受贈者1人あたりの年間贈与額（円）
   *   giftYears: 生前贈与を続ける年数
   *   yearsUntilInheritance: 相続開始までの残り年数
   *   lookbackPeriod: 3 または 7
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

    // 相続開始より後に贈与することはできないため、実際に贈与が行われる年数は yearsUntilInheritance を上限にする
    var effectiveGiftYears = Math.min(giftYears, yearsUntilInheritance);
    if (!isFinite(effectiveGiftYears) || effectiveGiftYears < 0) effectiveGiftYears = 0;

    var annualGiftTax = giftTaxPerYear(annualGift);

    var addback = calcAddback(annualGift, annualGiftTax, effectiveGiftYears, yearsUntilInheritance, lookbackPeriod);

    // ---- シナリオA：生前贈与なし ----
    var basicDeductionA = BASIC_DEDUCTION_FIXED + BASIC_DEDUCTION_PER_HEIR * heirs.count;
    var taxableEstateA = Math.max(0, estateTotal - basicDeductionA);
    var totalTaxA = inheritanceTaxTotal(taxableEstateA, heirs, childCount);
    // 実際の遺産分割は法定相続分どおりに行われるものと仮定する（配偶者の税額軽減により配偶者の
    // 実質負担は常に0円になるため、家族全体の負担額は子（配偶者以外の相続人）の負担分と一致する）
    var familyPayableA = totalTaxA * (1 - heirs.spouseShare);

    // ---- シナリオB：生前贈与あり ----
    var totalGiftAmountPerRecipient = effectiveGiftYears * annualGift;
    var totalGiftTaxPerRecipient = effectiveGiftYears * annualGiftTax;
    var totalGiftAmount = giftRecipients * totalGiftAmountPerRecipient;
    var totalGiftTax = giftRecipients * totalGiftTaxPerRecipient;
    var totalAddbackNet = giftRecipients * addback.addbackNet;
    var totalGiftTaxCredit = giftRecipients * addback.giftTaxCredit;

    var estateAfterGifts = Math.max(0, estateTotal - totalGiftAmount);
    var taxableForInheritanceB = estateAfterGifts + totalAddbackNet;

    var basicDeductionB = BASIC_DEDUCTION_FIXED + BASIC_DEDUCTION_PER_HEIR * heirs.count;
    var taxableEstateB = Math.max(0, taxableForInheritanceB - basicDeductionB);
    var totalTaxB = inheritanceTaxTotal(taxableEstateB, heirs, childCount);
    var familyInheritanceTaxB = Math.max(0, totalTaxB * (1 - heirs.spouseShare) - totalGiftTaxCredit);

    var scenarioATotal = familyPayableA;
    var scenarioBTotal = totalGiftTax + familyInheritanceTaxB;
    var diff = scenarioATotal - scenarioBTotal; // 正なら生前贈与が有利

    return {
      heirs: heirs,
      hasSpouse: hasSpouse,
      childCount: childCount,
      estateTotal: estateTotal,
      annualGiftTax: annualGiftTax,
      effectiveGiftYears: effectiveGiftYears,

      scenarioA: {
        basicDeduction: basicDeductionA,
        taxableEstate: taxableEstateA,
        totalTax: totalTaxA,
        familyPayable: familyPayableA,
        total: scenarioATotal,
      },
      scenarioB: {
        totalGiftAmount: totalGiftAmount,
        totalGiftTax: totalGiftTax,
        addbackGross: giftRecipients * addback.addbackGross,
        addbackNet: totalAddbackNet,
        giftTaxCredit: totalGiftTaxCredit,
        estateAfterGifts: estateAfterGifts,
        taxableForInheritance: taxableForInheritanceB,
        basicDeduction: basicDeductionB,
        taxableEstate: taxableEstateB,
        totalTax: totalTaxB,
        familyInheritanceTax: familyInheritanceTaxB,
        total: scenarioBTotal,
      },
      diff: diff,
    };
  }

  // Node.js（単体テスト）向けに公開
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      calc: calc,
      giftTaxPerYear: giftTaxPerYear,
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
    scenarioATotal: document.getElementById("result-scenario-a-total"),
    scenarioBTotal: document.getElementById("result-scenario-b-total"),
    diff: document.getElementById("result-diff"),
    giftTaxTotal: document.getElementById("result-gift-tax-total"),
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
      [els.scenarioATotal, els.scenarioBTotal, els.diff, els.giftTaxTotal].forEach(function (el) {
        el.textContent = "－";
      });
      els.tableBody.innerHTML = "";
      if (chart) {
        chart.destroy();
        chart = null;
      }
      return;
    }

    els.scenarioATotal.textContent = manYen(r.scenarioA.total);
    els.scenarioBTotal.textContent = manYen(r.scenarioB.total);
    els.diff.textContent = (r.diff >= 0 ? "" : "－") + manYen(Math.abs(r.diff));
    els.giftTaxTotal.textContent = manYen(r.scenarioB.totalGiftTax);

    var THRESHOLD = 10000; // 1万円未満はほぼ差がないものとして扱う
    if (Math.abs(r.diff) < THRESHOLD) {
      els.verdict.textContent = "この条件では生前贈与の有無でほぼ差がありません";
      els.verdictSub.textContent =
        "シナリオA（生前贈与なし）の負担額 " + manYen(r.scenarioA.total) + " と、シナリオB（生前贈与あり）の負担額 " + manYen(r.scenarioB.total) + " はほぼ同水準です。";
    } else if (r.diff > 0) {
      els.verdict.textContent = "この条件では生前贈与を行った方が有利です";
      els.verdictSub.textContent =
        "生前贈与を行わない場合の負担額（相続税のみ）が " + manYen(r.scenarioA.total) + " なのに対し、生前贈与を行った場合は贈与税と相続税を合わせて " + manYen(r.scenarioB.total) + "（" + manYen(r.diff) + " 少ない）になる試算です。";
    } else {
      els.verdict.textContent = "この条件では生前贈与を行わない方が有利です";
      els.verdictSub.textContent =
        "生前贈与を行った場合の負担額合計は " + manYen(r.scenarioB.total) + " となり、生前贈与を行わない場合の相続税額 " + manYen(r.scenarioA.total) + " より " + manYen(Math.abs(r.diff)) + " 多くなる試算です。贈与額が基礎控除（年110万円）を超えて贈与税がかかっている、または生前贈与加算（持ち戻し）の対象になっている可能性があります。";
    }

    var rows = [
      ["【シナリオA：生前贈与なし】", ""],
      ["相続財産総額", manYen(r.estateTotal)],
      ["基礎控除額", manYen(r.scenarioA.basicDeduction)],
      ["課税遺産総額", manYen(r.scenarioA.taxableEstate)],
      ["相続税の総額（速算表ベース）", manYen(r.scenarioA.totalTax)],
      ["家族の負担額合計", manYen(r.scenarioA.familyPayable)],
      ["【シナリオB：生前贈与あり】", ""],
      ["生前贈与の累計額（実行分）", manYen(r.scenarioB.totalGiftAmount)],
      ["贈与税の累計額", manYen(r.scenarioB.totalGiftTax)],
      ["相続財産への持ち戻し額（加算対象、100万円控除後）", manYen(r.scenarioB.addbackNet)],
      ["贈与税額控除（持ち戻し分の二重課税排除）", manYen(r.scenarioB.giftTaxCredit)],
      ["相続税の課税価格（贈与後の財産＋持ち戻し額）", manYen(r.scenarioB.taxableForInheritance)],
      ["基礎控除額", manYen(r.scenarioB.basicDeduction)],
      ["課税遺産総額", manYen(r.scenarioB.taxableEstate)],
      ["相続税の総額（速算表ベース）", manYen(r.scenarioB.totalTax)],
      ["相続税の家族負担額（贈与税額控除後）", manYen(r.scenarioB.familyInheritanceTax)],
      ["負担額合計（贈与税＋相続税）", manYen(r.scenarioB.total)],
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
      labels: ["シナリオA（生前贈与なし）", "シナリオB（生前贈与あり）"],
      datasets: [
        {
          label: "贈与税",
          data: [0, Math.round(r.scenarioB.totalGiftTax)],
          backgroundColor: "#d98e04",
        },
        {
          label: "相続税",
          data: [Math.round(r.scenarioA.familyPayable), Math.round(r.scenarioB.familyInheritanceTax)],
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

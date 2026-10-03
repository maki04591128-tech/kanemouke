(function () {
  "use strict";

  var BASIC_DEDUCTION_FIXED = 30000000;
  var BASIC_DEDUCTION_PER_HEIR = 6000000;
  var SPOUSE_TAX_FREE_MIN = 160000000;
  var INSURANCE_EXEMPTION_PER_HEIR = 5000000;
  var MINOR_DEDUCTION_PER_YEAR = 100000;
  var MINOR_AGE_LIMIT = 18;
  var DISABLED_DEDUCTION_PER_YEAR_GENERAL = 100000;
  var DISABLED_DEDUCTION_PER_YEAR_SPECIAL = 200000;
  var DISABLED_AGE_LIMIT = 85;

  // 小規模宅地等の特例：区分ごとの限度面積（㎡）と減額割合
  var LOT_TYPES = {
    residential: { area: 330, rate: 0.8, label: "特定居住用宅地等" },
    business: { area: 400, rate: 0.8, label: "特定事業用宅地等" },
    rental: { area: 200, rate: 0.5, label: "貸付事業用宅地等" },
  };

  // 相続税の速算表（各法定相続人の法定相続分に応じた取得金額に適用）
  var TAX_BRACKETS = [
    { limit: 10000000, rate: 0.10, deduct: 0 },
    { limit: 30000000, rate: 0.15, deduct: 500000 },
    { limit: 50000000, rate: 0.20, deduct: 2000000 },
    { limit: 100000000, rate: 0.30, deduct: 7000000 },
    { limit: 200000000, rate: 0.40, deduct: 17000000 },
    { limit: 300000000, rate: 0.45, deduct: 27000000 },
    { limit: 600000000, rate: 0.50, deduct: 42000000 },
    { limit: Infinity, rate: 0.55, deduct: 72000000 },
  ];

  var els = {
    estateTotal: document.getElementById("souzokuzei-estateTotal"),
    hasSpouse: document.getElementById("souzokuzei-hasSpouse"),
    childCount: document.getElementById("souzokuzei-childCount"),
    spouseShareRow: document.getElementById("souzokuzei-spouseShareRow"),
    spouseSharePct: document.getElementById("souzokuzei-spouseSharePct"),
    spouseSharePctOut: document.getElementById("souzokuzei-spouseSharePctOut"),
    lifeInsurance: document.getElementById("souzokuzei-lifeInsurance"),
    retirementBenefit: document.getElementById("souzokuzei-retirementBenefit"),
    minorCount: document.getElementById("souzokuzei-minorCount"),
    minorAge: document.getElementById("souzokuzei-minorAge"),
    minorRow: document.getElementById("souzokuzei-minorRow"),
    minorAgeRow: document.getElementById("souzokuzei-minorAgeRow"),
    disabledCount: document.getElementById("souzokuzei-disabledCount"),
    disabledType: document.getElementById("souzokuzei-disabledType"),
    disabledAge: document.getElementById("souzokuzei-disabledAge"),
    disabledRow: document.getElementById("souzokuzei-disabledRow"),
    disabledTypeRow: document.getElementById("souzokuzei-disabledTypeRow"),
    disabledAgeRow: document.getElementById("souzokuzei-disabledAgeRow"),
    grandchildAdoptedCount: document.getElementById("souzokuzei-grandchildAdoptedCount"),
    grandchildRow: document.getElementById("souzokuzei-grandchildRow"),
    hasLot: document.getElementById("souzokuzei-hasLot"),
    lotType: document.getElementById("souzokuzei-lotType"),
    lotValue: document.getElementById("souzokuzei-lotValue"),
    lotArea: document.getElementById("souzokuzei-lotArea"),
    lotTypeRow: document.getElementById("souzokuzei-lotTypeRow"),
    lotValueRow: document.getElementById("souzokuzei-lotValueRow"),
    lotAreaRow: document.getElementById("souzokuzei-lotAreaRow"),
    lot2Row: document.getElementById("souzokuzei-lot2Row"),
    hasLot2: document.getElementById("souzokuzei-hasLot2"),
    lotType2: document.getElementById("souzokuzei-lotType2"),
    lotValue2: document.getElementById("souzokuzei-lotValue2"),
    lotArea2: document.getElementById("souzokuzei-lotArea2"),
    lotType2Row: document.getElementById("souzokuzei-lotType2Row"),
    lotValue2Row: document.getElementById("souzokuzei-lotValue2Row"),
    lotArea2Row: document.getElementById("souzokuzei-lotArea2Row"),
    verdict: document.getElementById("souzokuzei-verdict"),
    verdictSub: document.getElementById("souzokuzei-verdictSub"),
    totalTax: document.getElementById("souzokuzei-result-total-tax"),
    basicDeduction: document.getElementById("souzokuzei-result-basic-deduction"),
    taxableEstate: document.getElementById("souzokuzei-result-taxable-estate"),
    familyPayable: document.getElementById("souzokuzei-result-family-payable"),
    tableBody: document.getElementById("souzokuzei-breakdown-body"),
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

  // 取得金額に相続税の速算表を適用した税額
  function taxOnShare(amount) {
    if (amount <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      var b = TAX_BRACKETS[i];
      if (amount <= b.limit) {
        return amount * b.rate - b.deduct;
      }
    }
    return 0;
  }

  /**
   * 複数（最大2件）の土地について、小規模宅地等の特例による評価減の合計額を計算する。
   * ・貸付事業用宅地等を含まない組み合わせ（特定居住用＋特定事業用等）は限度面積をそのまま合算でき、
   *   各土地が自分の区分の限度面積までフルに適用される（プロラタ計算は不要）。
   * ・貸付事業用宅地等を含む組み合わせは、「（特定居住用の面積×200/330）＋（特定事業用等の面積×200/400）
   *   ＋貸付事業用の面積 ≦ 200㎡」となるよう限度面積を按分する必要がある。本ツールでは、各土地の
   *   「限度面積あたりの評価減額（評価減額÷按分後の必要面積）」が大きい土地から優先的に限度面積の
   *   残り枠を割り当てることで、合計の評価減額が最大になる組み合わせを試算する。
   */
  function combineLotReductions(lots) {
    var items = lots.map(function (lot) {
      var limit = LOT_TYPES[lot.type];
      var ownUsedArea = Math.min(lot.area, limit.area);
      var reductionIfFull = lot.area > 0 ? lot.value * (ownUsedArea / lot.area) * limit.rate : 0;
      return {
        label: limit.label,
        weightedDemand: ownUsedArea * (200 / limit.area),
        reductionIfFull: reductionIfFull,
      };
    });

    var hasRental = lots.some(function (lot) {
      return lot.type === "rental";
    });
    var totalWeightedDemand = items.reduce(function (sum, it) {
      return sum + it.weightedDemand;
    }, 0);

    if (!hasRental || items.length <= 1 || totalWeightedDemand <= 200) {
      return {
        total: items.reduce(function (sum, it) {
          return sum + it.reductionIfFull;
        }, 0),
        items: items.map(function (it) {
          return { label: it.label, reduction: it.reductionIfFull };
        }),
        prorated: false,
      };
    }

    // 限度面積（200㎡相当）の枠を使い切る必要があるため、1㎡あたりの評価減額が大きい土地から優先的に割り当てる
    var order = items
      .map(function (it, index) {
        return { it: it, index: index, density: it.weightedDemand > 0 ? it.reductionIfFull / it.weightedDemand : 0 };
      })
      .sort(function (a, b) {
        return b.density - a.density;
      });

    var budget = 200;
    var reductionByIndex = [];
    order.forEach(function (entry) {
      var used = Math.min(entry.it.weightedDemand, budget);
      var ratio = entry.it.weightedDemand > 0 ? used / entry.it.weightedDemand : 0;
      reductionByIndex[entry.index] = entry.it.reductionIfFull * ratio;
      budget -= used;
    });

    return {
      total: reductionByIndex.reduce(function (sum, r) {
        return sum + r;
      }, 0),
      items: items.map(function (it, index) {
        return { label: it.label, reduction: reductionByIndex[index] };
      }),
      prorated: true,
    };
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

  function updateVisibility(hasSpouse, childCount) {
    if (hasSpouse && childCount > 0) {
      els.spouseShareRow.style.display = "";
    } else {
      els.spouseShareRow.style.display = "none";
    }
    if (childCount > 0) {
      els.minorRow.style.display = "";
      els.minorCount.max = String(childCount);
      els.disabledRow.style.display = "";
      els.disabledCount.max = String(childCount);
      els.grandchildRow.style.display = "";
      els.grandchildAdoptedCount.max = String(childCount);
    } else {
      els.minorRow.style.display = "none";
      els.minorAgeRow.style.display = "none";
      els.disabledRow.style.display = "none";
      els.disabledTypeRow.style.display = "none";
      els.disabledAgeRow.style.display = "none";
      els.grandchildRow.style.display = "none";
    }
  }

  function render() {
    var estateTotal = clampNonNegative(els.estateTotal.value) * 10000;
    var hasSpouse = els.hasSpouse.value === "yes";
    var childCount = Math.max(0, Math.round(Number(els.childCount.value) || 0));

    updateVisibility(hasSpouse, childCount);
    var hasLot = els.hasLot.value === "yes";
    els.lotTypeRow.style.display = hasLot ? "" : "none";
    els.lotValueRow.style.display = hasLot ? "" : "none";
    els.lotAreaRow.style.display = hasLot ? "" : "none";
    els.lot2Row.style.display = hasLot ? "" : "none";
    var hasLot2 = hasLot && els.hasLot2.value === "yes";
    els.lotType2Row.style.display = hasLot2 ? "" : "none";
    els.lotValue2Row.style.display = hasLot2 ? "" : "none";
    els.lotArea2Row.style.display = hasLot2 ? "" : "none";

    var heirs = legalHeirs(hasSpouse, childCount);
    els.spouseSharePctOut.textContent = els.spouseSharePct.value + " %";

    if (heirs.count === 0) {
      els.verdict.textContent = "相続人の情報を入力してください";
      els.verdictSub.textContent =
        "本ツールは「配偶者＋子（第1順位）」が相続人となるケースを想定しています。子がおらず父母・兄弟姉妹のみが相続人になるケースには対応していません。";
      els.totalTax.textContent = "－";
      els.basicDeduction.textContent = manYen(BASIC_DEDUCTION_FIXED);
      els.taxableEstate.textContent = "－";
      els.familyPayable.textContent = "－";
      els.tableBody.innerHTML = "";
      if (chart) {
        chart.destroy();
        chart = null;
      }
      return;
    }

    var basicDeduction = BASIC_DEDUCTION_FIXED + BASIC_DEDUCTION_PER_HEIR * heirs.count;

    // 生命保険金・死亡退職金の非課税枠（それぞれ別枠で「500万円×法定相続人の数」まで）。
    // 入力値は遺産総額に含めて入力してもらう前提のため、非課税枠相当額を遺産総額から
    // 追加で差し引く（基礎控除と同様の扱い）。相続人以外が受け取った分は対象外だが、
    // 本ツールは相続人（配偶者・子）が受け取った前提で簡略化している。
    var insuranceCap = INSURANCE_EXEMPTION_PER_HEIR * heirs.count;
    var lifeInsuranceAmount = clampNonNegative(els.lifeInsurance.value) * 10000;
    var retirementBenefitAmount = clampNonNegative(els.retirementBenefit.value) * 10000;
    var lifeInsuranceExemption = Math.min(lifeInsuranceAmount, insuranceCap);
    var retirementBenefitExemption = Math.min(retirementBenefitAmount, insuranceCap);

    // 2割加算：子のうち「孫を養子にした人（代襲相続人を除く）」は、本来の「子」として
    // 法定相続分・基礎控除の計算には加わるものの、相続税額自体には2割加算がかかる。
    // 未成年者控除・障害者控除の対象の子とは重複しない別の子を想定した簡易モデルのため、
    // 残りの子の人数（childCount－この人数）の範囲で未成年者控除・障害者控除の人数を数える。
    var grandchildAdoptedCount = Math.min(childCount, Math.max(0, Math.round(Number(els.grandchildAdoptedCount.value) || 0)));
    var nonGrandchildChildCount = Math.max(0, childCount - grandchildAdoptedCount);

    // 未成年者控除：未成年（18歳未満）の相続人1人につき「（18歳－年齢）×10万円」を
    // 本人の相続税額から差し引く。複数人いる場合は全員が同じ代表年齢であると
    // 仮定して試算する（年齢が人ごとに異なる場合の厳密な計算は対象外）。
    var minorCount = Math.min(nonGrandchildChildCount, Math.max(0, Math.round(Number(els.minorCount.value) || 0)));
    var minorAge = Math.min(MINOR_AGE_LIMIT - 1, Math.max(0, Math.round(Number(els.minorAge.value) || 0)));
    els.minorAgeRow.style.display = minorCount > 0 ? "" : "none";
    var minorDeductionEach = minorCount > 0 ? (MINOR_AGE_LIMIT - minorAge) * MINOR_DEDUCTION_PER_YEAR : 0;
    var minorDeductionTotal = minorDeductionEach * minorCount;

    // 障害者控除：障害のある相続人1人につき「（85歳－相続開始時の年齢）×10万円（特別障害者は20万円）」を
    // 本人の相続税額から差し引く。未成年者控除と同じ子を重複してカウントしないよう、
    // 障害者の人数は「（子の人数－孫養子の人数）－未成年の子の人数」の範囲に収める（複数の属性に
    // 該当する子がいる場合は孫養子→未成年者控除の人数を優先し、障害者の人数には含めない前提の簡易モデル）。
    var disabledCount = Math.min(
      Math.max(0, nonGrandchildChildCount - minorCount),
      Math.max(0, Math.round(Number(els.disabledCount.value) || 0))
    );
    var disabledType = els.disabledType.value === "special" ? "special" : "general";
    var disabledAge = Math.min(DISABLED_AGE_LIMIT - 1, Math.max(0, Math.round(Number(els.disabledAge.value) || 0)));
    els.disabledTypeRow.style.display = disabledCount > 0 ? "" : "none";
    els.disabledAgeRow.style.display = disabledCount > 0 ? "" : "none";
    var disabledPerYear = disabledType === "special" ? DISABLED_DEDUCTION_PER_YEAR_SPECIAL : DISABLED_DEDUCTION_PER_YEAR_GENERAL;
    var disabilityDeductionEach = disabledCount > 0 ? (DISABLED_AGE_LIMIT - disabledAge) * disabledPerYear : 0;
    var disabilityDeductionTotal = disabilityDeductionEach * disabledCount;

    // 小規模宅地等の特例：自宅・事業用・貸付用の土地のうち1件分について、
    // 「評価額 ×（限度面積÷土地全体の面積、上限100%）× 減額割合」で評価減を計算し、
    // 遺産総額から基礎控除・非課税枠と同様に追加で差し引く。配偶者・同居親族・
    // 家なき子特例といった取得者ごとの適用要件の判定は行わない簡易モデル。
    var lotType = LOT_TYPES.hasOwnProperty(els.lotType.value) ? els.lotType.value : "residential";
    var lotValueAmount = clampNonNegative(els.lotValue.value) * 10000;
    var lotArea = clampNonNegative(els.lotArea.value);
    var lotType2 = LOT_TYPES.hasOwnProperty(els.lotType2.value) ? els.lotType2.value : "residential";
    var lotValueAmount2 = clampNonNegative(els.lotValue2.value) * 10000;
    var lotArea2 = clampNonNegative(els.lotArea2.value);

    var lots = [];
    if (hasLot && lotValueAmount > 0 && lotArea > 0) {
      lots.push({ type: lotType, value: lotValueAmount, area: lotArea });
    }
    if (hasLot2 && lotValueAmount2 > 0 && lotArea2 > 0) {
      lots.push({ type: lotType2, value: lotValueAmount2, area: lotArea2 });
    }
    var lotCombined = lots.length > 0 ? combineLotReductions(lots) : { total: 0, items: [], prorated: false };
    var lotReduction = lotCombined.total;

    var taxableEstate = Math.max(
      0,
      estateTotal - basicDeduction - lifeInsuranceExemption - retirementBenefitExemption - lotReduction
    );

    var totalTax = 0;
    if (taxableEstate > 0) {
      var spouseTaxableShare = taxableEstate * heirs.spouseShare;
      var childTaxableShareEach = taxableEstate * heirs.childShareEach;
      totalTax = taxOnShare(spouseTaxableShare) + childCount * taxOnShare(childTaxableShareEach);
    }

    // 実際の取得割合（配偶者のみの場合は全額配偶者が取得するものとして扱う）
    var spouseActualSharePct = hasSpouse ? (childCount > 0 ? Number(els.spouseSharePct.value) / 100 : 1) : 0;
    var spouseActualAmount = estateTotal * spouseActualSharePct;
    var childrenActualAmountTotal = estateTotal - spouseActualAmount;
    var childActualAmountEach = childCount > 0 ? childrenActualAmountTotal / childCount : 0;

    var spouseAllocatedTax = estateTotal > 0 ? totalTax * (spouseActualAmount / estateTotal) : 0;
    var childrenAllocatedTaxTotal = totalTax - spouseAllocatedTax;

    // 配偶者の税額軽減：配偶者取得額のうち「1.6億円」と「配偶者の法定相続分相当額」のいずれか多い金額までは非課税
    var spouseLegalAmount = estateTotal * heirs.spouseShare;
    var eligibleAmount = Math.max(SPOUSE_TAX_FREE_MIN, spouseLegalAmount);
    var taxFreeBase = Math.min(spouseActualAmount, eligibleAmount);
    var spouseReduction = estateTotal > 0 ? totalTax * (taxFreeBase / estateTotal) : 0;
    var spouseFinalTax = Math.max(0, spouseAllocatedTax - spouseReduction);

    // 未成年者控除・障害者控除の適用：まず本人の相続税額から差し引き、引ききれない分は
    // 扶養義務者（控除の対象外の「その他の子」→配偶者の順）の税額から差し引く。未成年者控除→
    // 障害者控除の順で処理するため、障害者控除の繰越しは未成年者控除の繰越し処理後の残額に対して行う。
    var childTaxPerChildBase = childCount > 0 ? childrenAllocatedTaxTotal / childCount : 0;

    // 2割加算：孫養子1人あたりの相続税額は「本来の取得金額に対する税額×1.2」になる。
    // 加算分（×0.2）は配偶者の税額軽減や他の子の控除の繰越しとは無関係に、家族全体の
    // 納税額に単純に上乗せされる（2割加算は本人の税額を増やすだけで、他の相続人の
    // 税額には影響しない制度のため）。
    var grandchildSurchargeEach = childTaxPerChildBase * 1.2;
    var grandchildSurchargeTotal = grandchildSurchargeEach * grandchildAdoptedCount;
    var grandchildSurchargeExtra = grandchildSurchargeTotal - childTaxPerChildBase * grandchildAdoptedCount;

    var plainChildCount = Math.max(0, nonGrandchildChildCount - minorCount - disabledCount);
    var plainChildrenTaxTotal = childTaxPerChildBase * plainChildCount;

    var minorRemainingTotal = Math.max(0, childTaxPerChildBase - minorDeductionEach) * minorCount;
    var minorExcessRemaining = Math.max(0, minorDeductionEach - childTaxPerChildBase) * minorCount;
    var minorCarryToPlain = Math.min(minorExcessRemaining, plainChildrenTaxTotal);
    plainChildrenTaxTotal -= minorCarryToPlain;
    minorExcessRemaining -= minorCarryToPlain;
    var minorCarryToSpouse = Math.min(minorExcessRemaining, spouseFinalTax);
    spouseFinalTax -= minorCarryToSpouse;
    minorExcessRemaining -= minorCarryToSpouse;
    var appliedMinorDeduction = minorDeductionTotal - minorExcessRemaining;

    var disabledRemainingTotal = Math.max(0, childTaxPerChildBase - disabilityDeductionEach) * disabledCount;
    var disabledExcessRemaining = Math.max(0, disabilityDeductionEach - childTaxPerChildBase) * disabledCount;
    var disabledCarryToPlain = Math.min(disabledExcessRemaining, plainChildrenTaxTotal);
    plainChildrenTaxTotal -= disabledCarryToPlain;
    disabledExcessRemaining -= disabledCarryToPlain;
    var disabledCarryToSpouse = Math.min(disabledExcessRemaining, spouseFinalTax);
    spouseFinalTax -= disabledCarryToSpouse;
    disabledExcessRemaining -= disabledCarryToSpouse;
    var appliedDisabilityDeduction = disabilityDeductionTotal - disabledExcessRemaining;

    childrenAllocatedTaxTotal = minorRemainingTotal + disabledRemainingTotal + plainChildrenTaxTotal + grandchildSurchargeTotal;

    var hasSpecialChildGroups = minorCount > 0 || disabledCount > 0 || grandchildAdoptedCount > 0;
    var familyPayable = spouseFinalTax + childrenAllocatedTaxTotal;
    var childEachFinalTax = childCount > 0 ? childrenAllocatedTaxTotal / childCount : 0;
    var minorChildFinalTaxEach = minorCount > 0 ? minorRemainingTotal / minorCount : 0;
    var disabledChildFinalTaxEach = disabledCount > 0 ? disabledRemainingTotal / disabledCount : 0;
    var plainChildFinalTaxEach = plainChildCount > 0 ? plainChildrenTaxTotal / plainChildCount : 0;

    els.totalTax.textContent = manYen(totalTax);
    els.basicDeduction.textContent = manYen(basicDeduction);
    els.taxableEstate.textContent = manYen(taxableEstate);
    els.familyPayable.textContent = manYen(familyPayable);

    if (taxableEstate <= 0) {
      els.verdict.textContent = "相続税はかかりません（遺産総額が基礎控除の範囲内です）";
      els.verdictSub.textContent =
        "基礎控除額 " + manYen(basicDeduction) + " が遺産総額を上回っているため、相続税の申告・納税は原則不要です。";
    } else if (hasSpouse) {
      els.verdict.textContent = "相続税の総額は " + manYen(totalTax) + " の見込みです";
      els.verdictSub.textContent =
        "配偶者の税額軽減により配偶者の納税額は " + manYen(spouseFinalTax) + "" +
        (childCount > 0 ? "、子の納税額は合計 " + manYen(childrenAllocatedTaxTotal) + "" : "") +
        "、家族全体の納税額は " + manYen(familyPayable) + " になる見込みです" +
        deductionNote() +
        "。";
    } else {
      els.verdict.textContent = "相続税の総額は " + manYen(totalTax) + " の見込みです";
      els.verdictSub.textContent =
        "配偶者がいないため税額軽減の対象はなく、子" + childCount + "人で合計 " + manYen(familyPayable) + " を負担する見込みです" +
        (hasSpecialChildGroups ? "" : "（1人あたり " + manYen(childEachFinalTax) + "）") +
        deductionNote() +
        "。";
    }

    function deductionNote() {
      var notes = [];
      if (grandchildSurchargeExtra > 0) notes.push("孫養子の2割加算 +" + manYen(grandchildSurchargeExtra));
      if (appliedMinorDeduction > 0) notes.push("未成年者控除 " + manYen(appliedMinorDeduction));
      if (appliedDisabilityDeduction > 0) notes.push("障害者控除 " + manYen(appliedDisabilityDeduction));
      return notes.length > 0 ? "（" + notes.join("・") + "を反映済み）" : "";
    }

    var rows = [
      ["遺産総額（課税価格の合計額）", manYen(estateTotal)],
      ["法定相続人の数", heirs.count + " 人"],
      ["基礎控除額", manYen(basicDeduction)],
    ];
    if (lifeInsuranceAmount > 0) {
      rows.push(["生命保険金の非課税枠（上限 " + manYen(insuranceCap) + "）", manYen(lifeInsuranceExemption)]);
    }
    if (retirementBenefitAmount > 0) {
      rows.push(["死亡退職金の非課税枠（上限 " + manYen(insuranceCap) + "）", manYen(retirementBenefitExemption)]);
    }
    if (lotCombined.items.length === 1 && lotCombined.items[0].reduction > 0) {
      rows.push([
        "小規模宅地等の特例による評価減（" + lotCombined.items[0].label + "）",
        manYen(lotCombined.items[0].reduction),
      ]);
    } else if (lotCombined.items.length > 1) {
      lotCombined.items.forEach(function (item, index) {
        if (item.reduction > 0) {
          rows.push([
            "小規模宅地等の特例による評価減（" + (index + 1) + "件目：" + item.label + "）" +
              (lotCombined.prorated ? "※限度面積を按分" : ""),
            manYen(item.reduction),
          ]);
        }
      });
    }
    rows.push(["課税遺産総額", manYen(taxableEstate)]);
    rows.push(["相続税の総額（速算表ベース）", manYen(totalTax)]);
    if (hasSpouse) {
      rows.push(["配偶者の取得額（実際）", manYen(spouseActualAmount)]);
      rows.push(["配偶者の税額軽減額", manYen(spouseReduction)]);
      rows.push(["配偶者の納税額（軽減後）", manYen(spouseFinalTax)]);
    }
    if (childCount > 0) {
      rows.push(["子1人あたりの取得額（実際・均等割）", manYen(childActualAmountEach)]);
      if (grandchildAdoptedCount > 0) {
        rows.push(["孫養子（2割加算対象、代襲相続人を除く）の人数", grandchildAdoptedCount + " 人"]);
        rows.push(["孫養子1人あたりの納税額（2割加算後）", manYen(grandchildSurchargeEach)]);
        rows.push(["2割加算による増加額（合計）", manYen(grandchildSurchargeExtra)]);
      }
      if (minorCount > 0) {
        rows.push(["未成年者控除額（1人あたり、" + minorAge + "歳の場合）", manYen(minorDeductionEach)]);
        rows.push(["未成年の子1人あたりの納税額（控除後）", manYen(minorChildFinalTaxEach)]);
      }
      if (disabledCount > 0) {
        rows.push([
          "障害者控除額（1人あたり、" + (disabledType === "special" ? "特別障害者" : "一般障害者") + "・" + disabledAge + "歳の場合）",
          manYen(disabilityDeductionEach),
        ]);
        rows.push(["障害のある子1人あたりの納税額（控除後）", manYen(disabledChildFinalTaxEach)]);
      }
      if (hasSpecialChildGroups) {
        if (plainChildCount > 0) {
          rows.push(["その他の子1人あたりの納税額", manYen(plainChildFinalTaxEach)]);
        }
      } else {
        rows.push(["子1人あたりの納税額", manYen(childEachFinalTax)]);
      }
      rows.push(["子の納税額合計", manYen(childrenAllocatedTaxTotal)]);
    }
    rows.push(["家族全体の納税額合計", manYen(familyPayable)]);

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("souzokuzei-growthChart").getContext("2d");
    var exemptPortion = estateTotal - taxableEstate;
    var data = {
      labels: ["非課税部分（基礎控除・保険金等の非課税枠）", "課税遺産総額（税率が適用される部分）"],
      datasets: [
        {
          data: [Math.round(exemptPortion), Math.round(taxableEstate)],
          backgroundColor: ["#7fa998", "#c96b3f"],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var value = ctx.parsed;
              var pct = estateTotal > 0 ? (value / estateTotal) * 100 : 0;
              return ctx.label + "：" + yen(value) + "（" + pct.toFixed(1) + "%）";
            },
          },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "doughnut", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("souzokuzei-growthDataTable", chart);
  }

  [els.estateTotal, els.hasSpouse, els.childCount, els.spouseSharePct, els.lifeInsurance, els.retirementBenefit, els.minorCount, els.minorAge, els.disabledCount, els.disabledType, els.disabledAge, els.grandchildAdoptedCount, els.hasLot, els.lotType, els.lotValue, els.lotArea, els.hasLot2, els.lotType2, els.lotValue2, els.lotArea2].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

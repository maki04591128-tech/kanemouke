(function () {
  "use strict";

  var BASIC_DEDUCTION_FIXED = 30000000;
  var BASIC_DEDUCTION_PER_HEIR = 6000000;
  var SPOUSE_TAX_FREE_MIN = 160000000;

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
  }

  function render() {
    var estateTotal = clampNonNegative(els.estateTotal.value) * 10000;
    var hasSpouse = els.hasSpouse.value === "yes";
    var childCount = Math.max(0, Math.round(Number(els.childCount.value) || 0));

    updateVisibility(hasSpouse, childCount);

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
    var taxableEstate = Math.max(0, estateTotal - basicDeduction);

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

    var familyPayable = spouseFinalTax + childrenAllocatedTaxTotal;
    var childEachFinalTax = childCount > 0 ? childrenAllocatedTaxTotal / childCount : 0;

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
        "、家族全体の納税額は " + manYen(familyPayable) + " になる見込みです。";
    } else {
      els.verdict.textContent = "相続税の総額は " + manYen(totalTax) + " の見込みです";
      els.verdictSub.textContent =
        "配偶者がいないため税額軽減の対象はなく、子" + childCount + "人で合計 " + manYen(familyPayable) + " を負担する見込みです（1人あたり " + manYen(childEachFinalTax) + "）。";
    }

    var rows = [
      ["遺産総額（課税価格の合計額）", manYen(estateTotal)],
      ["法定相続人の数", heirs.count + " 人"],
      ["基礎控除額", manYen(basicDeduction)],
      ["課税遺産総額", manYen(taxableEstate)],
      ["相続税の総額（速算表ベース）", manYen(totalTax)],
    ];
    if (hasSpouse) {
      rows.push(["配偶者の取得額（実際）", manYen(spouseActualAmount)]);
      rows.push(["配偶者の税額軽減額", manYen(spouseReduction)]);
      rows.push(["配偶者の納税額（軽減後）", manYen(spouseFinalTax)]);
    }
    if (childCount > 0) {
      rows.push(["子1人あたりの取得額（実際・均等割）", manYen(childActualAmountEach)]);
      rows.push(["子1人あたりの納税額", manYen(childEachFinalTax)]);
      rows.push(["子の納税額合計", manYen(childrenAllocatedTaxTotal)]);
    }
    rows.push(["家族全体の納税額合計", manYen(familyPayable)]);

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("souzokuzei-growthChart").getContext("2d");
    var exemptPortion = Math.min(estateTotal, basicDeduction);
    var data = {
      labels: ["基礎控除相当額（非課税）", "課税遺産総額（税率が適用される部分）"],
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
  }

  [els.estateTotal, els.hasSpouse, els.childCount, els.spouseSharePct].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

(function () {
  "use strict";

  var RESIDENT_TAX_RATE = 0.10;
  var COMBINED_CAP_EMPLOYEE = 55000;

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

  // 2024年12月の制度改正後の職業区分ごとの拠出限度額ルール
  var CATEGORIES = {
    self_employed: {
      label: "自営業者・フリーランス・学生（国民年金第1号被保険者）",
      baseCap: 68000,
      hasOffset: true,
      offsetLabel: "国民年金基金・国民年金の付加保険料の月額掛金",
      offsetHint: "国民年金基金の掛金や国民年金の付加保険料（月400円）など、iDeCoと合算枠を共有する制度の月額掛金です。加入していない場合は0のままで構いません。",
      combinedCap: 68000,
    },
    employee_no_pension: {
      label: "会社員（お勤め先に企業年金制度がない）",
      baseCap: 23000,
      hasOffset: false,
    },
    employee_dc_only: {
      label: "会社員（企業型確定拠出年金（企業型DC）のみ加入）",
      baseCap: 20000,
      hasOffset: true,
      offsetLabel: "企業型DC事業主掛金の月額",
      offsetHint: "勤務先が拠出している企業型DCの事業主掛金の月額です。「掛金額のお知らせ」や給与明細でご確認いただけます。不明な場合は0のまま（上限まで拠出できるものとして）試算します。",
      combinedCap: COMBINED_CAP_EMPLOYEE,
    },
    employee_db: {
      label: "会社員（確定給付企業年金（DB）に加入、またはDBと企業型DCの両方に加入）",
      baseCap: 20000,
      hasOffset: true,
      offsetLabel: "他制度の掛金相当額の月額（DB等）",
      offsetHint: "DBの掛金相当額など、iDeCoと合算枠を共有する他制度の月額換算額です。正確な金額は勤務先の人事・総務部門にご確認ください。不明な場合は0のまま（上限まで拠出できるものとして）試算します。",
      combinedCap: COMBINED_CAP_EMPLOYEE,
    },
    civil_servant: {
      label: "公務員（国民年金第2号被保険者）",
      baseCap: 20000,
      hasOffset: true,
      offsetLabel: "他制度の掛金相当額の月額（共済制度等）",
      offsetHint: "共済制度の掛金相当額など、iDeCoと合算枠を共有する他制度の月額換算額です。不明な場合は0のまま（上限まで拠出できるものとして）試算します。",
      combinedCap: COMBINED_CAP_EMPLOYEE,
    },
    dependent_spouse: {
      label: "専業主婦・主夫（国民年金第3号被保険者）",
      baseCap: 23000,
      hasOffset: false,
    },
    voluntary: {
      label: "国民年金任意加入被保険者（60歳以降の任意加入など）",
      baseCap: 68000,
      hasOffset: true,
      offsetLabel: "国民年金基金・国民年金の付加保険料の月額掛金",
      offsetHint: "国民年金基金の掛金や国民年金の付加保険料など、iDeCoと合算枠を共有する制度の月額掛金です。加入していない場合は0のままで構いません。",
      combinedCap: 68000,
    },
  };

  var CATEGORY_ORDER = [
    "self_employed",
    "employee_no_pension",
    "employee_dc_only",
    "employee_db",
    "civil_servant",
    "dependent_spouse",
    "voluntary",
  ];

  var els = {
    category: document.getElementById("category"),
    offsetRow: document.getElementById("offsetRow"),
    offsetLabel: document.getElementById("offsetLabel"),
    offsetHint: document.getElementById("offsetHint"),
    offsetAmount: document.getElementById("offsetAmount"),
    taxableIncome: document.getElementById("taxableIncome"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    monthlyCap: document.getElementById("result-monthly-cap"),
    annualCap: document.getElementById("result-annual-cap"),
    remaining: document.getElementById("result-remaining"),
    taxRate: document.getElementById("result-tax-rate"),
    taxSaving: document.getElementById("result-tax-saving"),
    tableBody: document.getElementById("breakdown-body"),
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

  function calcMonthlyCap(category, offset) {
    if (!category.hasOffset) return category.baseCap;
    var remainingOfCombined = Math.max(0, category.combinedCap - offset);
    return Math.min(category.baseCap, remainingOfCombined);
  }

  function updateOffsetVisibility() {
    var category = CATEGORIES[els.category.value];
    if (category.hasOffset) {
      els.offsetRow.style.display = "";
      els.offsetLabel.textContent = category.offsetLabel;
      els.offsetHint.textContent = category.offsetHint;
    } else {
      els.offsetRow.style.display = "none";
    }
  }

  function render() {
    var categoryKey = els.category.value;
    var category = CATEGORIES[categoryKey];
    var offset = category.hasOffset ? clampNonNegative(els.offsetAmount.value) : 0;
    var taxableIncome = clampNonNegative(els.taxableIncome.value);

    var monthlyCap = calcMonthlyCap(category, offset);
    var annualCap = monthlyCap * 12;
    var marginalRate = marginalIncomeTaxRate(taxableIncome);
    var taxSaving = annualCap * (marginalRate + RESIDENT_TAX_RATE);

    els.monthlyCap.textContent = yen(monthlyCap);
    els.annualCap.textContent = yen(annualCap);
    els.taxRate.textContent = (marginalRate * 100).toFixed(0) + " %";
    els.taxSaving.textContent = yen(taxSaving);

    if (category.hasOffset) {
      els.remaining.textContent = yen(Math.max(0, category.combinedCap - offset));
    } else {
      els.remaining.textContent = "（合算枠なし）";
    }

    if (monthlyCap <= 0) {
      els.verdict.textContent = "他制度の掛金が合算枠に達しているため、iDeCoの拠出余地がありません";
      els.verdictSub.textContent = "入力した他制度の掛金相当額が合算枠の上限に達しています。金額を見直すか、勤務先に正確な掛金額をご確認ください。";
    } else {
      els.verdict.textContent =
        category.label + "の拠出限度額は 月額 " + yen(monthlyCap) + "（年額 " + yen(annualCap) + "）です";
      els.verdictSub.textContent =
        "上限まで拠出した場合の年間節税額の目安は " + yen(taxSaving) + "（所得税・住民税合計）です。";
    }

    var rows = [
      ["職業区分", category.label],
    ];
    if (category.hasOffset) {
      rows.push([category.offsetLabel, yen(offset)]);
      rows.push(["合算枠の上限（月額）", yen(category.combinedCap)]);
    }
    rows.push(["拠出限度額（月額）", yen(monthlyCap)]);
    rows.push(["拠出限度額（年額）", yen(annualCap)]);
    rows.push(["入力した年間課税所得の目安", yen(taxableIncome)]);
    rows.push(["所得税率（速算表）", (marginalRate * 100).toFixed(0) + " %"]);
    rows.push(["上限まで拠出した場合の年間節税額の目安", yen(taxSaving)]);

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var labels = CATEGORY_ORDER.map(function (key) {
      return CATEGORIES[key].label.split("（")[0];
    });
    var values = CATEGORY_ORDER.map(function (key) {
      return CATEGORIES[key].baseCap;
    });
    var colors = CATEGORY_ORDER.map(function (key) {
      return key === categoryKey ? "#d98e04" : "#0f5f4c";
    });

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "拠出限度額（月額・他制度掛金なしの場合）",
          data: values,
          backgroundColor: colors,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: "月額上限（円）" },
          ticks: { callback: function (v) { return v.toLocaleString("ja-JP") + " 円"; } },
        },
      },
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：" + yen(ctx.parsed.y);
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
      chart = new Chart(ctx, { type: "bar", data: data, options: options });
    }
  }

  els.category.addEventListener("change", function () {
    updateOffsetVisibility();
    render();
  });
  [els.offsetAmount, els.taxableIncome].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  updateOffsetVisibility();
  render();
})();

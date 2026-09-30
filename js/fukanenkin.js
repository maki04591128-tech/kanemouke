(function () {
  "use strict";

  // 付加年金（国民年金の付加保険料）シミュレーター。
  // 掛金は月400円固定、年金額は「200円×納付月数」で決まる単純な制度のため、
  // 積立複利計算は不要。納付月数・受給開始年齢（繰上げ・繰下げによる増減率）・
  // 受給後の想定年数から、総払込額・年間受取額・損益分岐年数・生涯受取総額を試算する。

  var MONTHLY_PREMIUM = 400; // 付加保険料（月額、固定）
  var ANNUAL_UNIT = 200; // 付加年金額の単価（納付1か月あたり、年額）
  var STANDARD_AGE = 65;
  var EARLY_REDUCTION_PER_MONTH = 0.004; // 繰上げ1か月あたりの減額率（令和4年4月以降の基準）
  var LATE_INCREASE_PER_MONTH = 0.007; // 繰下げ1か月あたりの増額率

  var els = {
    months: document.getElementById("fukanenkin-months"),
    monthsOut: document.getElementById("fukanenkin-monthsOut"),
    startAge: document.getElementById("fukanenkin-startAge"),
    startAgeOut: document.getElementById("fukanenkin-startAgeOut"),
    receiveYears: document.getElementById("fukanenkin-receiveYears"),
    receiveYearsOut: document.getElementById("fukanenkin-receiveYearsOut"),
    verdict: document.getElementById("fukanenkin-verdict"),
    verdictSub: document.getElementById("fukanenkin-verdictSub"),
    totalPaid: document.getElementById("fukanenkin-result-total-paid"),
    annualBenefit: document.getElementById("fukanenkin-result-annual-benefit"),
    breakEven: document.getElementById("fukanenkin-result-break-even"),
    lifetimeTotal: document.getElementById("fukanenkin-result-lifetime-total"),
    tableBody: document.getElementById("fukanenkin-breakdown-body"),
  };

  if (!els.months) return; // このタブが存在しないページでは何もしない

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // 老齢基礎年金と同率で適用される繰上げ減額・繰下げ増額率
  function adjustmentRate(startAge) {
    var diffMonths = Math.round((startAge - STANDARD_AGE) * 12);
    if (diffMonths < 0) return diffMonths * EARLY_REDUCTION_PER_MONTH; // 負の値（減額）
    return diffMonths * LATE_INCREASE_PER_MONTH; // 正の値（増額）
  }

  function render() {
    var months = Number(els.months.value);
    var startAge = Number(els.startAge.value);
    var receiveYears = Number(els.receiveYears.value);

    els.monthsOut.textContent = months + " か月（約" + (months / 12).toFixed(1) + "年）";
    els.startAgeOut.textContent = startAge + " 歳";
    els.receiveYearsOut.textContent = receiveYears + " 年";

    var totalPaid = MONTHLY_PREMIUM * months;
    var baseAnnualBenefit = ANNUAL_UNIT * months;
    var rate = adjustmentRate(startAge);
    var annualBenefit = baseAnnualBenefit * (1 + rate);
    var breakEvenYears = annualBenefit > 0 ? totalPaid / annualBenefit : Infinity;
    var lifetimeTotal = annualBenefit * receiveYears;
    var netBenefit = lifetimeTotal - totalPaid;

    els.totalPaid.textContent = yen(totalPaid);
    els.annualBenefit.textContent = yen(annualBenefit);
    els.breakEven.textContent = isFinite(breakEvenYears) ? breakEvenYears.toFixed(1) + " 年" : "-";
    els.lifetimeTotal.textContent = manYen(lifetimeTotal);

    if (netBenefit >= 0) {
      els.verdict.textContent =
        "受給開始から約" + breakEvenYears.toFixed(1) + "年で元が取れ、" + receiveYears + "年間で" + manYen(netBenefit) + "のプラスになる見込みです";
    } else {
      els.verdict.textContent =
        "想定の受給年数（" + receiveYears + "年）では元が取れず、" + manYen(Math.abs(netBenefit)) + "のマイナスになる見込みです";
    }
    if (rate < 0) {
      els.verdictSub.textContent =
        "繰上げ受給（" + startAge + "歳）のため、65歳受給に比べて年金額が" + Math.abs(rate * 100).toFixed(1) + "%減額されています。";
    } else if (rate > 0) {
      els.verdictSub.textContent =
        "繰下げ受給（" + startAge + "歳）のため、65歳受給に比べて年金額が" + (rate * 100).toFixed(1) + "%増額されています。65歳で受け取る場合、納付月数に関わらず損益分岐点は常に2年です。";
    } else {
      els.verdictSub.textContent =
        "付加年金は「200円÷400円＝1/2」の比率で決まるため、65歳で受け取る場合は納付月数に関わらず受給開始から2年で元が取れます。";
    }

    var rows = [
      ["付加保険料の納付月数", months + " か月"],
      ["付加保険料 総払込額（400円×納付月数）", yen(totalPaid)],
      ["付加年金額（65歳受給・調整前、200円×納付月数）", yen(baseAnnualBenefit) + " ／ 年"],
      ["受給開始年齢による増減率", (rate >= 0 ? "+" : "") + (rate * 100).toFixed(1) + " %"],
      ["付加年金額（調整後、毎年受け取れる金額）", yen(annualBenefit) + " ／ 年"],
      ["元が取れるまでの年数（受給開始から）", isFinite(breakEvenYears) ? breakEvenYears.toFixed(1) + " 年" : "-"],
      [receiveYears + "年間受け取った場合の受取総額", manYen(lifetimeTotal)],
      ["差引メリット（受取総額－総払込額）", manYen(netBenefit)],
    ];
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    // 横軸：付加保険料の納付開始からの経過年数。
    // 前半（納付期間）は累計払込額のみが増え、受給開始後は累計受取額が増えていく。
    var payYears = Math.ceil(months / 12);
    var totalYears = payYears + receiveYears;
    var labels = [];
    var paidData = [];
    var receivedData = [];
    for (var y = 0; y <= totalYears; y++) {
      labels.push(y + "年目");
      var monthsPaidSoFar = Math.min(months, y * 12);
      paidData.push(Math.round(MONTHLY_PREMIUM * monthsPaidSoFar));
      var yearsReceivedSoFar = Math.max(0, Math.min(receiveYears, y - payYears));
      receivedData.push(Math.round(annualBenefit * yearsReceivedSoFar));
    }

    var ctx = document.getElementById("fukanenkin-growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "累計受取額",
          data: receivedData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0,
          pointRadius: 0,
        },
        {
          label: "累計払込額",
          data: paidData,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
          fill: true,
          tension: 0,
          pointRadius: 0,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return yen(v); } } },
      },
      plugins: {
        legend: { display: false },
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
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("fukanenkin-growthDataTable", chart);
  }

  [els.months, els.startAge, els.receiveYears].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

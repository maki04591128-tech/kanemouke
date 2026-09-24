(function () {
  "use strict";

  var TOTAL_LIFETIME_CAP = 18000000; // 生涯投資枠（総枠）
  var GROWTH_LIFETIME_CAP = 12000000; // うち成長投資枠の上限
  var TSUMITATE_YEARLY_CAP = 1200000; // つみたて投資枠の年間上限
  var GROWTH_YEARLY_CAP = 2400000; // 成長投資枠の年間上限

  var els = {
    lifetimeUsed: document.getElementById("fukkatsu-lifetimeUsed"),
    growthUsed: document.getElementById("fukkatsu-growthUsed"),
    saleType: document.getElementById("fukkatsu-saleType"),
    saleCostBasis: document.getElementById("fukkatsu-saleCostBasis"),
    saleMarketValue: document.getElementById("fukkatsu-saleMarketValue"),
    verdict: document.getElementById("fukkatsu-verdict"),
    verdictSub: document.getElementById("fukkatsu-verdictSub"),
    revivedAmount: document.getElementById("fukkatsu-result-revived-amount"),
    lifetimeRemainAfter: document.getElementById("fukkatsu-result-lifetime-remain-after"),
    growthRemainAfter: document.getElementById("fukkatsu-result-growth-remain-after"),
    nextYearInvestable: document.getElementById("fukkatsu-result-next-year-investable"),
    errorBox: document.getElementById("fukkatsu-errorBox"),
    tableBody: document.getElementById("fukkatsu-breakdown-body"),
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

  function render() {
    var lifetimeUsed = Math.min(TOTAL_LIFETIME_CAP, clampNonNegative(els.lifetimeUsed.value));
    var growthUsed = Math.min(
      GROWTH_LIFETIME_CAP,
      clampNonNegative(els.growthUsed.value),
      lifetimeUsed
    );
    var saleType = els.saleType.value;
    var saleCostBasis = clampNonNegative(els.saleCostBasis.value);
    var saleMarketValue = clampNonNegative(els.saleMarketValue.value);

    els.lifetimeUsed.value = lifetimeUsed;
    els.growthUsed.value = growthUsed;

    var maxSellable = saleType === "growth" ? growthUsed : lifetimeUsed - growthUsed;
    var errors = [];
    if (saleCostBasis > maxSellable) {
      errors.push(
        "売却する商品の取得価額が、選択した枠の使用済み金額（" + manYen(maxSellable) + "）を超えています。"
      );
      saleCostBasis = maxSellable;
      els.saleCostBasis.value = saleCostBasis;
    }
    if (saleMarketValue > 0 && saleMarketValue < saleCostBasis) {
      errors.push("売却時の評価額が取得価額を下回っています（含み損での売却として計算します）。");
    }
    els.errorBox.style.display = errors.length ? "block" : "none";
    els.errorBox.innerHTML = errors.map(function (m) { return "<p>" + m + "</p>"; }).join("");

    var newLifetimeUsed = Math.max(0, lifetimeUsed - saleCostBasis);
    var newGrowthUsed =
      saleType === "growth" ? Math.max(0, growthUsed - saleCostBasis) : growthUsed;

    var lifetimeRemainBefore = TOTAL_LIFETIME_CAP - lifetimeUsed;
    var lifetimeRemainAfter = TOTAL_LIFETIME_CAP - newLifetimeUsed;
    var growthRemainBefore = GROWTH_LIFETIME_CAP - growthUsed;
    var growthRemainAfter = GROWTH_LIFETIME_CAP - newGrowthUsed;

    var nextYearTsumitate = Math.max(0, Math.min(TSUMITATE_YEARLY_CAP, lifetimeRemainAfter));
    var nextYearGrowth = Math.max(
      0,
      Math.min(GROWTH_YEARLY_CAP, growthRemainAfter, lifetimeRemainAfter)
    );

    var unrealizedGain = Math.max(0, saleMarketValue - saleCostBasis);

    els.revivedAmount.innerHTML =
      manYen(saleCostBasis) + (unrealizedGain > 0 ? "<small>（時価ではなく取得価額分）</small>" : "");
    els.lifetimeRemainAfter.textContent = manYen(lifetimeRemainAfter) + " / 1,800万円";
    els.growthRemainAfter.textContent = manYen(growthRemainAfter) + " / 1,200万円";
    els.nextYearInvestable.textContent =
      "つみたて " + manYen(nextYearTsumitate) + " ・ 成長 " + manYen(nextYearGrowth);

    if (saleCostBasis <= 0) {
      els.verdict.textContent = "取得価額を入力すると、復活する枠の金額がわかります";
      els.verdictSub.textContent = "売却しても、生涯投資枠が復活するのは翌年からです。";
    } else {
      els.verdict.textContent =
        "翌年以降、生涯投資枠が " + manYen(saleCostBasis) + " 分だけ復活します";
      if (unrealizedGain > 0) {
        els.verdictSub.textContent =
          "評価額 " + manYen(saleMarketValue) + " のうち、値上がり分 " + manYen(unrealizedGain) +
          " は枠に反映されません。復活するのはあくまで取得価額（簿価）分だけです。";
      } else {
        els.verdictSub.textContent =
          "今年中に売却しても、今年の年間投資枠には反映されません。使えるのは翌年1月1日以降です。";
      }
    }

    var rows = [
      ["区分", "売却前", "売却後（翌年以降）"],
      [
        "生涯投資枠 使用額（総枠）",
        yen(lifetimeUsed),
        yen(newLifetimeUsed),
      ],
      [
        "生涯投資枠 残り",
        manYen(lifetimeRemainBefore),
        manYen(lifetimeRemainAfter),
      ],
      [
        "うち成長投資枠 使用額",
        yen(growthUsed),
        yen(newGrowthUsed),
      ],
      [
        "うち成長投資枠 残り",
        manYen(growthRemainBefore),
        manYen(growthRemainAfter),
      ],
    ];
    els.tableBody.innerHTML = rows
      .slice(1)
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
      })
      .join("");

    var ctx = document.getElementById("fukkatsu-growthChart").getContext("2d");
    var data = {
      labels: ["売却前", "売却後（翌年以降）"],
      datasets: [
        {
          label: "成長投資枠 使用額",
          data: [growthUsed, newGrowthUsed],
          backgroundColor: "#0f5f4c",
          stack: "used",
        },
        {
          label: "つみたて投資枠 使用額",
          data: [lifetimeUsed - growthUsed, newLifetimeUsed - newGrowthUsed],
          backgroundColor: "#5fa88f",
          stack: "used",
        },
        {
          label: "残り枠",
          data: [lifetimeRemainBefore, lifetimeRemainAfter],
          backgroundColor: "#e4ece9",
          stack: "used",
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        x: {
          stacked: true,
          max: TOTAL_LIFETIME_CAP,
          ticks: { callback: function (v) { return manYen(v); } },
        },
        y: { stacked: true },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + "：" + manYen(ctx.parsed.x); },
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
    if (window.renderChartDataTable) window.renderChartDataTable("fukkatsu-growthDataTable", chart);
  }

  [
    els.lifetimeUsed,
    els.growthUsed,
    els.saleType,
    els.saleCostBasis,
    els.saleMarketValue,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

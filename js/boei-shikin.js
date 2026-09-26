(function () {
  "use strict";

  var els = {
    monthlyExpense: document.getElementById("boei-monthlyExpense"),
    employment: document.getElementById("boei-employment"),
    employmentHint: document.getElementById("boei-employmentHint"),
    months: document.getElementById("boei-months"),
    monthsOut: document.getElementById("boei-monthsOut"),
    current: document.getElementById("boei-current"),
    monthlySave: document.getElementById("boei-monthlySave"),
    verdict: document.getElementById("boei-verdict"),
    verdictSub: document.getElementById("boei-verdictSub"),
    target: document.getElementById("boei-result-target"),
    shortfall: document.getElementById("boei-result-shortfall"),
    period: document.getElementById("boei-result-period"),
  };

  var RECOMMENDED_MONTHS = { employee: 6, self: 12 };
  var EMPLOYMENT_HINT = {
    employee: "会社員・公務員は、収入が比較的安定しているため生活費の3〜6ヶ月分が目安とされています。",
    self: "自営業・フリーランス・個人事業主は、収入が変動しやすく仕事が途切れる期間もあり得るため生活費の6〜12ヶ月分が目安とされています。",
  };

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function formatPeriod(months) {
    if (months <= 0) return "0ヶ月";
    var years = Math.floor(months / 12);
    var rest = months % 12;
    if (years === 0) return rest + "ヶ月";
    if (rest === 0) return years + "年";
    return years + "年" + rest + "ヶ月";
  }

  function render() {
    var monthlyExpense = Math.max(0, Number(els.monthlyExpense.value) || 0);
    var months = Number(els.months.value);
    var current = Math.max(0, Number(els.current.value) || 0);
    var monthlySave = Math.max(0, Number(els.monthlySave.value) || 0);

    els.monthsOut.textContent = months + " ヶ月分";
    els.employmentHint.textContent = EMPLOYMENT_HINT[els.employment.value] || "";

    var target = monthlyExpense * months;
    var shortfall = Math.max(0, target - current);

    els.target.textContent = yen(target);
    els.shortfall.textContent = shortfall > 0 ? yen(shortfall) : "0 円（達成済み）";

    if (shortfall <= 0) {
      els.period.textContent = "達成済み";
      els.verdict.textContent = "生活防衛資金の目標にすでに到達しています";
      var ratio = target > 0 ? Math.round((current / target) * 100) : 100;
      els.verdictSub.textContent = "現在の防衛資金は目標金額の" + ratio + "%です。積立・投資に資金を回しやすい状態です。";
    } else if (monthlySave <= 0) {
      els.period.textContent = "-";
      els.verdict.textContent = "月々の確保額を入力すると、目標到達までの期間を試算できます";
      els.verdictSub.textContent = "不足額は" + yen(shortfall) + "です。";
    } else {
      var monthsToReach = Math.ceil(shortfall / monthlySave);
      els.period.textContent = formatPeriod(monthsToReach);
      els.verdict.textContent = "あと" + formatPeriod(monthsToReach) + "で目標に到達する見込みです";
      els.verdictSub.textContent = "不足額" + yen(shortfall) + "を、月々" + yen(monthlySave) + "ずつ確保した場合の目安です。";
    }

    var labels = [
      "現在の防衛資金",
      "目標（" + months + "ヶ月分）",
      "3ヶ月分の目安",
      "6ヶ月分の目安",
      "12ヶ月分の目安",
    ];
    var values = [
      current,
      target,
      monthlyExpense * 3,
      monthlyExpense * 6,
      monthlyExpense * 12,
    ];
    var colors = ["#7a8899", "#d98e04", "#bfe3d5", "#6fae97", "#0f5f4c"];

    var ctx = document.getElementById("boei-compareChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "金額",
          data: values.map(function (v) { return Math.round(v); }),
          backgroundColor: colors,
          borderRadius: 4,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
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
    if (window.renderChartDataTable) window.renderChartDataTable("boei-compareDataTable", chart);
  }

  els.employment.addEventListener("change", function () {
    var recommended = RECOMMENDED_MONTHS[els.employment.value];
    if (recommended) {
      els.months.value = recommended;
    }
    render();
  });

  [els.monthlyExpense, els.months, els.current, els.monthlySave].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

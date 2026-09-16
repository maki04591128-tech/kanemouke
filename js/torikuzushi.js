(function () {
  "use strict";

  var MAX_YEARS_CAP = 70;

  var els = {
    startAssets: document.getElementById("startAssets"),
    returnPct: document.getElementById("returnPct"),
    returnPctOut: document.getElementById("returnPctOut"),
    maxYears: document.getElementById("maxYears"),
    fixedAmount: document.getElementById("fixedAmount"),
    applyInflation: document.getElementById("applyInflation"),
    inflationPct: document.getElementById("inflationPct"),
    inflationPctOut: document.getElementById("inflationPctOut"),
    fixedRatePct: document.getElementById("fixedRatePct"),
    fixedRatePctOut: document.getElementById("fixedRatePctOut"),
    floorAmount: document.getElementById("floorAmount"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    resultFixed: document.getElementById("result-fixed"),
    resultPercent: document.getElementById("result-percent"),
    resultFloor: document.getElementById("result-floor"),
    compareBody: document.getElementById("compare-body"),
    noteBody: document.getElementById("note-body"),
  };

  var chart = null;

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // 年1回、その年の取り崩し額（withdrawalFn が年初残高から算出）を月割りで
  // 取り崩しながら、残りを想定利回りで複利運用する。資産が尽きた年以降は
  // 残高0のまま系列を埋め、3方式のグラフを同じ時間軸で比較できるようにする。
  function simulate(startAssetsYen, returnPct, maxYears, withdrawalFn) {
    var monthlyRate = returnPct / 100 / 12;
    var balance = startAssetsYen;
    var series = [balance];
    var depletedYear = null;
    var firstYearWithdrawal = null;

    for (var y = 1; y <= maxYears; y++) {
      if (balance <= 0) {
        series.push(0);
        continue;
      }

      var annualWithdrawal = Math.max(0, withdrawalFn(y, balance));
      if (y === 1) firstYearWithdrawal = annualWithdrawal;
      var monthlyWithdrawal = annualWithdrawal / 12;

      for (var m = 1; m <= 12; m++) {
        balance -= monthlyWithdrawal;
        if (balance <= 0) {
          balance = 0;
          break;
        }
        balance *= 1 + monthlyRate;
      }

      series.push(balance);
      if (balance <= 0 && depletedYear === null) {
        depletedYear = y;
      }
    }

    return {
      series: series,
      depletedYear: depletedYear,
      finalBalance: series[series.length - 1],
      firstYearWithdrawal: firstYearWithdrawal,
    };
  }

  function sustainText(result, maxYears) {
    if (result.depletedYear !== null) {
      return "約 " + result.depletedYear + " 年で資産が尽きる見込み";
    }
    return maxYears + " 年経過時点でも残高あり（尽きない見込み、残高 " + manYen(result.finalBalance) + "）";
  }

  function render() {
    var startAssetsYen = Math.max(0, Number(els.startAssets.value) || 0) * 10000;
    var returnPct = Number(els.returnPct.value);
    var maxYears = Math.min(MAX_YEARS_CAP, Math.max(1, Math.round(Number(els.maxYears.value) || 1)));
    var fixedAmountYen = Math.max(0, Number(els.fixedAmount.value) || 0) * 10000;
    var applyInflation = els.applyInflation.value === "yes";
    var inflationPct = Number(els.inflationPct.value);
    var fixedRatePct = Math.max(0, Number(els.fixedRatePct.value) || 0);
    var floorAmountYen = Math.max(0, Number(els.floorAmount.value) || 0) * 10000;

    els.returnPctOut.textContent = returnPct.toFixed(1) + " %";
    els.inflationPctOut.textContent = inflationPct.toFixed(1) + " %";
    els.fixedRatePctOut.textContent = fixedRatePct.toFixed(1) + " %";

    var fixed = simulate(startAssetsYen, returnPct, maxYears, function (y) {
      var factor = applyInflation ? Math.pow(1 + inflationPct / 100, y - 1) : 1;
      return fixedAmountYen * factor;
    });

    var percent = simulate(startAssetsYen, returnPct, maxYears, function (y, balance) {
      return balance * (fixedRatePct / 100);
    });

    var floorMethod = simulate(startAssetsYen, returnPct, maxYears, function (y, balance) {
      return Math.max(balance * (fixedRatePct / 100), floorAmountYen);
    });

    var methods = [
      {
        key: "fixed",
        label: "定額取り崩し",
        result: fixed,
        note: "毎年ほぼ一定の金額（生活費）を確保できるのが利点ですが、相場が下落した年も取り崩し額を減らさないため、他の方式に比べて資産が早く尽きやすい傾向があります。",
      },
      {
        key: "percent",
        label: "定率取り崩し",
        result: percent,
        note: "残高に対して一定の割合だけを取り崩すため、理論上は資産が完全にゼロにはなりにくい方式です。一方で残高が減るにつれて取り崩し額（使えるお金）も目減りしていくため、晩年の生活費が不安定になりやすい面があります。",
      },
      {
        key: "floor",
        label: "定率＋下限額",
        result: floorMethod,
        note: "「残高×定率」と「下限額」のうち大きい方を取り崩すことで、定率方式のように取り崩し額が際限なく目減りするのを防ぎます。相場下落が続くと下限額の適用によって定率方式より早く資産が尽きる可能性があります。",
      },
    ];

    els.resultFixed.textContent = sustainText(fixed, maxYears);
    els.resultPercent.textContent = sustainText(percent, maxYears);
    els.resultFloor.textContent = sustainText(floorMethod, maxYears);

    els.compareBody.innerHTML = methods
      .map(function (item) {
        return (
          "<tr><td>" +
          item.label +
          "</td><td>" +
          manYen(item.result.firstYearWithdrawal || 0) +
          "</td><td>" +
          sustainText(item.result, maxYears) +
          "</td></tr>"
        );
      })
      .join("");

    els.noteBody.innerHTML = methods
      .map(function (item) {
        return "<p><strong>" + item.label + "：</strong>" + item.note + "</p>";
      })
      .join("");

    var survivedAll = methods.every(function (item) { return item.result.depletedYear === null; });
    var depletedOnly = methods.filter(function (item) { return item.result.depletedYear !== null; });

    if (survivedAll) {
      els.verdict.textContent = "この条件では、3つの方式とも " + maxYears + " 年間資産が尽きない計算です";
      els.verdictSub.textContent = "取り崩し額・取り崩し率をさらに引き上げた場合にどう変わるかも試算してみてください。";
    } else if (depletedOnly.length === methods.length) {
      var slowest = depletedOnly.reduce(function (best, cur) {
        return cur.result.depletedYear > best.result.depletedYear ? cur : best;
      }, depletedOnly[0]);
      var fastest = depletedOnly.reduce(function (worst, cur) {
        return cur.result.depletedYear < worst.result.depletedYear ? cur : worst;
      }, depletedOnly[0]);
      els.verdict.textContent =
        "この条件では、3方式とも " + maxYears + " 年以内に資産が尽きる計算です（最短は「" + fastest.label + "」で約" + fastest.result.depletedYear + "年、最長は「" + slowest.label + "」で約" + slowest.result.depletedYear + "年）";
      els.verdictSub.textContent = "取り崩し額・取り崩し率を下げる、想定利回りの前提を見直すなどで持続年数がどう変わるか比較してみてください。";
    } else {
      var survived = methods.filter(function (item) { return item.result.depletedYear === null; });
      els.verdict.textContent =
        "この条件では、" + survived.map(function (i) { return "「" + i.label + "」"; }).join("と") + "は " + maxYears + " 年間資産が持続し、" +
        depletedOnly.map(function (i) { return "「" + i.label + "」は約" + i.result.depletedYear + "年で尽きる"; }).join("、") + " 計算です";
      els.verdictSub.textContent = "同じ初期資産・利回りでも、取り崩し方式によって資産の持続年数が大きく変わることが分かります。";
    }

    var chartLabels = [];
    for (var y = 0; y <= maxYears; y++) {
      chartLabels.push(y + "年目");
    }

    var colors = { fixed: "#0f5f4c", percent: "#d98e04", floor: "#c96b3f" };
    var datasets = methods.map(function (item) {
      return {
        label: item.label,
        data: item.result.series.map(function (v) { return Math.round(v); }),
        borderColor: colors[item.key],
        backgroundColor: "transparent",
        tension: 0.15,
        pointRadius: 0,
      };
    });

    var data = { labels: chartLabels, datasets: datasets };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + "：" + manYen(ctx.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(document.getElementById("growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
  }

  [
    els.startAssets,
    els.returnPct,
    els.maxYears,
    els.fixedAmount,
    els.applyInflation,
    els.inflationPct,
    els.fixedRatePct,
    els.floorAmount,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

(function () {
  "use strict";

  var els = {
    monthly: document.getElementById("bouraku-monthly"),
    preYears: document.getElementById("bouraku-preYears"),
    preYearsOut: document.getElementById("bouraku-preYearsOut"),
    annualRate: document.getElementById("bouraku-annualRate"),
    annualRateOut: document.getElementById("bouraku-annualRateOut"),
    fundSelect: document.getElementById("bouraku-fundSelect"),
    fundHint: document.getElementById("bouraku-fundHint"),
    shockPct: document.getElementById("bouraku-shockPct"),
    shockPctOut: document.getElementById("bouraku-shockPctOut"),
    shockMonths: document.getElementById("bouraku-shockMonths"),
    shockMonthsOut: document.getElementById("bouraku-shockMonthsOut"),
    postYears: document.getElementById("bouraku-postYears"),
    postYearsOut: document.getElementById("bouraku-postYearsOut"),
    verdict: document.getElementById("bouraku-verdict"),
    verdictSub: document.getElementById("bouraku-verdictSub"),
    resultPrincipal: document.getElementById("bouraku-result-principal"),
    resultContinue: document.getElementById("bouraku-result-continue"),
    resultPause: document.getElementById("bouraku-result-pause"),
    resultPanic: document.getElementById("bouraku-result-panic"),
    breakdownBody: document.getElementById("bouraku-breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function monthLabel(m) {
    var y = Math.floor(m / 12);
    var mm = m % 12;
    return mm === 0 ? y + "年" : y + "年" + mm + "ヶ月";
  }

  // 価格指数は想定年率トレンドリターンによる複利上昇線に、暴落発生時点（preMonths）から
  // 回復完了時点（recoverMonth）までの間だけV字型の下落→回復を重ねたものとして試算する。
  // 暴落開始前と回復完了後は、複利トレンドどおりに一定ペースで上昇する前提。
  function priceFactor(t, preMonths, recoverMonth, shockPct) {
    if (shockPct <= 0 || t <= preMonths || t >= recoverMonth) return 1;
    var half = (recoverMonth - preMonths) / 2;
    var local = t - preMonths;
    var extreme = 1 - shockPct / 100;
    if (local <= half) {
      return 1 + (extreme - 1) * (half === 0 ? 1 : local / half);
    }
    return extreme + (1 - extreme) * ((local - half) / half);
  }

  // 3つの戦略を月次で同時にシミュレーションする。
  // ・継続：暴落中も含めて毎月同額を買い続ける（下落局面で口数を安く買い増せる）
  // ・中断：暴落が始まったら積立を停止し現金で待機（保有分は売らずそのまま）、
  //   　　　回復完了時点で待機分をまとめて再投資し、以降は積立を再開する
  // ・狼狽売り：暴落開始直後は積立を続けるが、下落の底値（暴落期間の中間点）で
  //   　　　保有分を全額売却して現金化し、回復完了までは積立も停止。
  //   　　　回復完了時点で現金をまとめて再投資し、以降は積立を再開する
  // 3戦略とも投じる元本の合計額（毎月の積立額×期間）はまったく同じで、
  // 「暴落時にどう行動したか」だけが最終的な評価額の差になる。
  function simulate(monthly, preYears, annualRatePct, shockPct, shockMonths, postYears) {
    var monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
    var preMonths = Math.round(preYears * 12);
    var shockM = Math.max(1, Math.round(shockMonths));
    var postMonths = Math.round(postYears * 12);
    var recoverMonth = preMonths + shockM;
    var bottomMonth = preMonths + Math.round(shockM / 2);
    var totalMonths = recoverMonth + postMonths;

    function price(t) {
      return Math.pow(1 + monthlyRate, t) * priceFactor(t, preMonths, recoverMonth, shockPct);
    }

    var unitsContinue = 0;
    var unitsPause = 0,
      cashPause = 0;
    var unitsPanic = 0,
      cashPanic = 0;

    var months = [];
    var seriesContinue = [];
    var seriesPause = [];
    var seriesPanic = [];
    var seriesPrincipal = [];

    for (var m = 0; m <= totalMonths; m++) {
      var p = price(m);

      if (m === bottomMonth) {
        // 底値で狼狽売り：保有分を全額現金化
        cashPanic += unitsPanic * p;
        unitsPanic = 0;
      }
      if (m === recoverMonth) {
        // 回復完了時点で待機していた現金をまとめて再投資
        unitsPause += cashPause / p;
        cashPause = 0;
        unitsPanic += cashPanic / p;
        cashPanic = 0;
      }

      if (m < totalMonths) {
        unitsContinue += monthly / p;

        if (m >= preMonths && m < recoverMonth) {
          cashPause += monthly;
        } else {
          unitsPause += monthly / p;
        }

        if (m >= bottomMonth && m < recoverMonth) {
          cashPanic += monthly;
        } else {
          unitsPanic += monthly / p;
        }
      }

      months.push(m);
      seriesContinue.push(unitsContinue * p);
      seriesPause.push(unitsPause * p + cashPause);
      seriesPanic.push(unitsPanic * p + cashPanic);
      seriesPrincipal.push(monthly * Math.min(m, totalMonths));
    }

    return {
      preMonths: preMonths,
      shockM: shockM,
      recoverMonth: recoverMonth,
      bottomMonth: bottomMonth,
      totalMonths: totalMonths,
      months: months,
      seriesContinue: seriesContinue,
      seriesPause: seriesPause,
      seriesPanic: seriesPanic,
      seriesPrincipal: seriesPrincipal,
      finalContinue: seriesContinue[totalMonths],
      finalPause: seriesPause[totalMonths],
      finalPanic: seriesPanic[totalMonths],
      finalPrincipal: seriesPrincipal[totalMonths],
      bottomPriceIndex: price(bottomMonth) * 100,
    };
  }

  function render() {
    var monthly = Math.max(0, Number(els.monthly.value) || 0);
    var preYears = Number(els.preYears.value);
    var annualRatePct = Number(els.annualRate.value);
    var shockPct = Number(els.shockPct.value);
    var shockMonths = Number(els.shockMonths.value);
    var postYears = Number(els.postYears.value);

    els.preYearsOut.textContent = preYears + " 年";
    els.annualRateOut.textContent = annualRatePct.toFixed(1) + " %";
    els.shockPctOut.textContent = shockPct + " %";
    els.shockMonthsOut.textContent = shockMonths + " ヶ月";
    els.postYearsOut.textContent = postYears + " 年";

    var sim = simulate(monthly, preYears, annualRatePct, shockPct, shockMonths, postYears);

    els.resultPrincipal.textContent = yen(sim.finalPrincipal);
    els.resultContinue.textContent = yen(sim.finalContinue);
    els.resultPause.textContent = yen(sim.finalPause);
    els.resultPanic.textContent = yen(sim.finalPanic);

    var candidates = [
      { key: "continue", label: "積立を継続", value: sim.finalContinue },
      { key: "pause", label: "積立を中断（保有は継続）", value: sim.finalPause },
      { key: "panic", label: "狼狽売り", value: sim.finalPanic },
    ];
    var best = candidates[0],
      worst = candidates[0];
    candidates.forEach(function (c) {
      if (c.value > best.value) best = c;
      if (c.value < worst.value) worst = c;
    });
    var gap = best.value - worst.value;

    if (gap < 1000) {
      els.verdict.textContent = "この条件では3つの戦略による評価額の差はごくわずかです";
      els.verdictSub.textContent = "下落率や下落から回復までの期間を変えて、暴落の規模によって差がどう変わるか確認してください。";
    } else {
      els.verdict.textContent =
        "同じ金額を積み立てていても、暴落時の行動の違いで評価額に " + manYen(gap) + " の差が生まれました";
      els.verdictSub.textContent =
        "最も評価額が高いのは「" + best.label + "」、最も低いのは「" + worst.label + "」でした（投資元本はどの戦略も同額です）。";
    }

    els.breakdownBody.innerHTML =
      "<tr><td>暴落発生までの積立期間</td><td colspan=\"3\">" + preYears + " 年（" + sim.preMonths + " ヶ月）</td></tr>" +
      "<tr><td>下落〜回復にかかる期間</td><td colspan=\"3\">" + sim.shockM + " ヶ月（下落率 " + shockPct + " %、底値の価格指数（基準100）：" + sim.bottomPriceIndex.toFixed(1) + "）</td></tr>" +
      "<tr><td>回復後にさらに積立を続ける期間</td><td colspan=\"3\">" + postYears + " 年</td></tr>" +
      "<tr><td>投資元本（合計・3戦略とも同額）</td><td>" + yen(sim.finalPrincipal) + "</td><td>" + yen(sim.finalPrincipal) + "</td><td>" + yen(sim.finalPrincipal) + "</td></tr>" +
      "<tr><td><strong>最終評価額</strong></td><td><strong>" + yen(sim.finalContinue) + "</strong></td><td><strong>" + yen(sim.finalPause) + "</strong></td><td><strong>" + yen(sim.finalPanic) + "</strong></td></tr>" +
      "<tr><td>「積立を継続」との差額</td><td>±0 円</td><td>" + manYen(sim.finalPause - sim.finalContinue) + "</td><td>" + manYen(sim.finalPanic - sim.finalContinue) + "</td></tr>";

    var step = sim.totalMonths > 180 ? 3 : 1;
    var labels = [];
    var dataContinue = [];
    var dataPause = [];
    var dataPanic = [];
    var dataPrincipal = [];
    for (var i = 0; i < sim.months.length; i += step) {
      labels.push(monthLabel(sim.months[i]));
      dataContinue.push(Math.round(sim.seriesContinue[i]));
      dataPause.push(Math.round(sim.seriesPause[i]));
      dataPanic.push(Math.round(sim.seriesPanic[i]));
      dataPrincipal.push(Math.round(sim.seriesPrincipal[i]));
    }
    var lastIdx = sim.months.length - 1;
    if ((lastIdx % step) !== 0) {
      labels.push(monthLabel(sim.months[lastIdx]));
      dataContinue.push(Math.round(sim.seriesContinue[lastIdx]));
      dataPause.push(Math.round(sim.seriesPause[lastIdx]));
      dataPanic.push(Math.round(sim.seriesPanic[lastIdx]));
      dataPrincipal.push(Math.round(sim.seriesPrincipal[lastIdx]));
    }

    var data = {
      labels: labels,
      datasets: [
        {
          label: "積立を継続",
          data: dataContinue,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15,95,76,0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
        },
        {
          label: "積立を中断（保有は継続）",
          data: dataPause,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217,142,4,0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
        },
        {
          label: "狼狽売り",
          data: dataPanic,
          borderColor: "#c0392b",
          backgroundColor: "rgba(192,57,43,0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
        },
        {
          label: "投資元本（参考線）",
          data: dataPrincipal,
          borderColor: "#7a8899",
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
        },
      ],
    };

    var ctx = document.getElementById("bouraku-growthChart").getContext("2d");
    if (chart) {
      chart.data = data;
      chart.update();
    } else {
      chart = new Chart(ctx, {
        type: "line",
        data: data,
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { autoSkip: true, maxTicksLimit: 12 } },
            y: {
              ticks: {
                callback: function (v) {
                  return manYen(v);
                },
              },
            },
          },
        },
      });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("bouraku-growthDataTable", chart);
  }

  [
    els.monthly,
    els.preYears,
    els.annualRate,
    els.shockPct,
    els.shockMonths,
    els.postYears,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  if (window.setupFundSelect) {
    window.setupFundSelect(els.fundSelect, els.annualRate, els.fundHint, render);
  }

  render();
})();

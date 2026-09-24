(function () {
  "use strict";

  var MAX_ACCUMULATE_YEARS = 70;
  var MAX_SUSTAIN_YEARS = 70;

  var els = {
    currentAge: document.getElementById("fire-currentAge"),
    currentAssets: document.getElementById("fire-currentAssets"),
    monthly: document.getElementById("fire-monthly"),
    returnPct: document.getElementById("fire-returnPct"),
    returnPctOut: document.getElementById("fire-returnPctOut"),
    annualExpense: document.getElementById("fire-annualExpense"),
    withdrawalPct: document.getElementById("fire-withdrawalPct"),
    withdrawalPctOut: document.getElementById("fire-withdrawalPctOut"),
    postReturnPct: document.getElementById("fire-postReturnPct"),
    postReturnPctOut: document.getElementById("fire-postReturnPctOut"),
    inflationPct: document.getElementById("fire-inflationPct"),
    inflationPctOut: document.getElementById("fire-inflationPctOut"),
    verdict: document.getElementById("fire-verdict"),
    verdictSub: document.getElementById("fire-verdictSub"),
    target: document.getElementById("fire-result-target"),
    reach: document.getElementById("fire-result-reach"),
    reachAssets: document.getElementById("fire-result-reach-assets"),
    sustain: document.getElementById("fire-result-sustain"),
    breakdownBody: document.getElementById("fire-breakdown-body"),
  };

  var chart = null;

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // 毎月末に積立額を加算し、年率想定利回りを複利運用する前提で、
  // 目標資産額（targetYen）に達する月を検出する。maxYears以内に
  // 到達しない場合は reachMonth が null のまま返る。
  function accumulate(currentAssetsYen, monthlyYen, annualReturnPct, targetYen, maxYears) {
    var monthlyRate = annualReturnPct / 100 / 12;
    var assets = currentAssetsYen;
    var series = [assets];
    var reachMonth = assets >= targetYen ? 0 : null;
    var maxMonths = maxYears * 12;

    for (var m = 1; m <= maxMonths && reachMonth === null; m++) {
      assets = assets * (1 + monthlyRate) + monthlyYen;
      series.push(assets);
      if (assets >= targetYen) {
        reachMonth = m;
      }
    }

    return { series: series, reachMonth: reachMonth };
  }

  // リタイア後、年間生活費（インフレ率で毎年上昇）を月割りで取り崩しながら
  // 想定利回りで運用を続けた場合に、資産が何年で尽きるかを試算する。
  // maxYears以内に尽きない場合は depletedYear が null のまま返る。
  function sustain(startAssetsYen, annualExpenseYen, postReturnPct, inflationPct, maxYears) {
    var monthlyRate = postReturnPct / 100 / 12;
    var assets = startAssetsYen;
    var expenseAnnual = annualExpenseYen;
    var series = [assets];
    var depletedYear = null;

    for (var y = 1; y <= maxYears; y++) {
      var expenseMonthly = expenseAnnual / 12;
      for (var m = 1; m <= 12; m++) {
        assets -= expenseMonthly;
        if (assets <= 0) {
          assets = 0;
          break;
        }
        assets *= 1 + monthlyRate;
      }
      series.push(assets);
      if (assets <= 0) {
        depletedYear = y;
        break;
      }
      expenseAnnual *= 1 + inflationPct / 100;
    }

    return { series: series, depletedYear: depletedYear };
  }

  function formatYearsMonths(months) {
    var y = Math.floor(months / 12);
    var m = months % 12;
    if (y === 0 && m === 0) return "すでに達成";
    var text = "";
    if (y > 0) text += y + "年";
    if (m > 0) text += m + "ヶ月";
    return text;
  }

  function render() {
    var currentAge = Math.max(0, Number(els.currentAge.value) || 0);
    var currentAssetsYen = Math.max(0, Number(els.currentAssets.value) || 0) * 10000;
    var monthlyYen = Math.max(0, Number(els.monthly.value) || 0) * 10000;
    var returnPct = Number(els.returnPct.value);
    var annualExpenseYen = Math.max(0, Number(els.annualExpense.value) || 0) * 10000;
    var withdrawalPct = Number(els.withdrawalPct.value);
    var postReturnPct = Number(els.postReturnPct.value);
    var inflationPct = Number(els.inflationPct.value);

    els.returnPctOut.textContent = returnPct.toFixed(1) + " %";
    els.withdrawalPctOut.textContent = withdrawalPct.toFixed(1) + " %";
    els.postReturnPctOut.textContent = postReturnPct.toFixed(1) + " %";
    els.inflationPctOut.textContent = inflationPct.toFixed(1) + " %";

    var targetYen = withdrawalPct > 0 ? annualExpenseYen / (withdrawalPct / 100) : Infinity;

    var acc = accumulate(currentAssetsYen, monthlyYen, returnPct, targetYen, MAX_ACCUMULATE_YEARS);

    els.target.textContent = manYen(targetYen);

    var sus = null;
    var reachAge = null;

    if (acc.reachMonth === null) {
      els.reach.textContent = MAX_ACCUMULATE_YEARS + "年以内は未到達";
      els.reachAssets.textContent = "-";
      els.sustain.textContent = "-";

      els.verdict.textContent = "この条件では、" + MAX_ACCUMULATE_YEARS + "年以内にFIRE達成資産に届きません";
      els.verdictSub.textContent = "毎月の積立額を増やす、想定利回りを見直す、リタイア後の生活費や引き出し率を調整するなどして試算し直してみてください。";
    } else {
      var reachYears = Math.floor(acc.reachMonth / 12);
      var reachMonthsRem = acc.reachMonth % 12;
      reachAge = currentAge + acc.reachMonth / 12;
      var reachAssetsYen = acc.series[acc.series.length - 1];

      els.reach.textContent = formatYearsMonths(acc.reachMonth) + "後（" + reachAge.toFixed(1) + "歳）";
      els.reachAssets.textContent = manYen(reachAssetsYen);

      sus = sustain(reachAssetsYen, annualExpenseYen, postReturnPct, inflationPct, MAX_SUSTAIN_YEARS);

      if (sus.depletedYear === null) {
        els.sustain.textContent = MAX_SUSTAIN_YEARS + "年以上（枯渇しない見込み）";
      } else {
        els.sustain.textContent = "約" + sus.depletedYear + "年";
      }

      els.verdict.textContent =
        "現在" + currentAge + "歳なら、" + formatYearsMonths(acc.reachMonth) + "後（" + reachAge.toFixed(1) + "歳）にFIREを達成できる見込みです";

      if (sus.depletedYear === null) {
        els.verdictSub.textContent = "達成後にこの生活費・引き出し率・運用利回りで取り崩しを続けても、" + MAX_SUSTAIN_YEARS + "年以上資産が持続する見込みです。";
      } else {
        els.verdictSub.textContent =
          "ただし同じ生活費で取り崩しを続けると、リタイアから約" + sus.depletedYear + "年後（" + Math.round(reachAge + sus.depletedYear) + "歳ごろ）に資産が尽きる計算です。引き出し率を下げる、リタイア後の運用利回りを見直すなどの対策を検討してください。";
      }
    }

    els.breakdownBody.innerHTML =
      "<tr><td>FIRE達成に必要な資産額</td><td>" + manYen(targetYen) + "</td></tr>" +
      "<tr><td>現在の資産額</td><td>" + manYen(currentAssetsYen) + "</td></tr>" +
      "<tr><td><strong>達成までの期間</strong></td><td><strong>" + els.reach.textContent + "</strong></td></tr>" +
      "<tr><td>到達時点の資産額</td><td>" + els.reachAssets.textContent + "</td></tr>" +
      "<tr><td>リタイア後に資産が持つ期間の目安</td><td>" + els.sustain.textContent + "</td></tr>" +
      "<tr><td>想定引き出し率</td><td>" + withdrawalPct.toFixed(1) + " %</td></tr>" +
      "<tr><td>想定利回り（積立期間中 / リタイア後）</td><td>" + returnPct.toFixed(1) + " % / " + postReturnPct.toFixed(1) + " %</td></tr>" +
      "<tr><td>生活費の上昇率（インフレ率）</td><td>" + inflationPct.toFixed(1) + " %</td></tr>";

    // グラフ用に積立期間を1年刻みでダウンサンプリングし、達成後は
    // 取り崩しシミュレーションの年次系列をそのままつなげて描画する。
    var chartLabels = [];
    var chartData = [];
    var targetLine = [];
    var accLastIndex = acc.series.length - 1;

    for (var i = 0; i <= accLastIndex; i += 12) {
      chartLabels.push((currentAge + i / 12).toFixed(0) + "歳");
      chartData.push(Math.round(acc.series[i]));
      targetLine.push(Math.round(targetYen));
    }
    if ((accLastIndex % 12 !== 0) || accLastIndex === 0) {
      chartLabels.push((currentAge + accLastIndex / 12).toFixed(0) + "歳");
      chartData.push(Math.round(acc.series[accLastIndex]));
      targetLine.push(Math.round(targetYen));
    }

    if (sus) {
      var reachAgeRounded = currentAge + accLastIndex / 12;
      for (var y = 1; y < sus.series.length; y++) {
        chartLabels.push(Math.round(reachAgeRounded + y) + "歳");
        chartData.push(Math.round(sus.series[y]));
        targetLine.push(Math.round(targetYen));
      }
    }

    var data = {
      labels: chartLabels,
      datasets: [
        {
          label: "資産額の推移",
          data: chartData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.15,
          pointRadius: 0,
        },
        {
          label: "FIRE達成ライン（目標資産額）",
          data: targetLine,
          borderColor: "#d98e04",
          borderDash: [6, 4],
          fill: false,
          pointRadius: 0,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: false },
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
      chart = new Chart(document.getElementById("fire-growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
  }

  [els.currentAge, els.currentAssets, els.monthly, els.returnPct, els.annualExpense, els.withdrawalPct, els.postReturnPct, els.inflationPct].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

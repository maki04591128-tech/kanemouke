(function () {
  "use strict";

  // 分配金・譲渡益にかかる税率（20.315% = 所得税15%＋復興特別所得税0.315%＋住民税5%）
  var TAX_RATE = 0.20315;

  var els = {
    initial: document.getElementById("saitoushi-initial"),
    monthly: document.getElementById("saitoushi-monthly"),
    years: document.getElementById("saitoushi-years"),
    yearsOut: document.getElementById("saitoushi-yearsOut"),
    totalReturn: document.getElementById("saitoushi-totalReturn"),
    totalReturnOut: document.getElementById("saitoushi-totalReturnOut"),
    distYield: document.getElementById("saitoushi-distYield"),
    distYieldOut: document.getElementById("saitoushi-distYieldOut"),
    accountType: document.getElementById("saitoushi-accountType"),
    verdict: document.getElementById("saitoushi-verdict"),
    verdictSub: document.getElementById("saitoushi-verdictSub"),
    finalA: document.getElementById("saitoushi-result-final-a"),
    finalB: document.getElementById("saitoushi-result-final-b"),
    diff: document.getElementById("saitoushi-result-diff"),
    taxPaid: document.getElementById("saitoushi-result-tax-paid"),
    breakdownBody: document.getElementById("saitoushi-breakdown-body"),
  };

  var chart = null;

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  // 元本を上回った評価額分にのみ、指定税率で課税した場合の手取り評価額
  function netOfSaleTax(nav, costBasis, taxRate) {
    var gain = nav - costBasis;
    var tax = gain > 0 ? gain * taxRate : 0;
    return nav - tax;
  }

  // isDistributing=true の場合、毎月 NAV の distMonthlyRate 分を分配金として払い出し、
  // 税引後の手取り額をそのまま同じ商品に再投資する（受取型）。
  // isDistributing=false の場合は分配せず、そのまま運用を続ける（無分配・自動再投資型）。
  function simulate(initialYen, monthlyYen, months, totalMonthlyRate, distMonthlyRate, taxRate, isDistributing) {
    var nav = initialYen;
    var costBasis = initialYen;
    var cumDistGross = 0;
    var cumDistTax = 0;
    var series = [{ year: 0, net: netOfSaleTax(nav, costBasis, taxRate) }];

    for (var m = 1; m <= months; m++) {
      nav += monthlyYen;
      costBasis += monthlyYen;
      nav *= 1 + totalMonthlyRate;

      if (isDistributing && distMonthlyRate > 0 && nav > 0) {
        var distGross = nav * distMonthlyRate;
        nav -= distGross;
        var tax = distGross * taxRate;
        var distNet = distGross - tax;
        nav += distNet;
        costBasis += distNet;
        cumDistGross += distGross;
        cumDistTax += tax;
      }

      if (m % 12 === 0) {
        series.push({ year: m / 12, net: netOfSaleTax(nav, costBasis, taxRate) });
      }
    }
    if (months % 12 !== 0) {
      series.push({ year: months / 12, net: netOfSaleTax(nav, costBasis, taxRate) });
    }

    return {
      nav: nav,
      costBasis: costBasis,
      cumDistGross: cumDistGross,
      cumDistTax: cumDistTax,
      finalNet: netOfSaleTax(nav, costBasis, taxRate),
      series: series,
    };
  }

  function render() {
    var initialMan = Math.max(0, Number(els.initial.value) || 0);
    var monthlyMan = Math.max(0, Number(els.monthly.value) || 0);
    var initialYen = initialMan * 10000;
    var monthlyYen = monthlyMan * 10000;

    var years = Number(els.years.value);
    var months = Math.round(years * 12);

    var totalReturnPct = Number(els.totalReturn.value);
    var distYieldPct = Number(els.distYield.value);
    var accountType = els.accountType.value;
    var taxRate = accountType === "nisa" ? 0 : TAX_RATE;

    els.yearsOut.textContent = years + " 年";
    els.totalReturnOut.textContent = totalReturnPct.toFixed(1) + " %";
    els.distYieldOut.textContent = distYieldPct.toFixed(1) + " %";

    var totalMonthlyRate = totalReturnPct / 100 / 12;
    var distMonthlyRate = distYieldPct / 100 / 12;

    var scenarioA = simulate(initialYen, monthlyYen, months, totalMonthlyRate, distMonthlyRate, taxRate, true);
    var scenarioB = simulate(initialYen, monthlyYen, months, totalMonthlyRate, 0, taxRate, false);

    els.finalA.textContent = manYen(scenarioA.finalNet);
    els.finalB.textContent = manYen(scenarioB.finalNet);
    els.taxPaid.textContent = manYen(scenarioA.cumDistTax);

    var diff = scenarioB.finalNet - scenarioA.finalNet;
    els.diff.textContent = (diff >= 0 ? "+" : "") + manYen(diff) + "（B－A）";

    if (accountType === "nisa") {
      els.verdict.textContent = "NISA口座内では最終資産に差はありません";
      els.verdictSub.textContent =
        "分配金にも譲渡益にも税金がかからないNISA口座では、分配を受け取って再投資しても、無分配で運用を続けても、最終的な資産額は理論上一致します。";
    } else if (distYieldPct <= 0 || Math.abs(diff) < 1000) {
      els.verdict.textContent = "この条件では両方式にほとんど差がありません";
      els.verdictSub.textContent = "分配金利回りが0%に近い場合、分配型と無分配型の差はごくわずかになります。";
    } else if (diff > 0) {
      els.verdict.textContent = "無分配型（自動再投資）が有利です（差額 " + manYen(diff) + "）";
      els.verdictSub.textContent =
        "分配金は受け取るたびに20.315%課税され、その分だけ複利で増える前に目減りします。無分配型は売却するまで課税が繰り延べられるため、同じ運用利回りでも最終的な手取り資産が大きくなりやすい傾向があります。";
    } else {
      els.verdict.textContent = "分配型が有利です（差額 " + manYen(-diff) + "）";
      els.verdictSub.textContent = "";
    }

    els.breakdownBody.innerHTML =
      "<tr><td>運用終了時点の評価額（売却前）</td><td>" + yen(scenarioA.nav) + "</td><td>" + yen(scenarioB.nav) + "</td></tr>" +
      "<tr><td>取得価額（元本＋再投資額の累計）</td><td>" + yen(scenarioA.costBasis) + "</td><td>" + yen(scenarioB.costBasis) + "</td></tr>" +
      "<tr><td>これまでに分配金へ課税された累計額</td><td>" + yen(scenarioA.cumDistTax) + "</td><td>0 円</td></tr>" +
      "<tr><td>売却時にかかる税額（概算）</td><td>" + yen(Math.max(0, scenarioA.nav - scenarioA.costBasis) * taxRate) + "</td><td>" + yen(Math.max(0, scenarioB.nav - scenarioB.costBasis) * taxRate) + "</td></tr>" +
      "<tr><td><strong>最終手取り資産</strong></td><td><strong>" + yen(scenarioA.finalNet) + "</strong></td><td><strong>" + yen(scenarioB.finalNet) + "</strong></td></tr>";

    var labels = scenarioA.series.map(function (d) { return d.year + "年"; });
    var data = {
      labels: labels,
      datasets: [
        {
          label: "A：分配型（受取・再投資）",
          data: scenarioA.series.map(function (d) { return Math.round(d.net); }),
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "B：無分配型（自動再投資）",
          data: scenarioB.series.map(function (d) { return Math.round(d.net); }),
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.25,
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
      chart = new Chart(document.getElementById("saitoushi-growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
  }

  [els.initial, els.monthly, els.years, els.totalReturn, els.distYield, els.accountType].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

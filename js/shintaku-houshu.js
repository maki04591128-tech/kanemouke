(function () {
  "use strict";

  var els = {
    initial: document.getElementById("shintaku-initial"),
    monthly: document.getElementById("shintaku-monthly"),
    years: document.getElementById("shintaku-years"),
    yearsOut: document.getElementById("shintaku-yearsOut"),
    grossRate: document.getElementById("shintaku-grossRate"),
    grossRateOut: document.getElementById("shintaku-grossRateOut"),
    feeA: document.getElementById("shintaku-feeA"),
    feeAOut: document.getElementById("shintaku-feeAOut"),
    feeB: document.getElementById("shintaku-feeB"),
    feeBOut: document.getElementById("shintaku-feeBOut"),
    verdict: document.getElementById("shintaku-verdict"),
    verdictSub: document.getElementById("shintaku-verdictSub"),
    resultPrincipal: document.getElementById("shintaku-result-principal"),
    resultA: document.getElementById("shintaku-result-a"),
    resultB: document.getElementById("shintaku-result-b"),
    resultDiff: document.getElementById("shintaku-result-diff"),
    breakdownBody: document.getElementById("shintaku-breakdown-body"),
    fundSelectA: document.getElementById("shintaku-fundSelectA"),
    fundSelectB: document.getElementById("shintaku-fundSelectB"),
    resultALabel: document.getElementById("shintaku-result-a-label"),
    resultBLabel: document.getElementById("shintaku-result-b-label"),
    legendA: document.getElementById("shintaku-legend-a"),
    legendB: document.getElementById("shintaku-legend-b"),
    theadA: document.getElementById("shintaku-thead-a"),
    theadB: document.getElementById("shintaku-thead-b"),
  };

  var chart = null;
  var fundNameA = "";
  var fundNameB = "";

  function fundLabel(side) {
    return side === "A"
      ? (fundNameA ? "ファンドA（" + fundNameA + "）" : "ファンドA")
      : (fundNameB ? "ファンドB（" + fundNameB + "）" : "ファンドB");
  }

  function setupFundSelect(selectEl, feeEl, side) {
    if (!selectEl || !window.FUND_DATA) return;

    window.FUND_DATA.forEach(function (fund) {
      var opt = document.createElement("option");
      opt.value = fund.id;
      opt.textContent = fund.name + "（" + fund.category + "）";
      selectEl.appendChild(opt);
    });

    selectEl.addEventListener("change", function () {
      var fund = window.FUND_DATA.filter(function (f) { return f.id === selectEl.value; })[0];
      if (side === "A") fundNameA = fund ? fund.name : "";
      else fundNameB = fund ? fund.name : "";
      if (fund) feeEl.value = fund.expenseRatio.toFixed(2);
      render();
    });
  }

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // 信託報酬は基準価額から日々差し引かれるため、想定利回り（グロス）から
  // 信託報酬（年率）を差し引いた実質利回りで月次複利運用したものとして試算する。
  function simulate(initial, monthly, netAnnualRatePct, years) {
    var r = netAnnualRatePct / 100 / 12;
    var months = Math.round(years * 12);
    var balance = initial;
    var principal = initial;
    var yearly = [{ year: 0, balance: initial, principal: initial }];

    for (var m = 1; m <= months; m++) {
      balance += monthly;
      principal += monthly;
      balance *= 1 + r;
      if (m % 12 === 0) {
        yearly.push({ year: m / 12, balance: balance, principal: principal });
      }
    }
    if (months % 12 !== 0) {
      yearly.push({ year: years, balance: balance, principal: principal });
    }

    return { balance: balance, principal: principal, yearly: yearly };
  }

  function render() {
    var initial = Math.max(0, Number(els.initial.value) || 0);
    var monthly = Math.max(0, Number(els.monthly.value) || 0);
    var years = Number(els.years.value);
    var grossRatePct = Number(els.grossRate.value);
    var feeAPct = Number(els.feeA.value);
    var feeBPct = Number(els.feeB.value);

    els.yearsOut.textContent = years + " 年";
    els.grossRateOut.textContent = grossRatePct.toFixed(1) + " %";
    els.feeAOut.textContent = feeAPct.toFixed(2) + " %";
    els.feeBOut.textContent = feeBPct.toFixed(2) + " %";

    var netA = grossRatePct - feeAPct;
    var netB = grossRatePct - feeBPct;

    var simA = simulate(initial, monthly, netA, years);
    var simB = simulate(initial, monthly, netB, years);
    var principal = simA.principal;
    var diff = simA.balance - simB.balance;

    if (els.resultALabel) els.resultALabel.textContent = fundLabel("A") + "：資産評価額";
    if (els.resultBLabel) els.resultBLabel.textContent = fundLabel("B") + "：資産評価額";
    if (els.legendA) els.legendA.textContent = fundLabel("A") + " 評価額";
    if (els.legendB) els.legendB.textContent = fundLabel("B") + " 評価額";
    if (els.theadA) els.theadA.textContent = fundLabel("A");
    if (els.theadB) els.theadB.textContent = fundLabel("B");

    els.resultPrincipal.textContent = yen(principal);
    els.resultA.textContent = yen(simA.balance);
    els.resultB.textContent = yen(simB.balance);
    els.resultDiff.textContent = (diff >= 0 ? "+" : "") + manYen(diff) + "（" + fundLabel("A") + "－" + fundLabel("B") + "）";

    if (feeAPct === feeBPct) {
      els.verdict.textContent = "信託報酬が同じため、最終的な資産額に差はありません";
      els.verdictSub.textContent = "信託報酬の数値を変えて、コストの差が将来の資産額にどれだけ影響するかを確認してください。";
    } else if (Math.abs(diff) < 1000) {
      els.verdict.textContent = "この条件では資産額の差はごくわずかです";
      els.verdictSub.textContent = "積立期間が短い、または信託報酬の差が小さい条件です。期間を長くするほど差が拡大していく傾向を確認してみてください。";
    } else if (diff > 0) {
      els.verdict.textContent = "信託報酬が低い" + fundLabel("A") + "のほうが " + manYen(diff) + " 多く資産が残ります";
      els.verdictSub.textContent = "信託報酬は基準価額から毎日差し引かれ、運用期間中ずっと複利で効いてくるため、わずかな料率差でも長期では大きな金額差になります。";
    } else {
      els.verdict.textContent = "この条件では" + fundLabel("B") + "のほうが " + manYen(-diff) + " 多く資産が残ります";
      els.verdictSub.textContent = "想定利回り（グロス）が同じ場合、信託報酬が低いほど有利になります。ファンドBの信託報酬をファンドAより低く設定すると結果が入れ替わります。";
    }

    var feeGapPct = principal > 0 ? (diff / principal) * 100 : 0;
    if (Math.abs(feeGapPct) >= 0.05) {
      els.verdictSub.textContent +=
        "　差額は積立元本の約" + Math.abs(feeGapPct).toFixed(1) + "%に相当します。";
    }

    els.breakdownBody.innerHTML =
      "<tr><td>想定利回り（信託報酬控除前・グロス）</td><td colspan=\"2\">年 " + grossRatePct.toFixed(1) + " %</td></tr>" +
      "<tr><td>信託報酬（年率）</td><td>" + feeAPct.toFixed(2) + " %</td><td>" + feeBPct.toFixed(2) + " %</td></tr>" +
      "<tr><td>実質利回り（グロス－信託報酬）</td><td>年 " + netA.toFixed(2) + " %</td><td>年 " + netB.toFixed(2) + " %</td></tr>" +
      "<tr><td>積立元本（累計）</td><td>" + yen(principal) + "</td><td>" + yen(principal) + "</td></tr>" +
      "<tr><td><strong>運用終了時点の資産評価額</strong></td><td><strong>" + yen(simA.balance) + "</strong></td><td><strong>" + yen(simB.balance) + "</strong></td></tr>";

    var labels = simA.yearly.map(function (d) { return d.year + "年"; });
    var principalSeries = simA.yearly.map(function (d) { return Math.round(d.principal); });
    var aSeries = simA.yearly.map(function (d) { return Math.round(d.balance); });
    var bSeries = simB.yearly.map(function (d) { return Math.round(d.balance); });

    var data = {
      labels: labels,
      datasets: [
        {
          label: fundLabel("A") + " 評価額（信託報酬 " + feeAPct.toFixed(2) + "%）",
          data: aSeries,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: fundLabel("B") + " 評価額（信託報酬 " + feeBPct.toFixed(2) + "%）",
          data: bSeries,
          borderColor: "#d98e04",
          backgroundColor: "rgba(217, 142, 4, 0.1)",
          fill: false,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "積立元本（累計）",
          data: principalSeries,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
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
      chart = new Chart(document.getElementById("shintaku-growthChart").getContext("2d"), {
        type: "line",
        data: data,
        options: options,
      });
    }
  }

  [els.initial, els.monthly, els.years, els.grossRate, els.feeA, els.feeB].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  setupFundSelect(els.fundSelectA, els.feeA, "A");
  setupFundSelect(els.fundSelectB, els.feeB, "B");
  render();
})();

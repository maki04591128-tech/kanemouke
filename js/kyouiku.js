(function () {
  "use strict";

  var els = {
    course: document.getElementById("course"),
    target: document.getElementById("target"),
    childAge: document.getElementById("childAge"),
    initial: document.getElementById("initial"),
    rate: document.getElementById("rate"),
    childAgeOut: document.getElementById("childAgeOut"),
    rateOut: document.getElementById("rateOut"),
    monthly: document.getElementById("result-monthly"),
    principal: document.getElementById("result-principal"),
    profit: document.getElementById("result-profit"),
  };

  var GOAL_AGE = 18;
  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // Same annuity-solving approach as the 必要積立額 (hitsuyou-gaku) tool:
  // start-of-month contribution, then one month of compounding.
  function requiredMonthly(target, initial, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var n = Math.round(years * 12);
    if (n <= 0) return Math.max(0, target - initial);

    var fvInitial = initial * Math.pow(1 + r, n);
    var remaining = target - fvInitial;
    if (remaining <= 0) return 0;

    if (r === 0) {
      return remaining / n;
    }
    var annuityFactor = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    return remaining / annuityFactor;
  }

  function simulateSeries(initial, monthly, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
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
    return yearly;
  }

  function onCourseChange() {
    if (els.course.value === "custom") return;
    els.target.value = els.course.value;
    render();
  }

  function render() {
    var targetMan = Math.max(0, Number(els.target.value) || 0);
    var target = targetMan * 10000;
    var childAge = Number(els.childAge.value);
    var years = Math.max(1, GOAL_AGE - childAge);
    var initial = Math.max(0, Number(els.initial.value) || 0);
    var rate = Number(els.rate.value);

    els.childAgeOut.textContent = childAge + " 歳";
    els.rateOut.textContent = rate.toFixed(1) + " %";

    var monthly = requiredMonthly(target, initial, rate, years);
    var yearly = simulateSeries(initial, monthly, rate, years);
    var finalPoint = yearly[yearly.length - 1];
    var profit = finalPoint.balance - finalPoint.principal;

    els.monthly.textContent = yen(monthly);
    els.principal.textContent = yen(finalPoint.principal);
    els.profit.textContent = (profit >= 0 ? "+" : "") + manYen(profit);

    var labels = yearly.map(function (d) { return (childAge + d.year) + "歳"; });
    var principalData = yearly.map(function (d) { return Math.round(d.principal); });
    var balanceData = yearly.map(function (d) { return Math.round(d.balance); });

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: labels,
      datasets: [
        {
          label: "資産評価額",
          data: balanceData,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "積立元本",
          data: principalData,
          borderColor: "#7a8899",
          backgroundColor: "rgba(122, 136, 153, 0.08)",
          fill: true,
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
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
  }

  els.course.addEventListener("change", onCourseChange);
  [els.target, els.childAge, els.initial, els.rate].forEach(function (el) {
    el.addEventListener("input", render);
  });

  render();
})();

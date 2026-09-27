(function () {
  "use strict";

  // 公的年金（老齢年金）受給額シミュレーター。
  // 老齢基礎年金は「831,700円（令和7年度満額）×保険料納付済み月数÷480か月」、
  // 老齢厚生年金（報酬比例部分）は「平均年収の月額換算×5.481/1000×厚生年金
  // 加入月数」という、2003年4月以降の総報酬制に基づく標準的な簡易式で試算する。
  // 65歳を基準に、60〜64歳への繰上げ受給は1か月あたり0.4%減額、66〜75歳への
  // 繰下げ受給は1か月あたり0.7%増額（いずれも2022年4月以降のルール）を反映し、
  // 65歳受給との累計受取額が逆転する年齢（損益分岐年齢）もあわせて算出する。

  var els = {
    years: document.getElementById("nenkin-years"),
    yearsOut: document.getElementById("nenkin-yearsOut"),
    avgIncome: document.getElementById("nenkin-avgIncome"),
    unpaidMonths: document.getElementById("nenkin-unpaidMonths"),
    startAge: document.getElementById("nenkin-startAge"),
    verdict: document.getElementById("nenkin-verdict"),
    verdictSub: document.getElementById("nenkin-verdictSub"),
    yearly: document.getElementById("nenkin-result-yearly"),
    monthly: document.getElementById("nenkin-result-monthly"),
    kiso: document.getElementById("nenkin-result-kiso"),
    kousei: document.getElementById("nenkin-result-kousei"),
    adjustment: document.getElementById("nenkin-result-adjustment"),
    breakdownBody: document.getElementById("nenkin-breakdown-body"),
    tableBody: document.getElementById("nenkin-table-body"),
    breakevenNote: document.getElementById("nenkin-breakeven-note"),
  };
  if (!els.years || !els.avgIncome || !els.breakdownBody) return;

  var KISO_FULL_YEARLY = 831700; // 老齢基礎年金の満額（令和7年度）
  var KISO_FULL_MONTHS = 480; // 満額に必要な保険料納付済み月数（40年）
  var KOSEI_RATE = 5.481 / 1000; // 老齢厚生年金 報酬比例部分の乗率（2003年4月以降・総報酬制）
  var REDUCTION_PER_MONTH = 0.004; // 繰上げ受給：1か月あたりの減額率（2022年4月以降）
  var INCREASE_PER_MONTH = 0.007; // 繰下げ受給：1か月あたりの増額率（2022年4月以降）
  var LIFE_EXPECTANCY_AGE = 90; // 早見表の「受取総額」の目安に使う年齢
  var CHART_END_AGE = 100;
  var TABLE_AGES = [60, 63, 65, 68, 70, 72, 75];

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    return (n / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  // 加入年数・平均年収・未納月数から、65歳受給を基準にした年金額（年額）を試算する。
  function calcBase(years, avgIncomeYen, unpaidMonths) {
    var kouseiMonths = years * 12;
    var kisoMonths = Math.min(
      KISO_FULL_MONTHS,
      Math.max(0, Math.min(kouseiMonths, KISO_FULL_MONTHS) - unpaidMonths)
    );
    var kiso = KISO_FULL_YEARLY * (kisoMonths / KISO_FULL_MONTHS);
    var avgMonthlyRemuneration = avgIncomeYen / 12;
    var kousei = avgMonthlyRemuneration * KOSEI_RATE * kouseiMonths;
    return { kiso: kiso, kousei: kousei, total: kiso + kousei, kisoMonths: kisoMonths };
  }

  // 65歳を基準にした年金額（年額）に、受給開始年齢に応じた繰上げ・繰下げの増減率を反映する。
  function adjustmentRateFor(startAge) {
    if (startAge < 65) return -((65 - startAge) * 12 * REDUCTION_PER_MONTH);
    if (startAge > 65) return (startAge - 65) * 12 * INCREASE_PER_MONTH;
    return 0;
  }

  function amountAtAge(total65, startAge) {
    return total65 * (1 + adjustmentRateFor(startAge));
  }

  // 2つの受給開始年齢について、生きている年齢ごとの累計受取額が逆転する年齢を求める。
  // A(s)×(a-s) が交差する a を解く一次方程式（両者の年額が異なる前提）。
  function breakevenAge(total65, ageA, ageB) {
    var amountA = amountAtAge(total65, ageA);
    var amountB = amountAtAge(total65, ageB);
    if (amountA === amountB) return null;
    var a = (amountA * ageA - amountB * ageB) / (amountA - amountB);
    if (!isFinite(a) || a <= Math.max(ageA, ageB) || a > 120) return null;
    return a;
  }

  function render() {
    var years = Math.min(50, clampNonNegative(els.years.value));
    var avgIncome = clampNonNegative(els.avgIncome.value) * 10000;
    var unpaidMonths = Math.min(480, clampNonNegative(els.unpaidMonths ? els.unpaidMonths.value : 0));
    var startAge = els.startAge ? Number(els.startAge.value) : 65;

    if (els.yearsOut) els.yearsOut.textContent = years + " 年";

    var base = calcBase(years, avgIncome, unpaidMonths);
    var rate = adjustmentRateFor(startAge);
    var adjustedYearly = amountAtAge(base.total, startAge);
    var adjustedMonthly = adjustedYearly / 12;
    var diffFrom65 = adjustedYearly - base.total;

    if (els.yearly) els.yearly.textContent = yen(adjustedYearly) + " /年";
    if (els.monthly) els.monthly.textContent = yen(adjustedMonthly) + " /月";
    if (els.kiso) els.kiso.textContent = yen(base.kiso) + " /年";
    if (els.kousei) els.kousei.textContent = yen(base.kousei) + " /年";
    if (els.adjustment) {
      els.adjustment.textContent = (rate >= 0 ? "+" : "") + (rate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " %";
    }

    if (els.verdict) {
      els.verdict.textContent = startAge + "歳から受給すると、年金は年額 " + yen(adjustedYearly) + "（月額 " + yen(adjustedMonthly) + "）の見込みです";
    }
    if (els.verdictSub) {
      var sub =
        "老齢基礎年金 " + yen(base.kiso) + " ＋ 老齢厚生年金（報酬比例部分） " + yen(base.kousei) +
        "（いずれも65歳受給換算）に、受給開始年齢による増減率 " + (rate >= 0 ? "+" : "") + (rate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) +
        "% を反映しました。一度決まった金額は生涯変わらず受け取り続けます。";
      if (startAge !== 65) {
        sub += " 65歳受給と比べて、年額が" + (diffFrom65 >= 0 ? "約" + manYen(diffFrom65) + "増える" : "約" + manYen(-diffFrom65) + "減る") + "計算です。";
      }
      els.verdictSub.textContent = sub;
    }

    if (els.breakevenNote) {
      if (startAge === 65) {
        els.breakevenNote.textContent = "受給開始年齢を65歳から変更すると、65歳受給との損益分岐年齢（累計受取額が逆転する年齢）をここに表示します。";
      } else {
        var be = breakevenAge(base.total, startAge, 65);
        if (be) {
          var beAgeInt = Math.ceil(be);
          els.breakevenNote.textContent =
            startAge < 65
              ? "本ツールの試算では、" + beAgeInt + "歳より長く生きる場合、65歳から受給した方が累計受取額は多くなる計算です（" + startAge + "歳受給が有利なのは" + beAgeInt + "歳未満で受給が終わる場合）。"
              : "本ツールの試算では、" + beAgeInt + "歳より長く生きる場合、" + startAge + "歳まで繰り下げた方が65歳受給より累計受取額が多くなる計算です。";
        } else {
          els.breakevenNote.textContent = "この条件では、65歳受給との累計受取額の損益分岐年齢を算出できませんでした。";
        }
      }
    }

    els.breakdownBody.innerHTML =
      "<tr><td>老齢基礎年金（65歳受給換算、納付済み" + base.kisoMonths + "か月／480か月）</td><td>" + yen(base.kiso) + " /年</td></tr>" +
      "<tr><td>老齢厚生年金 報酬比例部分（65歳受給換算、加入" + (years * 12) + "か月）</td><td>" + yen(base.kousei) + " /年</td></tr>" +
      "<tr><td>65歳受給時の年金額（合計）</td><td>" + yen(base.total) + " /年</td></tr>" +
      "<tr><td>受給開始年齢（" + startAge + "歳）による増減率</td><td>" + (rate >= 0 ? "+" : "") + (rate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " %</td></tr>" +
      "<tr><td><strong>" + startAge + "歳受給時の年金額（年額）</strong></td><td><strong>" + yen(adjustedYearly) + "</strong></td></tr>" +
      "<tr><td><strong>" + startAge + "歳受給時の年金額（月額）</strong></td><td><strong>" + yen(adjustedMonthly) + "</strong></td></tr>";

    if (els.tableBody) {
      var rows = TABLE_AGES.map(function (age) {
        var amount = amountAtAge(base.total, age);
        var diff = amount - base.total;
        var yearsReceived = Math.max(0, LIFE_EXPECTANCY_AGE - age);
        var lifetimeTotal = amount * yearsReceived;
        var isCurrent = age === startAge;
        return (
          "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + age + " 歳</td>" +
          "<td>" + yen(amount) + " /年</td>" +
          "<td>" + (diff === 0 ? "±0円（基準）" : (diff > 0 ? "+" : "") + manYen(diff) + "/年") + "</td>" +
          "<td>" + manYen(lifetimeTotal) + "（" + LIFE_EXPECTANCY_AGE + "歳まで受給時）</td>" +
          "</tr>"
        );
      });
      els.tableBody.innerHTML = rows.join("");
    }

    var canvas = document.getElementById("nenkin-growthChart");
    if (canvas && window.Chart) {
      var minAge = Math.min(65, startAge);
      var labels = [];
      var series65 = [];
      var seriesSelected = [];
      for (var age = minAge; age <= CHART_END_AGE; age++) {
        labels.push(age + "歳");
        series65.push(Math.round(amountAtAge(base.total, 65) * Math.max(0, age - 65)));
        seriesSelected.push(Math.round(amountAtAge(base.total, startAge) * Math.max(0, age - startAge)));
      }
      var data = {
        labels: labels,
        datasets: [
          {
            label: "65歳から受給した場合の累計受取額",
            data: series65,
            borderColor: "#0f5f4c",
            backgroundColor: "rgba(15, 95, 76, 0.12)",
            fill: true,
            tension: 0.1,
            pointRadius: 0,
          },
          {
            label: startAge + "歳から受給した場合の累計受取額",
            data: seriesSelected,
            borderColor: "#d98e04",
            backgroundColor: "rgba(217, 142, 4, 0.1)",
            fill: true,
            tension: 0.1,
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
        chart = new Chart(canvas.getContext("2d"), { type: "line", data: data, options: options });
      }
      if (window.renderChartDataTable) window.renderChartDataTable("nenkin-growthDataTable", chart);
    }
  }

  [els.years, els.avgIncome, els.unpaidMonths].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  if (els.startAge) els.startAge.addEventListener("change", render);

  render();
})();

(function () {
  "use strict";

  // 育児休業給付金シミュレーター。
  // 育休開始前の月給（額面）と育休取得予定期間（ヶ月）から、
  // 「休業開始から180日（約6か月）まで賃金日額の67%」「181日目以降は50%」
  // という雇用保険法上の支給率と、令和8年8月1日改定の賃金日額の
  // 上限額16,540円・下限額3,203円（毎年8月1日に毎月勤労統計の
  // 平均定期給与額の増減に応じて改定）を反映して、支給見込み総額を試算する。
  //
  // あわせて、2025年4月に新設された「出生後休業支援給付金」（子の出生後
  // 8週間以内に被保険者本人・配偶者とも14日以上の育児休業を取得した場合、
  // 最大28日分について賃金日額の13%を上乗せ、通常の67%とあわせて
  // 実質80%相当＝非課税・社会保険料免除の効果とあわせて手取り10割に
  // 近づく制度）の対象にするかどうかを選べるようにしている。
  //
  // 賃金日額は本来「休業開始前6か月間に支払われた賃金の合計÷180」で
  // 算定されるが、本ツールは入力を簡略化するため「育休開始前の月給
  // （額面）÷30」で近似している。ボーナス等の賞与は本来の算定基礎からも
  // 除外されるため、月給（基本給＋諸手当、賞与を除く）を入力してもらう
  // 前提であれば大きくは乖離しない設計とした。

  var els = {
    salary: document.getElementById("ikuji-salary"),
    months: document.getElementById("ikuji-months"),
    monthsOut: document.getElementById("ikuji-monthsOut"),
    support: document.getElementById("ikuji-support"),
    verdict: document.getElementById("ikuji-verdict"),
    verdictSub: document.getElementById("ikuji-verdictSub"),
    total: document.getElementById("ikuji-result-total"),
    highTotal: document.getElementById("ikuji-result-high"),
    lowTotal: document.getElementById("ikuji-result-low"),
    support_amount: document.getElementById("ikuji-result-support"),
    tableBody: document.getElementById("ikuji-breakdown-body"),
  };
  if (!els.salary || !els.months || !els.support) return;

  var DAILY_WAGE_UPPER = 16540; // 令和8年8月1日改定（賃金日額の上限額）
  var DAILY_WAGE_LOWER = 3203; // 令和8年8月1日改定（賃金日額の下限額）
  var RATE_HIGH = 0.67; // 休業開始日から180日（約6か月）まで
  var RATE_LOW = 0.5; // 181日目（約7か月目）以降
  var HIGH_RATE_MONTHS = 6;
  var SUPPORT_RATE = 0.13; // 出生後休業支援給付金の上乗せ分
  var SUPPORT_DAYS = 28; // 出生後休業支援給付金の対象日数（最大）

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampMonths(n) {
    return Math.min(18, Math.max(1, Math.round(Number(n) || 0)));
  }

  function dailyWageOf(monthlySalary) {
    var raw = Math.max(0, Number(monthlySalary) || 0) / 30;
    return Math.min(DAILY_WAGE_UPPER, Math.max(DAILY_WAGE_LOWER, raw));
  }

  function render() {
    var salary = Math.max(0, Number(els.salary.value) || 0);
    var months = clampMonths(els.months.value);
    var supportOn = els.support.value === "yes";

    if (els.monthsOut) els.monthsOut.textContent = months + " か月";

    var dailyWage = dailyWageOf(salary);
    var monthlyHigh = dailyWage * 30 * RATE_HIGH;
    var monthlyLow = dailyWage * 30 * RATE_LOW;

    var highMonths = Math.min(months, HIGH_RATE_MONTHS);
    var lowMonths = Math.max(0, months - HIGH_RATE_MONTHS);

    var totalHigh = monthlyHigh * highMonths;
    var totalLow = monthlyLow * lowMonths;
    var supportAmount = supportOn ? dailyWage * SUPPORT_DAYS * SUPPORT_RATE : 0;

    var total = totalHigh + totalLow + supportAmount;

    if (els.total) els.total.textContent = yen(total);
    if (els.highTotal) els.highTotal.textContent = yen(totalHigh);
    if (els.lowTotal) els.lowTotal.textContent = yen(totalLow);
    if (els.support_amount) els.support_amount.textContent = supportOn ? yen(supportAmount) : "対象外";

    if (els.verdict) {
      els.verdict.textContent = "支給見込み総額は " + yen(total) + " です";
      var sub =
        "最初の" + HIGH_RATE_MONTHS + "か月は月あたり" + yen(monthlyHigh) + "（賃金日額の67%）、" +
        (lowMonths > 0 ? "7か月目以降は月あたり" + yen(monthlyLow) + "（賃金日額の50%）に切り替わります。" : "取得期間が6か月以内のため、支給率は67%のまま終わります。");
      if (supportOn) {
        sub += "出生後休業支援給付金（最大28日分、13%上乗せ）を含めると、休業開始直後の実質支給率は80%相当になります。";
      }
      els.verdictSub.textContent = sub;
    }

    if (els.tableBody) {
      var rows = [];
      rows.push(["賃金日額（月給÷30、上限16,540円・下限3,203円で調整後）", "", yen(dailyWage) + " /日"]);
      rows.push(["支給率67%期間（1〜" + HIGH_RATE_MONTHS + "か月目）", highMonths + " か月 × " + yen(monthlyHigh), yen(totalHigh)]);
      if (lowMonths > 0) {
        rows.push(["支給率50%期間（" + (HIGH_RATE_MONTHS + 1) + "か月目以降）", lowMonths + " か月 × " + yen(monthlyLow), yen(totalLow)]);
      }
      rows.push(["出生後休業支援給付金（最大28日・13%上乗せ）", supportOn ? "賃金日額 × 28日 × 13%" : "対象にしない設定", supportOn ? yen(supportAmount) : "-"]);
      rows.push(["支給見込み総額", "", yen(total)]);
      els.tableBody.innerHTML = rows
        .map(function (r) {
          return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
        })
        .join("");
    }

    var canvas = document.getElementById("ikuji-growthChart");
    if (canvas && window.Chart) {
      var labels = [];
      var values = [];
      for (var m = 1; m <= months; m++) {
        var amount = m <= HIGH_RATE_MONTHS ? monthlyHigh : monthlyLow;
        if (m === 1 && supportOn) amount += supportAmount;
        labels.push(m + "か月目");
        values.push(Math.round(amount));
      }
      var data = {
        labels: labels,
        datasets: [
          {
            label: "月ごとの支給見込み額",
            data: values,
            backgroundColor: labels.map(function (_, idx) {
              return idx < HIGH_RATE_MONTHS ? "#0f5f4c" : "#3d7a8c";
            }),
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: "月額（円）" },
            ticks: { callback: function (v) { return v.toLocaleString("ja-JP") + " 円"; } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return yen(ctx.parsed.y);
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
        chart = new Chart(canvas.getContext("2d"), { type: "bar", data: data, options: options });
      }
      if (window.renderChartDataTable) window.renderChartDataTable("ikuji-growthDataTable", chart);
    }
  }

  [els.salary, els.months].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  els.support.addEventListener("change", render);

  render();
})();

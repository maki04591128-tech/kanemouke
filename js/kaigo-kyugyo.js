(function () {
  "use strict";

  // 介護休業給付金シミュレーター。
  // 家族の介護のために休業した際、雇用保険から支給される「介護休業給付金」
  // の支給見込み額を試算する。厚生労働省が公表する令和8年8月1日改定の
  // 賃金月額の上限額546,600円・下限額96,090円（毎年8月1日に毎月勤労統計の
  // 平均定期給与額の増減に応じて改定）と、支給率67%（休業開始前の賃金日額
  // ×67%）という計算式に基づく。
  //
  // 対象家族1人につき通算93日まで、3回まで分割して取得できる（分割の
  // 回数自体は支給額の計算に影響しないため、本ツールでは取得予定日数の
  // 合計のみを入力してもらう）。休業開始前2年間に、雇用保険の被保険者
  // 期間（賃金支払いの基礎となった日数が11日以上ある月）が通算12か月以上
  // ない場合は、原則対象外となる。
  //
  // 賃金日額は本来「休業開始前6か月間に支払われた賃金の合計÷180」で
  // 算定される。本ツールは既定では入力を簡略化した「休業開始前の月給
  // （額面）÷30」の近似を使うが、休業開始前6か月間の賃金合計が分かる
  // 場合は、そちらを入力することで本来の計算方法（合計÷180）に切り替えて
  // より正確な賃金日額を試算できるようにしている（いずれの方式でも、
  // 上限・下限額は日額換算〈上限18,220円・下限3,203円〉で調整する）。

  var els = {
    wageMethod: document.getElementById("kaigo-wageMethod"),
    salaryField: document.getElementById("kaigo-salaryField"),
    salary: document.getElementById("kaigo-salary"),
    sixMonthField: document.getElementById("kaigo-sixMonthField"),
    sixMonthTotal: document.getElementById("kaigo-sixMonthTotal"),
    days: document.getElementById("kaigo-days"),
    daysOut: document.getElementById("kaigo-daysOut"),
    insured: document.getElementById("kaigo-insured"),
    verdict: document.getElementById("kaigo-verdict"),
    verdictSub: document.getElementById("kaigo-verdictSub"),
    total: document.getElementById("kaigo-result-total"),
    daily: document.getElementById("kaigo-result-daily"),
    daysResult: document.getElementById("kaigo-result-days"),
    breakdownBody: document.getElementById("kaigo-breakdown-body"),
    tableBody: document.getElementById("kaigo-table-body"),
  };
  if (!els.salary || !els.days || !els.insured) return;

  var DAILY_WAGE_UPPER = 18220; // 令和8年8月1日改定（賃金月額の上限額546,600円÷30）
  var DAILY_WAGE_LOWER = 3203; // 令和8年8月1日改定（賃金月額の下限額96,090円÷30）
  var RATE = 0.67; // 支給率
  var MAX_DAYS = 93; // 対象家族1人につき通算の上限日数

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampDays(n) {
    return Math.min(MAX_DAYS, Math.max(1, Math.round(Number(n) || 0)));
  }

  function clampDailyWage(raw) {
    return Math.min(DAILY_WAGE_UPPER, Math.max(DAILY_WAGE_LOWER, raw));
  }

  function dailyWageOf(monthlySalary) {
    return clampDailyWage(Math.max(0, Number(monthlySalary) || 0) / 30);
  }

  function dailyWageOfSixMonthTotal(sixMonthTotal) {
    return clampDailyWage(Math.max(0, Number(sixMonthTotal) || 0) / 180);
  }

  function render() {
    var useSixMonth = els.wageMethod && els.wageMethod.value === "sixmonth";

    if (els.salaryField) els.salaryField.style.display = useSixMonth ? "none" : "";
    if (els.sixMonthField) els.sixMonthField.style.display = useSixMonth ? "" : "none";
    if (els.salary) els.salary.disabled = useSixMonth;
    if (els.sixMonthTotal) els.sixMonthTotal.disabled = !useSixMonth;

    var salary = Math.max(0, Number(els.salary.value) || 0);
    var sixMonthTotal = els.sixMonthTotal ? Math.max(0, Number(els.sixMonthTotal.value) || 0) : 0;
    var days = clampDays(els.days.value);
    var insuredOk = els.insured.value !== "under12";

    if (els.daysOut) els.daysOut.textContent = days + " 日";

    var dailyWage = useSixMonth ? dailyWageOfSixMonthTotal(sixMonthTotal) : dailyWageOf(salary);
    var dailyBenefit = Math.floor(dailyWage * RATE);
    var total = insuredOk ? dailyBenefit * days : 0;

    if (els.total) els.total.textContent = yen(total);
    if (els.daily) els.daily.textContent = insuredOk ? yen(dailyBenefit) + " /日" : "-";
    if (els.daysResult) els.daysResult.textContent = insuredOk ? days + " 日分" : "対象外";

    if (els.verdict) {
      els.verdict.textContent = insuredOk
        ? "介護休業給付金の支給見込み総額は " + yen(total) + " です"
        : "介護休業給付金は原則対象外です";
    }
    if (els.verdictSub) {
      var sub;
      if (insuredOk) {
        var wageBasisLabel = useSixMonth ? "6か月間の賃金合計÷180" : "月給÷30";
        sub =
          "賃金日額" + yen(dailyWage) + "（" + wageBasisLabel + "、上限" + DAILY_WAGE_UPPER.toLocaleString("ja-JP") + "円・下限" + DAILY_WAGE_LOWER.toLocaleString("ja-JP") + "円で調整後）の67%にあたる1日あたり" + yen(dailyBenefit) + "を、取得日数" + days + "日分支給する前提で試算しています。対象家族1人につき通算93日まで、3回に分けて取得できます。";
      } else {
        sub =
          "休業開始前2年間に、雇用保険の被保険者期間（賃金支払いの基礎となった日数が11日以上ある月）が通算12か月以上必要です。要件を満たさない場合、介護休業給付金は原則支給されません。";
      }
      els.verdictSub.textContent = sub;
    }

    if (els.breakdownBody) {
      var dailyWageRowLabel = useSixMonth
        ? "賃金日額（6か月間の賃金合計÷180、上限" + DAILY_WAGE_UPPER.toLocaleString("ja-JP") + "円・下限" + DAILY_WAGE_LOWER.toLocaleString("ja-JP") + "円で調整）"
        : "賃金日額の近似（月給÷30、上限" + DAILY_WAGE_UPPER.toLocaleString("ja-JP") + "円・下限" + DAILY_WAGE_LOWER.toLocaleString("ja-JP") + "円で調整）";
      els.breakdownBody.innerHTML =
        (useSixMonth
          ? "<tr><td>休業開始前6か月間の賃金合計</td><td>" + yen(sixMonthTotal) + "</td></tr>"
          : "<tr><td>休業開始前の月給（額面）</td><td>" + yen(salary) + "</td></tr>") +
        "<tr><td>" + dailyWageRowLabel + "</td><td>" + yen(dailyWage) + " /日</td></tr>" +
        "<tr><td>介護休業給付金日額（賃金日額×67%）</td><td>" + (insuredOk ? yen(dailyBenefit) + " /日" : "-") + "</td></tr>" +
        "<tr><td>取得予定日数（対象家族1人につき通算93日が上限）</td><td>" + (insuredOk ? days + " 日" : "対象外") + "</td></tr>" +
        "<tr><td><strong>支給見込み総額</strong></td><td><strong>" + yen(total) + "</strong></td></tr>";
    }

    if (els.tableBody) {
      var refSalaries = [180000, 220000, 260000, 300000, 350000, 400000, 500000];
      var closest = refSalaries.reduce(function (best, x) {
        return Math.abs(x - salary) < Math.abs(best - salary) ? x : best;
      }, refSalaries[0]);
      var rows = refSalaries.map(function (x) {
        var w = dailyWageOf(x);
        var daily = Math.floor(w * RATE);
        var isCurrent = x === closest;
        return (
          "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + yen(x) + "</td>" +
          "<td>" + yen(daily) + " /日</td>" +
          "<td>" + yen(daily * MAX_DAYS) + "（93日分の目安）</td>" +
          "</tr>"
        );
      });
      els.tableBody.innerHTML = rows.join("");
    }

    var canvas = document.getElementById("kaigo-growthChart");
    if (canvas && window.Chart) {
      var labels = [];
      var values = [];
      var remaining = insuredOk ? days : 0;
      var period = 1;
      while (remaining > 0) {
        var daysInPeriod = Math.min(30, remaining);
        labels.push("第" + period + "回支給（" + daysInPeriod + "日分）");
        values.push(Math.round(daysInPeriod * dailyBenefit));
        remaining -= daysInPeriod;
        period++;
      }
      var data = {
        labels: labels,
        datasets: [
          {
            label: "支給単位期間ごとの支給見込み額",
            data: values,
            backgroundColor: "#0f5f4c",
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: "支給見込み額（円）" },
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
      if (window.renderChartDataTable) window.renderChartDataTable("kaigo-growthDataTable", chart);
    }
  }

  [els.salary, els.days, els.sixMonthTotal].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  els.insured.addEventListener("change", render);
  if (els.wageMethod) els.wageMethod.addEventListener("change", render);

  render();
})();

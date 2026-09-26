(function () {
  "use strict";

  // 傷病手当金シミュレーター。
  // 病気・けがで会社を休む際に健康保険から支給される「傷病手当金」の
  // 支給見込み額を試算する。支給額は「支給開始日以前12か月間の標準報酬月額の
  // 平均÷30×2/3」（全国健康保険協会の定めによる）で、本ツールは標準報酬月額の
  // 代わりに直近の月給（額面）を近似値として使用し、健康保険の等級の範囲
  // （58,000円〜1,390,000円）でクランプする。休業開始から連続する3日間は
  // 「待期期間」として対象外、4日目から支給が始まり、支給期間は支給開始日から
  // 通算して1年6か月（最大18か月）が上限。休業中に会社から給与が一部支給される
  // 場合は、その日額が傷病手当金の日額より少なければ差額のみが支給される
  // ルールにも対応する。

  var els = {
    salary: document.getElementById("shobyou-salary"),
    months: document.getElementById("shobyou-months"),
    monthsOut: document.getElementById("shobyou-monthsOut"),
    payDuring: document.getElementById("shobyou-payDuring"),
    payFields: document.getElementById("shobyou-payFields"),
    payDaily: document.getElementById("shobyou-payDaily"),
    verdict: document.getElementById("shobyou-verdict"),
    verdictSub: document.getElementById("shobyou-verdictSub"),
    total: document.getElementById("shobyou-result-total"),
    daily: document.getElementById("shobyou-result-daily"),
    waitDays: document.getElementById("shobyou-result-waitdays"),
    eligibleDays: document.getElementById("shobyou-result-eligibledays"),
    breakdownBody: document.getElementById("shobyou-breakdown-body"),
    tableBody: document.getElementById("shobyou-table-body"),
  };
  if (!els.salary || !els.months || !els.breakdownBody) return;

  var MIN_STANDARD_REMUNERATION = 58000; // 協会けんぽ 健康保険 標準報酬月額 第1等級
  var MAX_STANDARD_REMUNERATION = 1390000; // 協会けんぽ 健康保険 標準報酬月額 第50等級
  var BENEFIT_RATE = 2 / 3;
  var WAIT_DAYS = 3; // 待期期間（連続する3日間、対象外）
  var MAX_SUPPORT_MONTHS = 18; // 支給期間の上限（通算1年6か月）
  var DAYS_PER_MONTH = 30; // 標準報酬月額の日額換算・休業期間の近似に使用

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

  function clampMonths(n) {
    return Math.min(MAX_SUPPORT_MONTHS, Math.max(1, Math.round(Number(n) || 0)));
  }

  function standardRemunerationOf(monthlySalary) {
    return Math.min(MAX_STANDARD_REMUNERATION, Math.max(MIN_STANDARD_REMUNERATION, monthlySalary));
  }

  function dailyBenefitOf(monthlySalary) {
    return (standardRemunerationOf(monthlySalary) / DAYS_PER_MONTH) * BENEFIT_RATE;
  }

  // 月給・休業中の会社からの給与支給（日額）から、傷病手当金の日額・支給対象日数・支給見込み総額を算出する。
  function calc(salary, months, payDaily) {
    var dailyFull = dailyBenefitOf(salary);
    var dailyNet = payDaily >= dailyFull ? 0 : dailyFull - payDaily;
    var totalDays = months * DAYS_PER_MONTH;
    var eligibleDays = Math.max(0, totalDays - WAIT_DAYS);
    var total = eligibleDays * dailyNet;
    return {
      standard: standardRemunerationOf(salary),
      dailyFull: dailyFull,
      dailyNet: dailyNet,
      totalDays: totalDays,
      eligibleDays: eligibleDays,
      total: total,
    };
  }

  function render() {
    var salary = clampNonNegative(els.salary.value) * 10000;
    var months = clampMonths(els.months.value);
    var payDuring = els.payDuring ? els.payDuring.value : "none";
    var payDaily = payDuring === "partial" ? clampNonNegative(els.payDaily.value) : 0;

    if (els.monthsOut) els.monthsOut.textContent = months + " か月（約" + months * DAYS_PER_MONTH + "日）";
    if (els.payFields) els.payFields.hidden = payDuring !== "partial";

    var r = calc(salary, months, payDaily);

    if (els.total) els.total.textContent = yen(r.total);
    if (els.daily) els.daily.textContent = yen(r.dailyNet) + " /日";
    if (els.waitDays) els.waitDays.textContent = WAIT_DAYS + " 日（対象外）";
    if (els.eligibleDays) els.eligibleDays.textContent = r.eligibleDays + " 日";

    if (els.verdict) {
      els.verdict.textContent = "支給見込み総額は " + yen(r.total) + " です（支給対象 " + r.eligibleDays + " 日分）";
    }
    if (els.verdictSub) {
      var sub =
        "傷病手当金の日額は " + yen(r.dailyFull) + "（標準報酬月額の代わりに月給" + manYen(salary) + "を使用）。" +
        "休業開始から連続する3日間は待期期間として対象外のため、4日目から支給が始まります。";
      if (payDuring === "partial" && payDaily > 0) {
        sub +=
          payDaily >= r.dailyFull
            ? " 会社からの給与日額（" + yen(payDaily) + "）が傷病手当金の日額以上のため、傷病手当金は支給されません。"
            : " 会社から給与が日額" + yen(payDaily) + "支給されるため、差額の" + yen(r.dailyNet) + "/日のみが支給されます。";
      }
      sub += "支給期間は支給開始日から通算して1年6か月（最大18か月）が上限です。";
      els.verdictSub.textContent = sub;
    }

    els.breakdownBody.innerHTML =
      "<tr><td>標準報酬月額の近似（月給額面、5.8万円〜139万円で調整）</td><td>" + yen(r.standard) + " /月</td></tr>" +
      "<tr><td>傷病手当金の日額（標準報酬月額の平均÷30×2/3）</td><td>" + yen(r.dailyFull) + " /日</td></tr>" +
      "<tr><td>待期期間（休業開始から3日間、対象外）</td><td>" + WAIT_DAYS + " 日 / 0 円</td></tr>" +
      (payDuring === "partial"
        ? "<tr><td>会社からの給与支給（日額）</td><td>" + yen(payDaily) + " /日</td></tr>" +
          "<tr><td>差額調整後の実質日額</td><td>" + yen(r.dailyNet) + " /日</td></tr>"
        : "") +
      "<tr><td>支給対象日数（待期期間後〜休業終了まで）</td><td>" + r.eligibleDays + " 日</td></tr>" +
      "<tr><td><strong>支給見込み総額</strong></td><td><strong>" + yen(r.total) + "</strong></td></tr>";

    if (els.tableBody) {
      var refSalaries = [200000, 250000, 300000, 350000, 400000, 500000, 600000];
      var closest = refSalaries.reduce(function (best, x) {
        return Math.abs(x - salary) < Math.abs(best - salary) ? x : best;
      }, refSalaries[0]);
      var rows = refSalaries.map(function (x) {
        var daily = dailyBenefitOf(x);
        var isCurrent = x === closest;
        return (
          "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + manYen(x) + "</td>" +
          "<td>" + yen(daily) + " /日</td>" +
          "<td>" + yen(daily * DAYS_PER_MONTH) + " /月（30日分）</td>" +
          "</tr>"
        );
      });
      els.tableBody.innerHTML = rows.join("");
    }

    var canvas = document.getElementById("shobyou-growthChart");
    if (canvas && window.Chart) {
      var labels = [];
      var values = [];
      for (var m = 1; m <= months; m++) {
        var daysInMonth = m === 1 ? Math.max(0, DAYS_PER_MONTH - WAIT_DAYS) : DAYS_PER_MONTH;
        labels.push(m + "か月目");
        values.push(Math.round(daysInMonth * r.dailyNet));
      }
      var data = {
        labels: labels,
        datasets: [
          {
            label: "月ごとの支給見込み額",
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
      if (window.renderChartDataTable) window.renderChartDataTable("shobyou-growthDataTable", chart);
    }
  }

  [els.salary, els.months, els.payDaily].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  if (els.payDuring) els.payDuring.addEventListener("change", render);

  render();
})();

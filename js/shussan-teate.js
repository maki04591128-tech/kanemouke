(function () {
  "use strict";

  // 出産手当金シミュレーター。
  // 出産のために会社を休む「産前産後休業」期間中に健康保険から支給される
  // 「出産手当金」の支給見込み額を試算する。支給額は「支給開始日以前12か月間の
  // 標準報酬月額の平均÷30×2/3」（傷病手当金と同じ計算式）で、本ツールも
  // js/shobyou-teate.jsと同じく標準報酬月額の代わりに直近の月給（額面）を
  // 近似値として使用し、健康保険の等級の範囲（58,000円〜1,390,000円）で
  // クランプする。産前休業は出産予定日を含む42日前（多胎妊娠は98日前）から、
  // 産後休業は出産日後56日固定（本人の希望では短縮できない）で、対象日数は
  // 「産前の実際の取得日数＋産後56日」。休業中に会社から給与が一部支給される
  // 場合は、その日額が出産手当金の日額より少なければ差額のみが支給される
  // ルールにも対応する（傷病手当金の待期期間3日間のような対象外期間はない）。

  var els = {
    salary: document.getElementById("shussan-salary"),
    multiple: document.getElementById("shussan-multiple"),
    prenatalDays: document.getElementById("shussan-prenatalDays"),
    prenatalDaysOut: document.getElementById("shussan-prenatalDaysOut"),
    payDuring: document.getElementById("shussan-payDuring"),
    payFields: document.getElementById("shussan-payFields"),
    payDaily: document.getElementById("shussan-payDaily"),
    verdict: document.getElementById("shussan-verdict"),
    verdictSub: document.getElementById("shussan-verdictSub"),
    total: document.getElementById("shussan-result-total"),
    daily: document.getElementById("shussan-result-daily"),
    prenatalOut: document.getElementById("shussan-result-prenatal"),
    postnatalOut: document.getElementById("shussan-result-postnatal"),
    breakdownBody: document.getElementById("shussan-breakdown-body"),
  };
  if (!els.salary || !els.multiple || !els.breakdownBody) return;

  var MIN_STANDARD_REMUNERATION = 58000; // 協会けんぽ 健康保険 標準報酬月額 第1等級
  var MAX_STANDARD_REMUNERATION = 1390000; // 協会けんぽ 健康保険 標準報酬月額 第50等級
  var BENEFIT_RATE = 2 / 3;
  var DAYS_PER_MONTH = 30; // 標準報酬月額の日額換算に使用
  var PRENATAL_MAX_SINGLE = 42; // 単胎の産前休業対象日数の上限
  var PRENATAL_MAX_MULTIPLE = 98; // 多胎（双子以上）の産前休業対象日数の上限
  var POSTNATAL_DAYS = 56; // 産後休業（固定、本人希望では短縮不可）

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function prenatalMaxOf(multiple) {
    return multiple === "multiple" ? PRENATAL_MAX_MULTIPLE : PRENATAL_MAX_SINGLE;
  }

  function standardRemunerationOf(monthlySalary) {
    return Math.min(MAX_STANDARD_REMUNERATION, Math.max(MIN_STANDARD_REMUNERATION, monthlySalary));
  }

  function dailyBenefitOf(monthlySalary) {
    return (standardRemunerationOf(monthlySalary) / DAYS_PER_MONTH) * BENEFIT_RATE;
  }

  // 月給・産前休業日数・休業中の会社からの給与支給（日額）から、
  // 出産手当金の日額・産前産後それぞれの支給見込み額を算出する。
  function calc(salary, prenatalDays, payDaily) {
    var dailyFull = dailyBenefitOf(salary);
    var dailyNet = payDaily >= dailyFull ? 0 : dailyFull - payDaily;
    var prenatalAmount = prenatalDays * dailyNet;
    var postnatalAmount = POSTNATAL_DAYS * dailyNet;
    return {
      standard: standardRemunerationOf(salary),
      dailyFull: dailyFull,
      dailyNet: dailyNet,
      prenatalAmount: prenatalAmount,
      postnatalAmount: postnatalAmount,
      total: prenatalAmount + postnatalAmount,
    };
  }

  function render() {
    var salary = clampNonNegative(els.salary.value) * 10000;
    var multiple = els.multiple.value === "multiple" ? "multiple" : "single";
    var prenatalMax = prenatalMaxOf(multiple);

    if (els.prenatalDays) {
      els.prenatalDays.max = String(prenatalMax);
      if (Number(els.prenatalDays.value) > prenatalMax) els.prenatalDays.value = String(prenatalMax);
    }
    var prenatalDays = els.prenatalDays ? Math.min(prenatalMax, Math.max(0, Math.round(Number(els.prenatalDays.value) || 0))) : prenatalMax;
    if (els.prenatalDaysOut) els.prenatalDaysOut.textContent = prenatalDays + " 日";

    var payDuring = els.payDuring ? els.payDuring.value : "none";
    var payDaily = payDuring === "partial" ? clampNonNegative(els.payDaily.value) : 0;
    if (els.payFields) els.payFields.hidden = payDuring !== "partial";

    var r = calc(salary, prenatalDays, payDaily);

    if (els.total) els.total.textContent = yen(r.total);
    if (els.daily) els.daily.textContent = yen(r.dailyNet) + " /日";
    if (els.prenatalOut) els.prenatalOut.textContent = yen(r.prenatalAmount) + "（" + prenatalDays + "日分）";
    if (els.postnatalOut) els.postnatalOut.textContent = yen(r.postnatalAmount) + "（" + POSTNATAL_DAYS + "日分）";

    if (els.verdict) {
      els.verdict.textContent = "支給見込み総額は " + yen(r.total) + " です（産前" + prenatalDays + "日＋産後" + POSTNATAL_DAYS + "日）";
    }
    if (els.verdictSub) {
      var sub =
        "出産手当金の日額は " + yen(r.dailyFull) + "（標準報酬月額の代わりに月給" + (salary / 10000).toLocaleString("ja-JP") + "万円を使用）。";
      if (payDuring === "partial" && payDaily > 0) {
        sub +=
          payDaily >= r.dailyFull
            ? " 会社からの給与日額（" + yen(payDaily) + "）が出産手当金の日額以上のため、出産手当金は支給されません。"
            : " 会社から給与が日額" + yen(payDaily) + "支給されるため、差額の" + yen(r.dailyNet) + "/日のみが支給されます。";
      }
      sub += multiple === "multiple" ? " 多胎妊娠のため産前休業の対象は最大98日です。" : " 単胎のため産前休業の対象は最大42日です。";
      els.verdictSub.textContent = sub;
    }

    els.breakdownBody.innerHTML =
      "<tr><td>標準報酬月額の近似（月給額面、5.8万円〜139万円で調整）</td><td>" + yen(r.standard) + " /月</td></tr>" +
      "<tr><td>出産手当金の日額（標準報酬月額の平均÷30×2/3）</td><td>" + yen(r.dailyFull) + " /日</td></tr>" +
      (payDuring === "partial"
        ? "<tr><td>会社からの給与支給（日額）</td><td>" + yen(payDaily) + " /日</td></tr>" +
          "<tr><td>差額調整後の実質日額</td><td>" + yen(r.dailyNet) + " /日</td></tr>"
        : "") +
      "<tr><td>産前休業分（" + prenatalDays + "日 × " + yen(r.dailyNet) + "）</td><td>" + yen(r.prenatalAmount) + "</td></tr>" +
      "<tr><td>産後休業分（" + POSTNATAL_DAYS + "日固定 × " + yen(r.dailyNet) + "）</td><td>" + yen(r.postnatalAmount) + "</td></tr>" +
      "<tr><td><strong>支給見込み総額</strong></td><td><strong>" + yen(r.total) + "</strong></td></tr>";

    var canvas = document.getElementById("shussan-growthChart");
    if (canvas && window.Chart) {
      var data = {
        labels: ["産前休業分（" + prenatalDays + "日）", "産後休業分（" + POSTNATAL_DAYS + "日）"],
        datasets: [
          {
            label: "支給見込み額",
            data: [Math.round(r.prenatalAmount), Math.round(r.postnatalAmount)],
            backgroundColor: ["#0f5f4c", "#3d7a8c"],
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: "金額（円）" },
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
      if (window.renderChartDataTable) window.renderChartDataTable("shussan-growthDataTable", chart);
    }
  }

  [els.salary, els.prenatalDays, els.payDaily].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  [els.multiple, els.payDuring].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", render);
  });

  render();
})();

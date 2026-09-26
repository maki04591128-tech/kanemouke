(function () {
  "use strict";

  // 雇用保険 基本手当（失業給付）シミュレーター。
  // 令和8年8月1日改定の賃金日額・基本手当日額の上限額・下限額と、
  // 基本手当日額の計算式（厚生労働省「基本手当日額の計算方法」）に基づき、
  // 離職前の月給（額面）を賃金日額（本来は離職前6か月の賃金合計÷180）の
  // 近似値として使用し、年齢区分ごとに基本手当日額を算出する。
  // 所定給付日数は、離職理由（自己都合／特定受給資格者・特定理由離職者／
  // 就職困難者）と年齢区分・被保険者であった期間から、ハローワーク
  // インターネットサービス「基本手当の所定給付日数」の表に基づき判定する。
  // 給付制限期間は、令和7年4月1日以降の離職に適用される「自己都合退職は
  // 原則1か月」のルールを前提とし、重責解雇・過去5年以内の複数回の自己都合
  // 退職に該当する場合の3か月にも対応する。

  var els = {
    salary: document.getElementById("kihon-salary"),
    age: document.getElementById("kihon-age"),
    reason: document.getElementById("kihon-reason"),
    insured: document.getElementById("kihon-insured"),
    restriction: document.getElementById("kihon-restriction"),
    restrictionField: document.getElementById("kihon-restrictionField"),
    verdict: document.getElementById("kihon-verdict"),
    verdictSub: document.getElementById("kihon-verdictSub"),
    total: document.getElementById("kihon-result-total"),
    daily: document.getElementById("kihon-result-daily"),
    days: document.getElementById("kihon-result-days"),
    startAfter: document.getElementById("kihon-result-startafter"),
    breakdownBody: document.getElementById("kihon-breakdown-body"),
    tableBody: document.getElementById("kihon-table-body"),
  };
  if (!els.salary || !els.age || !els.breakdownBody) return;

  var WAGE_MIN = 3203; // 賃金日額の下限額（令和8年8月1日〜、全年齢共通）
  var BENEFIT_MIN = 2562; // 基本手当日額の下限額（令和8年8月1日〜、全年齢共通）
  var WAGE_MAX = { u30: 14900, "30to44": 16540, "45to59": 18220, "60to64": 17400 }; // 賃金日額の上限額
  var BENEFIT_MAX = { u30: 7450, "30to44": 8270, "45to59": 9110, "60to64": 7830 }; // 基本手当日額の上限額
  var WAIT_DAYS = 7; // 待期期間（全員共通、対象外）

  // 所定給付日数（一般の受給資格者＝自己都合退職・定年退職等、全年齢共通）
  var GENERAL_DAYS = { u1: 90, "1to5": 90, "5to10": 90, "10to20": 120, "20plus": 150 };

  // 所定給付日数（特定受給資格者・特定理由離職者＝倒産・解雇、雇止め等）
  var SPECIAL_DAYS = {
    u30: { u1: 90, "1to5": 90, "5to10": 120, "10to20": 180, "20plus": 180 }, // 20年以上は表上「―」（30歳未満では通常発生しないため10〜20年の値を代用）
    a30_34: { u1: 90, "1to5": 120, "5to10": 180, "10to20": 210, "20plus": 240 },
    a35_44: { u1: 90, "1to5": 150, "5to10": 180, "10to20": 240, "20plus": 270 },
    a45_59: { u1: 90, "1to5": 180, "5to10": 240, "10to20": 270, "20plus": 330 },
    a60_64: { u1: 90, "1to5": 150, "5to10": 180, "10to20": 210, "20plus": 240 },
  };

  // 所定給付日数（就職困難者）：45歳未満と45歳以上65歳未満の2区分
  var DIFFICULT_DAYS = {
    under45: { u1: 150, "1to5": 300, "5to10": 300, "10to20": 300, "20plus": 300 },
    over45: { u1: 150, "1to5": 360, "5to10": 360, "10to20": 360, "20plus": 360 },
  };

  var AGE_TO_WAGE_BRACKET = {
    u30: "u30",
    a30_34: "30to44",
    a35_44: "30to44",
    a45_59: "45to59",
    a60_64: "60to64",
  };

  var AGE_LABELS = {
    u30: "29歳以下",
    a30_34: "30〜34歳",
    a35_44: "35〜44歳",
    a45_59: "45〜59歳",
    a60_64: "60〜64歳",
  };
  var INSURED_LABELS = {
    u1: "1年未満",
    "1to5": "1年以上5年未満",
    "5to10": "5年以上10年未満",
    "10to20": "10年以上20年未満",
    "20plus": "20年以上",
  };
  var REASON_LABELS = {
    self: "自己都合退職・定年退職など",
    specific: "雇止め等の特定理由離職者",
    company: "倒産・解雇等の特定受給資格者",
    difficult: "就職困難者",
  };

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

  // 賃金日額（w円）から基本手当日額（y円）を算出する（令和8年8月1日改定の計算式、1円未満切り捨て）。
  function dailyBenefitOf(wageDaily, wageBracket) {
    var upper = WAGE_MAX[wageBracket];
    var w = Math.min(upper, Math.max(WAGE_MIN, wageDaily));
    var y;
    if (wageBracket === "60to64") {
      if (w < 5480) {
        y = 0.8 * w;
      } else if (w <= 12120) {
        y = Math.min(0.8 * w - 0.35 * ((w - 5480) / 6640) * w, 0.05 * w + 4848);
      } else if (w <= 17400) {
        y = 0.45 * w;
      } else {
        y = BENEFIT_MAX[wageBracket];
      }
    } else {
      if (w < 5480) {
        y = 0.8 * w;
      } else if (w <= 13490) {
        y = 0.8 * w - 0.3 * ((w - 5480) / 8010) * w;
      } else if (w <= upper) {
        y = 0.5 * w;
      } else {
        y = BENEFIT_MAX[wageBracket];
      }
    }
    return Math.max(BENEFIT_MIN, Math.floor(y));
  }

  // 離職理由・年齢区分・被保険者期間から所定給付日数を判定する。
  function eligibleDaysOf(reason, age, insured) {
    if (reason === "self") {
      if (insured === "u1") return { days: 0, ineligible: true };
      return { days: GENERAL_DAYS[insured], ineligible: false };
    }
    if (reason === "difficult") {
      var grp = age === "a45_59" || age === "a60_64" ? "over45" : "under45";
      return { days: DIFFICULT_DAYS[grp][insured], ineligible: false };
    }
    return { days: SPECIAL_DAYS[age][insured], ineligible: false };
  }

  function render() {
    var salary = clampNonNegative(els.salary.value) * 10000;
    var age = els.age.value;
    var reason = els.reason ? els.reason.value : "self";
    var insured = els.insured ? els.insured.value : "1to5";
    var restrictionKind = els.restriction ? els.restriction.value : "normal";

    if (els.restrictionField) els.restrictionField.hidden = reason !== "self";

    var wageBracket = AGE_TO_WAGE_BRACKET[age];
    var wageDaily = Math.floor(salary / 30);
    var wageDailyClamped = Math.min(WAGE_MAX[wageBracket], Math.max(WAGE_MIN, wageDaily));
    var dailyBenefit = dailyBenefitOf(wageDaily, wageBracket);

    var elig = eligibleDaysOf(reason, age, insured);
    var restrictionDays = reason === "self" ? (restrictionKind === "serious" ? 90 : 30) : 0;
    var startAfterDays = WAIT_DAYS + restrictionDays;
    var totalDays = elig.ineligible ? 0 : elig.days;
    var totalAmount = totalDays * dailyBenefit;

    if (els.total) els.total.textContent = yen(totalAmount);
    if (els.daily) els.daily.textContent = elig.ineligible ? "-" : yen(dailyBenefit) + " /日";
    if (els.days) els.days.textContent = elig.ineligible ? "対象外" : totalDays + " 日分";
    if (els.startAfter) els.startAfter.textContent = elig.ineligible ? "-" : startAfterDays + " 日後から";

    if (els.verdict) {
      els.verdict.textContent = elig.ineligible
        ? "被保険者期間が1年未満のため、通常は基本手当の対象外です"
        : "支給見込み総額は " + yen(totalAmount) + "（所定給付日数 " + totalDays + " 日分）です";
    }
    if (els.verdictSub) {
      var sub;
      if (elig.ineligible) {
        sub =
          "自己都合退職・定年退職などの「一般の受給資格者」は、原則として離職前2年間に被保険者期間が通算12か月以上必要です。" +
          "倒産・解雇等のやむを得ない事情がある場合は「離職理由」を特定理由離職者・特定受給資格者に変更すると、通算6か月以上で対象になる場合があります。";
      } else {
        sub =
          "基本手当日額は " + yen(dailyBenefit) + "（月給" + manYen(salary) + "を賃金日額" + wageDaily.toLocaleString("ja-JP") + "円/日の近似値として使用、年齢区分の上限・下限で調整）。" +
          "待期期間7日間" +
          (restrictionDays > 0 ? "＋給付制限" + restrictionDays / 30 + "か月" : "") +
          "の後、" + startAfterDays + "日後から支給が始まる見込みです。";
      }
      els.verdictSub.textContent = sub;
    }

    els.breakdownBody.innerHTML =
      "<tr><td>離職理由</td><td>" + REASON_LABELS[reason] + "</td></tr>" +
      "<tr><td>離職時の年齢</td><td>" + AGE_LABELS[age] + "</td></tr>" +
      "<tr><td>被保険者であった期間</td><td>" + INSURED_LABELS[insured] + "</td></tr>" +
      "<tr><td>賃金日額の近似（月給÷30、上限" + WAGE_MAX[wageBracket].toLocaleString("ja-JP") + "円・下限" + WAGE_MIN.toLocaleString("ja-JP") + "円で調整）</td><td>" + wageDailyClamped.toLocaleString("ja-JP") + " 円/日</td></tr>" +
      "<tr><td>基本手当日額（給付率45%〜80%のスライド式）</td><td>" + (elig.ineligible ? "-" : yen(dailyBenefit) + " /日") + "</td></tr>" +
      "<tr><td>待期期間（7日間、対象外）</td><td>" + WAIT_DAYS + " 日</td></tr>" +
      (restrictionDays > 0
        ? "<tr><td>給付制限期間（自己都合退職）</td><td>" + restrictionDays / 30 + " か月（約" + restrictionDays + "日）</td></tr>"
        : "") +
      "<tr><td>支給開始までの目安</td><td>" + (elig.ineligible ? "-" : startAfterDays + " 日後から") + "</td></tr>" +
      "<tr><td>所定給付日数</td><td>" + (elig.ineligible ? "対象外" : totalDays + " 日") + "</td></tr>" +
      "<tr><td><strong>支給見込み総額</strong></td><td><strong>" + yen(totalAmount) + "</strong></td></tr>";

    if (els.tableBody) {
      var refSalaries = [180000, 220000, 260000, 300000, 350000, 400000, 500000];
      var closest = refSalaries.reduce(function (best, x) {
        return Math.abs(x - salary) < Math.abs(best - salary) ? x : best;
      }, refSalaries[0]);
      var rows = refSalaries.map(function (x) {
        var w = Math.floor(x / 30);
        var daily = dailyBenefitOf(w, wageBracket);
        var isCurrent = x === closest;
        return (
          "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + manYen(x) + "</td>" +
          "<td>" + yen(daily) + " /日</td>" +
          "<td>" + yen(daily * 28) + "（28日分の目安）</td>" +
          "</tr>"
        );
      });
      els.tableBody.innerHTML = rows.join("");
    }

    var canvas = document.getElementById("kihon-growthChart");
    if (canvas && window.Chart) {
      var labels = [];
      var values = [];
      var remaining = totalDays;
      var period = 1;
      while (remaining > 0) {
        var daysInPeriod = Math.min(28, remaining);
        labels.push("第" + period + "回認定（" + daysInPeriod + "日分）");
        values.push(Math.round(daysInPeriod * dailyBenefit));
        remaining -= daysInPeriod;
        period++;
      }
      var data = {
        labels: labels,
        datasets: [
          {
            label: "認定期間ごとの支給見込み額",
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
      if (window.renderChartDataTable) window.renderChartDataTable("kihon-growthDataTable", chart);
    }
  }

  [els.salary].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  [els.age, els.reason, els.insured, els.restriction].forEach(function (el) {
    if (!el) return;
    el.addEventListener("change", render);
  });

  render();
})();

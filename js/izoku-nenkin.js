(function () {
  "use strict";

  // 遺族年金シミュレーター。
  // 一家の大黒柱が亡くなった場合に遺族へ支給される公的年金（遺族基礎年金・
  // 遺族厚生年金・中高齢寡婦加算）の見込み額を試算する。
  //
  // 遺族基礎年金：831,700円（令和7年度満額、老齢基礎年金と同額）＋子の加算
  // （1人目・2人目 各239,300円、3人目以降 各79,800円）。対象となる子が
  // いる間のみ支給される。
  // 遺族厚生年金：厚生年金の加入期間が300月（25年）未満で亡くなった場合に
  // 適用される「300月みなし」の短期要件で、老齢厚生年金の報酬比例部分相当額
  // （平均年収の月額換算×5.481/1000×加入月数）の3/4を試算する。老齢厚生年金
  // の受給資格期間（25年以上）を満たした人が死亡した「長期要件」の場合は
  // 実際の加入月数で計算されるため、本ツールの試算より少なくなる場合がある
  // （本ツールは300月未満の短期要件のみを対象とする簡易試算）。
  // 中高齢寡婦加算：厚生年金に加入していた夫が亡くなった際、子の加算の対象
  // となる子がいない40歳以上65歳未満の妻の遺族厚生年金に加算される
  // 623,800円（令和7年度）。夫が受け取る場合や、子のない30歳未満の妻の
  // 遺族厚生年金が5年間の有期給付になる点は考慮していない。

  var els = {
    kouseiYears: document.getElementById("izoku-kouseiYears"),
    kouseiYearsOut: document.getElementById("izoku-kouseiYearsOut"),
    avgIncome: document.getElementById("izoku-avgIncome"),
    childCount: document.getElementById("izoku-childCount"),
    spouseGender: document.getElementById("izoku-spouseGender"),
    spouseAge: document.getElementById("izoku-spouseAge"),
    verdict: document.getElementById("izoku-verdict"),
    verdictSub: document.getElementById("izoku-verdictSub"),
    yearly: document.getElementById("izoku-result-yearly"),
    monthly: document.getElementById("izoku-result-monthly"),
    kiso: document.getElementById("izoku-result-kiso"),
    kousei: document.getElementById("izoku-result-kousei"),
    chukourei: document.getElementById("izoku-result-chukourei"),
    breakdownBody: document.getElementById("izoku-breakdown-body"),
  };
  if (!els.kouseiYears || !els.avgIncome || !els.breakdownBody) return;

  var KISO_FULL_YEARLY = 831700; // 遺族基礎年金の本人分（令和7年度、老齢基礎年金の満額と同額）
  var CHILD_ADD_FIRST_SECOND = 239300; // 子の加算（1人目・2人目、1人あたり／令和7年度）
  var CHILD_ADD_THIRD_PLUS = 79800; // 子の加算（3人目以降、1人あたり／令和7年度）
  var KOSEI_RATE = 5.481 / 1000; // 報酬比例部分の乗率（2003年4月以降・総報酬制）
  var SHORT_TERM_MIN_MONTHS = 300; // 短期要件の「300月みなし」
  var IZOKU_KOSEI_RATIO = 3 / 4; // 遺族厚生年金＝老齢厚生年金相当額の3/4
  var CHUKOUREI_KAFU_KASAN = 623800; // 中高齢寡婦加算（令和7年度）
  var CHUKOUREI_MIN_AGE = 40;
  var CHUKOUREI_MAX_AGE = 65; // 65歳未満が対象

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function calc(kouseiYears, avgIncomeYen, childCount, spouseGender, spouseAge) {
    var kouseiMonths = kouseiYears * 12;

    var childAddition = 0;
    if (childCount > 0) {
      childAddition += Math.min(childCount, 2) * CHILD_ADD_FIRST_SECOND;
      if (childCount > 2) childAddition += (childCount - 2) * CHILD_ADD_THIRD_PLUS;
    }
    var kiso = childCount > 0 ? KISO_FULL_YEARLY + childAddition : 0;

    var kousei = 0;
    if (kouseiMonths > 0) {
      var guaranteedMonths = Math.max(kouseiMonths, SHORT_TERM_MIN_MONTHS);
      var avgMonthlyRemuneration = avgIncomeYen / 12;
      kousei = avgMonthlyRemuneration * KOSEI_RATE * guaranteedMonths * IZOKU_KOSEI_RATIO;
    }

    var chukoureiEligible =
      kouseiMonths > 0 &&
      spouseGender === "wife" &&
      childCount === 0 &&
      spouseAge >= CHUKOUREI_MIN_AGE &&
      spouseAge < CHUKOUREI_MAX_AGE;
    var chukourei = chukoureiEligible ? CHUKOUREI_KAFU_KASAN : 0;

    return {
      kiso: kiso,
      childAddition: childAddition,
      kousei: kousei,
      chukourei: chukourei,
      total: kiso + kousei + chukourei,
    };
  }

  var chart = null;

  function render() {
    var kouseiYears = Math.min(50, clampNonNegative(els.kouseiYears.value));
    var avgIncome = clampNonNegative(els.avgIncome.value) * 10000;
    var childCount = Math.min(5, clampNonNegative(els.childCount ? els.childCount.value : 0));
    var spouseGender = els.spouseGender ? els.spouseGender.value : "wife";
    var spouseAge = clampNonNegative(els.spouseAge ? els.spouseAge.value : 0);

    if (els.kouseiYearsOut) els.kouseiYearsOut.textContent = kouseiYears + " 年";

    var r = calc(kouseiYears, avgIncome, childCount, spouseGender, spouseAge);
    var monthly = r.total / 12;

    if (els.yearly) els.yearly.textContent = yen(r.total) + " /年";
    if (els.monthly) els.monthly.textContent = yen(monthly) + " /月";
    if (els.kiso) els.kiso.textContent = yen(r.kiso) + " /年";
    if (els.kousei) els.kousei.textContent = yen(r.kousei) + " /年";
    if (els.chukourei) els.chukourei.textContent = yen(r.chukourei) + " /年";

    if (els.verdict) {
      if (r.total > 0) {
        els.verdict.textContent = "遺族年金は年額 " + yen(r.total) + "（月額 " + yen(monthly) + "）の見込みです";
      } else {
        els.verdict.textContent = "この条件では遺族年金の対象外です";
      }
    }
    if (els.verdictSub) {
      if (r.total > 0) {
        var parts = [];
        if (r.kiso > 0) parts.push("遺族基礎年金 " + yen(r.kiso));
        if (r.kousei > 0) parts.push("遺族厚生年金 " + yen(r.kousei));
        if (r.chukourei > 0) parts.push("中高齢寡婦加算 " + yen(r.chukourei));
        els.verdictSub.textContent = parts.join("＋") + "（いずれも年額）の合計です。実際の受給には生計維持要件（原則、亡くなった方に生計を維持されており、年収850万円未満であること）などを満たす必要があります。";
      } else {
        els.verdictSub.textContent =
          "遺族基礎年金は対象となる子（18歳到達年度末まで、障害等級1・2級は20歳未満）がいる場合のみ、遺族厚生年金は亡くなった方に厚生年金の加入期間がある場合のみ支給されます。いずれにも該当しない条件のため、試算結果は0円です。";
      }
    }

    els.breakdownBody.innerHTML =
      "<tr><td>遺族基礎年金（本人分）</td><td>" + yen(r.kiso > 0 ? KISO_FULL_YEARLY : 0) + " /年</td></tr>" +
      "<tr><td>子の加算（" + childCount + "人）</td><td>" + yen(r.childAddition) + " /年</td></tr>" +
      "<tr><td>遺族厚生年金（短期要件・300月みなし）</td><td>" + yen(r.kousei) + " /年</td></tr>" +
      "<tr><td>中高齢寡婦加算</td><td>" + yen(r.chukourei) + " /年</td></tr>" +
      "<tr><td><strong>合計（年額）</strong></td><td><strong>" + yen(r.total) + "</strong></td></tr>" +
      "<tr><td><strong>合計（月額）</strong></td><td><strong>" + yen(monthly) + "</strong></td></tr>";

    var canvas = document.getElementById("izoku-breakdownChart");
    if (canvas && window.Chart) {
      var labels = [];
      var data = [];
      var colors = [];
      if (r.kiso - r.childAddition > 0) { labels.push("遺族基礎年金（本人分）"); data.push(Math.round(r.kiso - r.childAddition)); colors.push("#0f5f4c"); }
      if (r.childAddition > 0) { labels.push("子の加算"); data.push(Math.round(r.childAddition)); colors.push("#7fa998"); }
      if (r.kousei > 0) { labels.push("遺族厚生年金"); data.push(Math.round(r.kousei)); colors.push("#d98e04"); }
      if (r.chukourei > 0) { labels.push("中高齢寡婦加算"); data.push(Math.round(r.chukourei)); colors.push("#c96b3f"); }
      if (labels.length === 0) { labels.push("試算結果なし"); data.push(1); colors.push("#d9d9d9"); }

      var chartData = {
        labels: labels,
        datasets: [{ data: data, backgroundColor: colors, borderColor: "#fff", borderWidth: 2 }],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "bottom" },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                if (labels[0] === "試算結果なし") return "試算結果なし";
                var value = ctx.parsed;
                var pct = r.total > 0 ? (value / r.total) * 100 : 0;
                return ctx.label + "：" + yen(value) + "（" + pct.toFixed(1) + "%）";
              },
            },
          },
        },
      };

      if (chart) {
        chart.data = chartData;
        chart.options = options;
        chart.update();
      } else {
        chart = new Chart(canvas.getContext("2d"), { type: "doughnut", data: chartData, options: options });
      }
      if (window.renderChartDataTable) window.renderChartDataTable("izoku-breakdownDataTable", chart);
    }
  }

  [els.kouseiYears, els.avgIncome, els.childCount, els.spouseAge].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  if (els.spouseGender) els.spouseGender.addEventListener("change", render);

  render();
})();

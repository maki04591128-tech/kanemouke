(function () {
  "use strict";

  // 遺族年金シミュレーター。
  // 一家の大黒柱が亡くなった場合に遺族へ支給される公的年金（遺族基礎年金・
  // 遺族厚生年金・中高齢寡婦加算）の見込み額を試算する。
  //
  // 遺族基礎年金：847,300円（令和8年度満額、老齢基礎年金と同額）＋子の加算
  // （1人目・2人目 各243,800円、3人目以降 各81,300円）。対象となる子が
  // いる間のみ支給される。
  // 遺族厚生年金：老齢厚生年金の報酬比例部分相当額（平均年収の月額換算×
  // 5.481/1000×加入月数）の3/4を試算する。加入月数の扱いは短期要件・長期
  // 要件で異なり、短期要件（厚生年金の被保険者である間等に死亡）は300月
  // （25年）未満でも300月とみなす一方、長期要件（老齢厚生年金の受給資格
  // 期間25年以上を満たした人が死亡）は実際の加入月数をそのまま使う。どちら
  // に該当するかの判定（25年の受給資格期間には国民年金の期間等も通算）は
  // 行わず、ユーザーが選択する簡易試算とする。
  // 中高齢寡婦加算：厚生年金に加入していた夫が亡くなった際、子の加算の対象
  // となる子がいない40歳以上65歳未満の妻の遺族厚生年金に加算される
  // 635,500円（令和8年度）。
  // 有期給付：子の加算の対象となる子がおらず、死亡時点で30歳未満の妻の
  // 遺族厚生年金は、5年間の有期給付となる（6年目以降は遺族厚生年金・
  // 中高齢寡婦加算のいずれも支給されない）。この条件に該当する場合は
  // 結果欄に注記を表示する。
  // 夫が受け取る場合の年齢要件：妻の死亡時点で55歳未満の夫には遺族厚生
  // 年金の受給権自体が発生しない（対象となる子がいればその子が受け取る）。
  // 55歳以上60歳未満の夫は受給権は発生するが原則60歳まで支給停止となる。
  // ただし遺族基礎年金の対象となる子がいる場合はこの支給停止の例外となり、
  // 55歳以上であれば60歳前でも全額を受け取れる。経過的寡婦加算（昭和31年
  // 4月1日以前生まれの妻が対象）は、本シミュレーターでは考慮していない。

  var els = {
    kouseiYears: document.getElementById("izoku-kouseiYears"),
    kouseiYearsOut: document.getElementById("izoku-kouseiYearsOut"),
    requirementType: document.getElementById("izoku-requirementType"),
    avgIncome: document.getElementById("izoku-avgIncome"),
    childCount: document.getElementById("izoku-childCount"),
    spouseGender: document.getElementById("izoku-spouseGender"),
    spouseAge: document.getElementById("izoku-spouseAge"),
    verdict: document.getElementById("izoku-verdict"),
    verdictSub: document.getElementById("izoku-verdictSub"),
    limitedNotice: document.getElementById("izoku-limitedNotice"),
    yearly: document.getElementById("izoku-result-yearly"),
    monthly: document.getElementById("izoku-result-monthly"),
    kiso: document.getElementById("izoku-result-kiso"),
    kousei: document.getElementById("izoku-result-kousei"),
    chukourei: document.getElementById("izoku-result-chukourei"),
    breakdownBody: document.getElementById("izoku-breakdown-body"),
  };
  if (!els.kouseiYears || !els.avgIncome || !els.breakdownBody) return;

  var KISO_FULL_YEARLY = 847300; // 遺族基礎年金の本人分（令和8年度、老齢基礎年金の満額と同額）
  var CHILD_ADD_FIRST_SECOND = 243800; // 子の加算（1人目・2人目、1人あたり／令和8年度）
  var CHILD_ADD_THIRD_PLUS = 81300; // 子の加算（3人目以降、1人あたり／令和8年度）
  var KOSEI_RATE = 5.481 / 1000; // 報酬比例部分の乗率（2003年4月以降・総報酬制）
  var SHORT_TERM_MIN_MONTHS = 300; // 短期要件の「300月みなし」
  var IZOKU_KOSEI_RATIO = 3 / 4; // 遺族厚生年金＝老齢厚生年金相当額の3/4
  var CHUKOUREI_KAFU_KASAN = 635500; // 中高齢寡婦加算（令和8年度）
  var CHUKOUREI_MIN_AGE = 40;
  var CHUKOUREI_MAX_AGE = 65; // 65歳未満が対象
  var YOUNG_WIFE_AGE_LIMIT = 30; // 子のない30歳未満の妻は有期給付の対象
  var YOUNG_WIFE_LIMITED_YEARS = 5; // 有期給付の支給期間
  var HUSBAND_MIN_AGE = 55; // 夫が遺族厚生年金の受給権を得るための年齢要件
  var HUSBAND_SUSPENSION_UNTIL_AGE = 60; // 55〜59歳の夫は原則この年齢まで支給停止

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function calc(kouseiYears, avgIncomeYen, childCount, spouseGender, spouseAge, requirementType) {
    var kouseiMonths = kouseiYears * 12;

    var childAddition = 0;
    if (childCount > 0) {
      childAddition += Math.min(childCount, 2) * CHILD_ADD_FIRST_SECOND;
      if (childCount > 2) childAddition += (childCount - 2) * CHILD_ADD_THIRD_PLUS;
    }
    var kiso = childCount > 0 ? KISO_FULL_YEARLY + childAddition : 0;

    var kousei = 0;
    if (kouseiMonths > 0) {
      var guaranteedMonths =
        requirementType === "long" ? kouseiMonths : Math.max(kouseiMonths, SHORT_TERM_MIN_MONTHS);
      var avgMonthlyRemuneration = avgIncomeYen / 12;
      kousei = avgMonthlyRemuneration * KOSEI_RATE * guaranteedMonths * IZOKU_KOSEI_RATIO;
    }

    // 妻の死亡時点で55歳未満の夫には遺族厚生年金の受給権が発生しない
    // （対象となる子がいればその子が受け取るため、この試算では0円とする）。
    var husbandIneligible =
      kousei > 0 && spouseGender === "husband" && spouseAge > 0 && spouseAge < HUSBAND_MIN_AGE;
    if (husbandIneligible) kousei = 0;

    // 55歳以上60歳未満の夫は、遺族基礎年金の対象となる子がいない限り、
    // 60歳まで遺族厚生年金が支給停止となる（金額自体は60歳から変わらず
    // 受け取れるため、ここでは0円にせず結果欄へ注記のみ表示する）。
    var husbandSuspended =
      kousei > 0 &&
      spouseGender === "husband" &&
      spouseAge >= HUSBAND_MIN_AGE &&
      spouseAge < HUSBAND_SUSPENSION_UNTIL_AGE &&
      childCount === 0;

    var chukoureiEligible =
      kouseiMonths > 0 &&
      spouseGender === "wife" &&
      childCount === 0 &&
      spouseAge >= CHUKOUREI_MIN_AGE &&
      spouseAge < CHUKOUREI_MAX_AGE;
    var chukourei = chukoureiEligible ? CHUKOUREI_KAFU_KASAN : 0;

    // 子の加算の対象となる子がおらず、死亡時点で30歳未満の妻は、遺族厚生年金が
    // 5年間の有期給付となる（年齢が不明な場合（0歳のまま）は判定しない）。
    var youngWifeLimited =
      kousei > 0 &&
      spouseGender === "wife" &&
      childCount === 0 &&
      spouseAge > 0 &&
      spouseAge < YOUNG_WIFE_AGE_LIMIT;

    return {
      kiso: kiso,
      childAddition: childAddition,
      kousei: kousei,
      chukourei: chukourei,
      total: kiso + kousei + chukourei,
      youngWifeLimited: youngWifeLimited,
      husbandIneligible: husbandIneligible,
      husbandSuspended: husbandSuspended,
    };
  }

  var chart = null;

  function render() {
    var kouseiYears = Math.min(50, clampNonNegative(els.kouseiYears.value));
    var avgIncome = clampNonNegative(els.avgIncome.value) * 10000;
    var childCount = Math.min(5, clampNonNegative(els.childCount ? els.childCount.value : 0));
    var spouseGender = els.spouseGender ? els.spouseGender.value : "wife";
    var spouseAge = clampNonNegative(els.spouseAge ? els.spouseAge.value : 0);
    var requirementType = els.requirementType && els.requirementType.value === "long" ? "long" : "short";

    if (els.kouseiYearsOut) els.kouseiYearsOut.textContent = kouseiYears + " 年";

    var r = calc(kouseiYears, avgIncome, childCount, spouseGender, spouseAge, requirementType);
    var monthly = r.total / 12;

    if (els.yearly) els.yearly.textContent = yen(r.total) + " /年";
    if (els.monthly) els.monthly.textContent = yen(monthly) + " /月";
    if (els.kiso) els.kiso.textContent = yen(r.kiso) + " /年";
    if (els.kousei) els.kousei.textContent = yen(r.kousei) + " /年";
    if (els.chukourei) els.chukourei.textContent = yen(r.chukourei) + " /年";

    if (els.limitedNotice) {
      if (r.youngWifeLimited) {
        els.limitedNotice.style.display = "block";
        els.limitedNotice.innerHTML =
          "<p><strong>有期給付（5年間）の対象です：</strong>子の加算の対象となるお子さまがおらず、死亡時点で30歳未満の妻の遺族厚生年金は、支給開始から" +
          YOUNG_WIFE_LIMITED_YEARS +
          "年間の有期給付となります。上記の年額・月額は、この" +
          YOUNG_WIFE_LIMITED_YEARS +
          "年間に受け取れる金額の目安であり、6年目以降は遺族厚生年金・中高齢寡婦加算のいずれも支給されません（新たに対象となる子が生まれた場合などを除く）。</p>";
      } else if (r.husbandIneligible) {
        els.limitedNotice.style.display = "block";
        els.limitedNotice.innerHTML =
          "<p><strong>夫は遺族厚生年金を受け取れません：</strong>妻の死亡時点で55歳未満の夫には、遺族厚生年金の受給権自体が発生しません。上記の遺族厚生年金は0円として試算しています。対象となる子がいる場合は、その子が遺族厚生年金を受け取れる可能性があります（本シミュレーターでは試算していません）。</p>";
      } else if (r.husbandSuspended) {
        els.limitedNotice.style.display = "block";
        els.limitedNotice.innerHTML =
          "<p><strong>60歳まで支給停止の対象です：</strong>妻の死亡時点で55歳以上60歳未満の夫は、遺族基礎年金の対象となる子がいない場合、遺族厚生年金が60歳になるまで支給停止となります。上記の遺族厚生年金の金額は60歳から受け取れる見込み額であり、60歳になるまでは受け取れません。</p>";
      } else {
        els.limitedNotice.style.display = "none";
        els.limitedNotice.innerHTML = "";
      }
    }

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
      "<tr><td>遺族厚生年金（" + (requirementType === "long" ? "長期要件・実加入月数" : "短期要件・300月みなし") + "）</td><td>" + yen(r.kousei) + " /年</td></tr>" +
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
  if (els.requirementType) els.requirementType.addEventListener("change", render);

  render();
})();

(function () {
  "use strict";

  // 社会保険料率（本人負担分の目安。協会けんぽ全国平均水準を想定した概算、nenshu-tedori.jsと同じ前提）
  var HEALTH_INSURANCE_RATE = 0.0499;
  var CARE_INSURANCE_RATE = 0.0080; // 介護保険（40〜64歳、本人負担分）
  var PENSION_RATE = 0.0915;
  var EMPLOYMENT_INSURANCE_RATE = 0.006;

  // 賞与に対する源泉徴収税額の算出率の表（令和8年分、甲欄）
  // 出典：国税庁「源泉徴収税額表」（財務省告示第115号別表第三、令和7年4月30日財務省告示第122号改正）
  // 各行 = [賞与の金額に乗ずべき率(%), [扶養親族等0人の金額帯, 1人, 2人, 3人, 4人, 5人, 6人, 7人以上]]
  // 金額帯は「前月の社会保険料等控除後の給与等の金額」（円）の [以上, 未満) を表す。null は上限なし。
  var BONUS_TABLE = [
    [0.000, [[0,82000],[0,107000],[0,143000],[0,181000],[0,218000],[0,251000],[0,284000],[0,317000]]],
    [2.042, [[82000,94000],[107000,250000],[143000,276000],[181000,300000],[218000,300000],[251000,304000],[284000,343000],[317000,383000]]],
    [4.084, [[94000,260000],[250000,289000],[276000,321000],[300000,354000],[300000,387000],[304000,412000],[343000,438000],[383000,463000]]],
    [6.126, [[260000,309000],[289000,346000],[321000,377000],[354000,405000],[387000,431000],[412000,457000],[438000,483000],[463000,508000]]],
    [8.168, [[309000,342000],[346000,373000],[377000,400000],[405000,424000],[431000,452000],[457000,479000],[483000,505000],[508000,529000]]],
    [10.210, [[342000,372000],[373000,401000],[400000,426000],[424000,452000],[452000,477000],[479000,503000],[505000,527000],[529000,552000]]],
    [12.252, [[372000,402000],[401000,430000],[426000,457000],[452000,484000],[477000,509000],[503000,531000],[527000,553000],[552000,578000]]],
    [14.294, [[402000,433000],[430000,463000],[457000,492000],[484000,517000],[509000,540000],[531000,564000],[553000,589000],[578000,614000]]],
    [16.336, [[433000,520000],[463000,520000],[492000,525000],[517000,550000],[540000,577000],[564000,604000],[589000,630000],[614000,657000]]],
    [18.378, [[520000,605000],[520000,621000],[525000,636000],[550000,651000],[577000,666000],[604000,681000],[630000,697000],[657000,708000]]],
    [20.420, [[605000,684000],[621000,705000],[636000,728000],[651000,751000],[666000,774000],[681000,798000],[697000,821000],[708000,845000]]],
    [22.462, [[684000,715000],[705000,739000],[728000,764000],[751000,788000],[774000,813000],[798000,838000],[821000,862000],[845000,887000]]],
    [24.504, [[715000,752000],[739000,778000],[764000,804000],[788000,830000],[813000,856000],[838000,881000],[862000,907000],[887000,933000]]],
    [26.546, [[752000,795000],[778000,821000],[804000,848000],[830000,876000],[856000,903000],[881000,930000],[907000,957000],[933000,985000]]],
    [28.588, [[795000,854000],[821000,882000],[848000,910000],[876000,938000],[903000,966000],[930000,994000],[957000,1022000],[985000,1051000]]],
    [30.630, [[854000,922000],[882000,952000],[910000,983000],[938000,1013000],[966000,1044000],[994000,1074000],[1022000,1104000],[1051000,1135000]]],
    [32.672, [[922000,1318000],[952000,1342000],[983000,1367000],[1013000,1391000],[1044000,1416000],[1074000,1440000],[1104000,1464000],[1135000,1489000]]],
    [35.735, [[1318000,1521000],[1342000,1526000],[1367000,1526000],[1391000,1538000],[1416000,1555000],[1440000,1555000],[1464000,1555000],[1489000,1583000]]],
    [38.798, [[1521000,2621000],[1526000,2645000],[1526000,2669000],[1538000,2693000],[1555000,2716000],[1555000,2740000],[1555000,2764000],[1583000,2788000]]],
    [41.861, [[2621000,3495000],[2645000,3527000],[2669000,3559000],[2693000,3590000],[2716000,3622000],[2740000,3654000],[2764000,3685000],[2788000,3717000]]],
    [45.945, [[3495000,null],[3527000,null],[3559000,null],[3590000,null],[3622000,null],[3654000,null],[3685000,null],[3717000,null]]],
  ];

  var els = {
    bonus: document.getElementById("bonus"),
    prevSalary: document.getElementById("prevSalary"),
    ageGroup: document.getElementById("ageGroup"),
    dependents: document.getElementById("dependents"),
    verdict: document.getElementById("verdict"),
    verdictSub: document.getElementById("verdictSub"),
    takeHome: document.getElementById("result-take-home"),
    takeHomeRate: document.getElementById("result-take-home-rate"),
    socialInsurance: document.getElementById("result-social-insurance"),
    incomeTax: document.getElementById("result-income-tax"),
    breakdownBody: document.getElementById("breakdown-body"),
    tableBody: document.getElementById("table-body"),
    overLimitNote: document.getElementById("over-limit-note"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function socialInsuranceRateFor(ageGroup) {
    var rate = HEALTH_INSURANCE_RATE + PENSION_RATE + EMPLOYMENT_INSURANCE_RATE;
    if (ageGroup === "40to64") rate += CARE_INSURANCE_RATE;
    return rate;
  }

  // 前月の社会保険料等控除後の給与等の金額と扶養親族等の数から、賞与の金額に乗ずべき率（%）を求める。
  function lookupRate(prevNet, dependentsCol) {
    for (var i = 0; i < BONUS_TABLE.length; i++) {
      var range = BONUS_TABLE[i][1][dependentsCol];
      var lo = range[0], hi = range[1];
      if (prevNet >= lo && (hi === null || prevNet < hi)) {
        return BONUS_TABLE[i][0];
      }
    }
    return BONUS_TABLE[BONUS_TABLE.length - 1][0];
  }

  // 賞与額面・前月給与額面・年齢区分・扶養親族等の数から、賞与にかかる社会保険料・所得税・手取り額を試算する。
  function calc(bonus, prevSalary, ageGroup, dependents) {
    var rate = socialInsuranceRateFor(ageGroup);
    var prevSocialInsurance = prevSalary * rate;
    var prevNet = Math.max(0, prevSalary - prevSocialInsurance);

    var bonusSocialInsurance = bonus * rate;
    var bonusAfterSocial = Math.max(0, bonus - bonusSocialInsurance);

    var dependentsCol = Math.max(0, Math.min(7, dependents));

    // 国税庁の表（備考4）：前月給与がない、または賞与（社会保険料控除後）が前月給与（同控除後）の10倍を超える場合は
    // この速算表ではなく月額表を使う決まりのため、対象外として最高税率で概算し注意書きを表示する。
    var overLimit = prevSalary <= 0 || prevNet <= 0 || (prevNet > 0 && bonusAfterSocial > prevNet * 10);
    var bonusRate = overLimit ? BONUS_TABLE[BONUS_TABLE.length - 1][0] : lookupRate(prevNet, dependentsCol);

    var incomeTax = bonusAfterSocial * (bonusRate / 100);
    var takeHome = bonus - bonusSocialInsurance - incomeTax;

    return {
      bonusSocialInsurance: bonusSocialInsurance,
      bonusAfterSocial: bonusAfterSocial,
      bonusRate: bonusRate,
      incomeTax: incomeTax,
      takeHome: takeHome,
      overLimit: overLimit,
      prevNet: prevNet,
    };
  }

  function render() {
    var bonus = clampNonNegative(els.bonus.value) * 10000;
    var prevSalary = clampNonNegative(els.prevSalary.value) * 10000;
    var ageGroup = els.ageGroup.value;
    var dependents = Math.max(0, Math.min(7, Math.round(Number(els.dependents.value) || 0)));

    var r = calc(bonus, prevSalary, ageGroup, dependents);
    var rate = bonus > 0 ? (r.takeHome / bonus) * 100 : 0;

    els.takeHome.textContent = manYen(r.takeHome);
    els.takeHomeRate.textContent = rate.toFixed(1) + " %";
    els.socialInsurance.textContent = manYen(r.bonusSocialInsurance);
    els.incomeTax.textContent = manYen(r.incomeTax);

    els.verdict.textContent =
      "賞与額面 " + manYen(bonus) + " に対する手取りの目安は " + manYen(r.takeHome) + "（手取り率 約" + rate.toFixed(1) + "%）です";
    els.verdictSub.textContent =
      "賞与にかかる社会保険料 " + manYen(r.bonusSocialInsurance) + "、所得税（源泉徴収） " + manYen(r.incomeTax) +
      "（賞与の金額に乗ずべき率 " + r.bonusRate.toFixed(3) + "%）を差し引いた金額です。住民税は原則として賞与からは天引きされません。";

    if (els.overLimitNote) {
      els.overLimitNote.style.display = r.overLimit ? "" : "none";
    }

    els.breakdownBody.innerHTML =
      "<tr><td>前月の社会保険料等控除後の給与等の金額（目安）</td><td>" + manYen(r.prevNet) + "</td></tr>" +
      "<tr><td>賞与の金額に乗ずべき率</td><td>" + r.bonusRate.toFixed(3) + " %</td></tr>" +
      "<tr><td>賞与にかかる社会保険料（健康保険・厚生年金・雇用保険" + (ageGroup === "40to64" ? "・介護保険" : "") + "）</td><td>" + manYen(r.bonusSocialInsurance) + "</td></tr>" +
      "<tr><td>社会保険料控除後の賞与額</td><td>" + manYen(r.bonusAfterSocial) + "</td></tr>" +
      "<tr><td>所得税・復興特別所得税（源泉徴収）</td><td>" + manYen(r.incomeTax) + "</td></tr>" +
      "<tr><td>住民税</td><td>0 円（賞与からは天引きされません）</td></tr>" +
      "<tr><td><strong>手取り賞与額</strong></td><td><strong>" + manYen(r.takeHome) + "</strong></td></tr>" +
      "<tr><td>手取り率</td><td>" + rate.toFixed(1) + " %</td></tr>";

    var refBonuses = [100000, 300000, 500000, 700000, 1000000, 1500000, 2000000, 3000000];
    var rows = refBonuses.map(function (x) {
      var res = calc(x, prevSalary, ageGroup, dependents);
      var xRate = x > 0 ? (res.takeHome / x) * 100 : 0;
      var isCurrent = Math.abs(x - bonus) < 1;
      return (
        "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
        "<td>" + manYen(x) + "</td>" +
        "<td>" + manYen(res.takeHome) + "</td>" +
        "<td>" + xRate.toFixed(1) + " %</td>" +
        "</tr>"
      );
    });
    els.tableBody.innerHTML = rows.join("");

    var ctx = document.getElementById("growthChart").getContext("2d");
    var data = {
      labels: ["手取り", "社会保険料", "所得税"],
      datasets: [
        {
          data: [Math.round(r.takeHome), Math.round(r.bonusSocialInsurance), Math.round(r.incomeTax)],
          backgroundColor: ["#0f5f4c", "#7fa998", "#d98e04"],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var value = ctx.parsed;
              var pct = bonus > 0 ? (value / bonus) * 100 : 0;
              return ctx.label + "：" + yen(value) + "（" + pct.toFixed(1) + "%）";
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
      chart = new Chart(ctx, { type: "doughnut", data: data, options: options });
    }
  }

  [els.bonus, els.prevSalary, els.ageGroup, els.dependents].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

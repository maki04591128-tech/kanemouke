(function () {
  "use strict";

  // 生命保険の必要保障額 = 遺族に必要な支出の合計 − 準備できる資金の合計、という
  // FP実務でよく使われる「必要保障額の計算方法」の考え方に基づく簡易シミュレーター。
  // 子の教育費は0〜18歳（大学入学まで）に均等に発生すると仮定し、生活費は末子が
  // 22歳（独立の目安）になるまでは現在の70%、その後は配偶者一人分として90歳まで
  // 50%が続くと仮定する。遺族年金・配偶者の収入は「現在と同じ年額が続く」という
  // 簡略化した前提で、実際の受給期間・増減（子の加算終了等）は反映していない。
  var LIFE_END_AGE = 90;
  var CHILD_INDEPENDENCE_AGE = 22;
  var CHILD_EDU_AGE = 18;
  var SPOUSE_RETIRE_AGE = 65;

  var els = {
    livingCost: document.getElementById("hoshougaku-livingCost"),
    childAge: document.getElementById("hoshougaku-childAge"),
    childAgeOut: document.getElementById("hoshougaku-childAgeOut"),
    numChildren: document.getElementById("hoshougaku-numChildren"),
    numChildrenOut: document.getElementById("hoshougaku-numChildrenOut"),
    course: document.getElementById("hoshougaku-course"),
    eduTarget: document.getElementById("hoshougaku-eduTarget"),
    spouseAge: document.getElementById("hoshougaku-spouseAge"),
    spouseAgeOut: document.getElementById("hoshougaku-spouseAgeOut"),
    spouseIncome: document.getElementById("hoshougaku-spouseIncome"),
    savings: document.getElementById("hoshougaku-savings"),
    pension: document.getElementById("hoshougaku-pension"),
    pensionHint: document.getElementById("hoshougaku-pensionHint"),
    funeral: document.getElementById("hoshougaku-funeral"),
    verdict: document.getElementById("hoshougaku-verdict"),
    verdictSub: document.getElementById("hoshougaku-verdictSub"),
    total: document.getElementById("hoshougaku-result-total"),
    expense: document.getElementById("hoshougaku-result-expense"),
    resource: document.getElementById("hoshougaku-result-resource"),
    body: document.getElementById("hoshougaku-breakdown-body"),
  };

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function manYen(n) {
    var man = n / 10000;
    return man.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " 万円";
  }

  // 遺族基礎年金（令和7年度の目安額）：本人831,700円＋子の加算（1・2人目は234,800円ずつ、
  // 3人目以降は78,300円ずつ）。遺族厚生年金は勤務先の給与履歴によって変わるため含まない。
  function basicSurvivorPension(numChildren) {
    var addition = Math.min(numChildren, 2) * 234800 + Math.max(0, numChildren - 2) * 78300;
    return 831700 + addition;
  }

  function computeNeed(childAge, spouseAge, numChildren, eduTotalPerChild, monthlyLiving, spouseIncomeYearly, savings, pensionYearly, funeralCost) {
    var totalYears = Math.max(0, LIFE_END_AGE - spouseAge);
    var childDepYears = Math.min(Math.max(0, CHILD_INDEPENDENCE_AGE - childAge), totalYears);
    var spouseOnlyYears = totalYears - childDepYears;

    var livingCost70Total = monthlyLiving * 12 * 0.7 * childDepYears;
    var livingCost50Total = monthlyLiving * 12 * 0.5 * spouseOnlyYears;

    var eduFraction = Math.min(1, Math.max(0, (CHILD_EDU_AGE - childAge) / CHILD_EDU_AGE));
    var eduCostTotal = eduTotalPerChild * numChildren * eduFraction;

    var expenseTotal = livingCost70Total + livingCost50Total + eduCostTotal + funeralCost;

    // 遺族年金（遺族基礎年金）は子が22歳になるまで、配偶者の収入は65歳になるまで
    // 続くと仮定する（どちらも生涯続くと仮定すると資金が過大に見積もられるため）。
    var pensionYears = childDepYears;
    var incomeYears = Math.min(totalYears, Math.max(0, SPOUSE_RETIRE_AGE - spouseAge));
    var pensionTotal = pensionYearly * pensionYears;
    var spouseIncomeTotal = spouseIncomeYearly * incomeYears;
    var resourceTotal = savings + pensionTotal + spouseIncomeTotal;

    return {
      need: Math.max(0, expenseTotal - resourceTotal),
      expenseTotal: expenseTotal,
      resourceTotal: resourceTotal,
      livingCost70Total: livingCost70Total,
      livingCost50Total: livingCost50Total,
      eduCostTotal: eduCostTotal,
      eduFraction: eduFraction,
      funeralCost: funeralCost,
      savings: savings,
      pensionTotal: pensionTotal,
      pensionYears: pensionYears,
      spouseIncomeTotal: spouseIncomeTotal,
      incomeYears: incomeYears,
      totalYears: totalYears,
      childDepYears: childDepYears,
      spouseOnlyYears: spouseOnlyYears,
    };
  }

  function onCourseChange() {
    if (els.course.value === "custom") return;
    els.eduTarget.value = els.course.value;
    render();
  }

  function addRow(label, detail, amount) {
    var tr = document.createElement("tr");
    var th = document.createElement("th");
    th.textContent = label;
    var tdDetail = document.createElement("td");
    tdDetail.textContent = detail;
    var tdAmount = document.createElement("td");
    tdAmount.textContent = manYen(amount);
    tr.appendChild(th);
    tr.appendChild(tdDetail);
    tr.appendChild(tdAmount);
    return tr;
  }

  function render() {
    var monthlyLiving = Math.max(0, Number(els.livingCost.value) || 0);
    var childAge = Number(els.childAge.value);
    var numChildren = Number(els.numChildren.value);
    var eduTargetMan = Math.max(0, Number(els.eduTarget.value) || 0);
    var spouseAge = Number(els.spouseAge.value);
    var spouseIncomeMan = Math.max(0, Number(els.spouseIncome.value) || 0);
    var savingsMan = Math.max(0, Number(els.savings.value) || 0);
    var pensionMan = Math.max(0, Number(els.pension.value) || 0);
    var funeralMan = Math.max(0, Number(els.funeral.value) || 0);

    els.childAgeOut.textContent = childAge + " 歳";
    els.numChildrenOut.textContent = numChildren + " 人";
    els.spouseAgeOut.textContent = spouseAge + " 歳";
    els.pensionHint.textContent =
      "参考：お子さま" + numChildren + "人の場合の遺族基礎年金（令和7年度の目安額）は年額" +
      manYen(basicSurvivorPension(numChildren)) + "です（遺族厚生年金は含みません）。";

    var result = computeNeed(
      childAge,
      spouseAge,
      numChildren,
      eduTargetMan * 10000,
      monthlyLiving,
      spouseIncomeMan * 10000,
      savingsMan * 10000,
      pensionMan * 10000,
      funeralMan * 10000
    );

    els.total.textContent = manYen(result.need);
    els.expense.textContent = manYen(result.expenseTotal);
    els.resource.textContent = manYen(result.resourceTotal);

    if (result.need <= 0) {
      els.verdict.textContent = "現在の準備で不足額はほぼ生じない見込みです";
      els.verdictSub.textContent = "預貯金・遺族年金・配偶者の収入だけで想定支出をカバーできる目安です。ライフイベントの変化に応じて見直しましょう。";
    } else {
      els.verdict.textContent = "目安として " + manYen(result.need) + " の生命保険が必要です";
      els.verdictSub.textContent = "この金額を目安に、必要な期間だけ備える「定期保険」や「収入保障保険」を中心に検討すると、割安に備えやすい傾向があります。";
    }

    els.body.replaceChildren(
      addRow("生活費（子の独立まで70%）", "末子が" + CHILD_INDEPENDENCE_AGE + "歳になるまで" + result.childDepYears + "年分", result.livingCost70Total),
      addRow("生活費（子の独立後50%）", "配偶者が" + LIFE_END_AGE + "歳になるまで" + result.spouseOnlyYears + "年分", result.livingCost50Total),
      addRow("教育費", numChildren + "人分・残り" + Math.round(result.eduFraction * 100) + "%相当", result.eduCostTotal),
      addRow("葬儀費用・整理資金", "一時的な費用の目安", result.funeralCost),
      addRow("現在の預貯金・資産", "準備できる資金", -result.savings),
      addRow("遺族年金の見込み", "子が" + CHILD_INDEPENDENCE_AGE + "歳になるまで" + result.pensionYears + "年分", -result.pensionTotal),
      addRow("配偶者の収入の見込み", "65歳になるまで" + result.incomeYears + "年分", -result.spouseIncomeTotal)
    );

    var labels = [];
    var data = [];
    for (var t = 0; t <= result.totalYears; t++) {
      var point = computeNeed(
        childAge + t,
        spouseAge + t,
        numChildren,
        eduTargetMan * 10000,
        monthlyLiving,
        spouseIncomeMan * 10000,
        savingsMan * 10000,
        pensionMan * 10000,
        funeralMan * 10000
      );
      labels.push((spouseAge + t) + "歳時");
      data.push(Math.round(point.need));
    }

    var ctx = document.getElementById("hoshougaku-growthChart").getContext("2d");
    var chartData = {
      labels: labels,
      datasets: [
        {
          label: "その時点で死亡した場合の必要保障額",
          data: data,
          borderColor: "#0f5f4c",
          backgroundColor: "rgba(15, 95, 76, 0.12)",
          fill: true,
          tension: 0.2,
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
            label: function (c) { return c.dataset.label + "：" + yen(c.parsed.y); },
          },
        },
      },
    };

    if (chart) {
      chart.data = chartData;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data: chartData, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("hoshougaku-growthDataTable", chart);
  }

  els.course.addEventListener("change", onCourseChange);

  [
    els.livingCost,
    els.childAge,
    els.numChildren,
    els.eduTarget,
    els.spouseAge,
    els.spouseIncome,
    els.savings,
    els.pension,
    els.funeral,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

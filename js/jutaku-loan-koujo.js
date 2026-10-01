(function () {
  "use strict";

  var CREDIT_RATE = 0.007;
  var INCOME_LIMIT_FOR_ELIGIBILITY = 20000000; // 合計所得金額2000万円要件
  var RESIDENT_TAX_CREDIT_RATE_CAP = 0.05;
  var RESIDENT_TAX_CREDIT_YEN_CAP = 97500;

  // 2024・2025年入居を前提とした現行制度の借入限度額（円）と控除期間
  var CATEGORY_TABLE = {
    "new-nintei": { label: "新築：認定住宅（長期優良住宅・低炭素住宅）", limitNormal: 45000000, limitKosodate: 50000000, period: 13, kosodateApplicable: true },
    "new-zeh": { label: "新築：ZEH水準省エネ住宅", limitNormal: 35000000, limitKosodate: 45000000, period: 13, kosodateApplicable: true },
    "new-shoene": { label: "新築：省エネ基準適合住宅", limitNormal: 30000000, limitKosodate: 40000000, period: 13, kosodateApplicable: true },
    "new-sonota": { label: "新築：その他の住宅（2023年末までに建築確認・経過措置）", limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
    "used-nintei": { label: "既存（中古）：認定住宅等・ZEH水準省エネ住宅・省エネ基準適合住宅", limitNormal: 30000000, limitKosodate: 30000000, period: 10, kosodateApplicable: false },
    "used-sonota": { label: "既存（中古）：その他の住宅", limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
  };

  // 所得税の速算表（令和2年分以降）
  var TAX_BRACKETS = [
    { limit: 1950000, rate: 0.05, deduct: 0 },
    { limit: 3300000, rate: 0.10, deduct: 97500 },
    { limit: 6950000, rate: 0.20, deduct: 427500 },
    { limit: 9000000, rate: 0.23, deduct: 636000 },
    { limit: 18000000, rate: 0.33, deduct: 1536000 },
    { limit: 40000000, rate: 0.40, deduct: 2796000 },
    { limit: Infinity, rate: 0.45, deduct: 4796000 },
  ];

  // 給与所得控除額（所得税用）。令和8年度税制改正により、令和8・9年分は最低保障額が74万円に時限的に
  // 引き上げられている（令和10年分以後は本則69万円に戻る予定）。
  var SALARY_DEDUCTION_BRACKETS = [
    { limit: 2200000, calc: function () { return 740000; } },
    { limit: 3600000, calc: function (income) { return income * 0.3 + 80000; } },
    { limit: 6600000, calc: function (income) { return income * 0.2 + 440000; } },
    { limit: 8500000, calc: function (income) { return income * 0.1 + 1100000; } },
    { limit: Infinity, calc: function () { return 1950000; } },
  ];

  // 所得税の基礎控除額。令和8年度税制改正により、令和8・9年分は合計所得金額（給与収入のみの場合の
  // 収入金額）に応じて段階的に引き上げられている。
  function incomeBasicDeduction(grossIncome) {
    if (grossIncome <= 6655556) return 1040000;
    if (grossIncome <= 8500000) return 670000;
    return 620000; // 合計所得金額2,350万円超（収入2,545万円超）の逓減は簡易化のため未対応
  }
  var INCOME_SPOUSE_DEDUCTION = 380000;
  var INCOME_DEPENDENT_DEDUCTION = 380000;
  var RESIDENT_TAX_RATE = 0.10;

  // 繰上返済（期間短縮型）のタイミング別比較で使うプリセット（0＝繰上返済なし）。
  // NISA枠配分シミュレーター（js/nisa-haibun.js の DELAY_SCENARIOS）・生前贈与vs相続
  // シミュレーター（js/zouyo-souzoku.js の DELAY_SCENARIOS）と同じ「0を基準とした年数配列」の形式。
  var PREPAY_YEAR_SCENARIOS = [0, 1, 3, 5, 10];

  var els = {
    principal: document.getElementById("koujo-principal"),
    loanRate: document.getElementById("koujo-loanRate"),
    loanYears: document.getElementById("koujo-loanYears"),
    category: document.getElementById("koujo-category"),
    kosodateRow: document.getElementById("koujo-kosodateRow"),
    kosodate: document.getElementById("koujo-kosodate"),
    salaryIncome: document.getElementById("koujo-salaryIncome"),
    hasSpouse: document.getElementById("koujo-hasSpouse"),
    dependents: document.getElementById("koujo-dependents"),
    prepayAmount: document.getElementById("koujo-prepayAmount"),
    verdict: document.getElementById("koujo-verdict"),
    verdictSub: document.getElementById("koujo-verdictSub"),
    resultLimit: document.getElementById("koujo-result-limit"),
    resultPeriod: document.getElementById("koujo-result-period"),
    resultFirstYear: document.getElementById("koujo-result-first-year"),
    resultTotal: document.getElementById("koujo-result-total"),
    resultIncomeTax: document.getElementById("koujo-result-income-tax"),
    tableBody: document.getElementById("koujo-breakdown-body"),
    prepayTableWrap: document.getElementById("koujo-prepayTableWrap"),
    prepayNote: document.getElementById("koujo-prepayNote"),
    prepayBody: document.getElementById("koujo-prepay-body"),
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

  function floorTo(n, unit) {
    return Math.floor(n / unit) * unit;
  }

  function salaryIncomeAfterDeduction(grossIncome) {
    for (var i = 0; i < SALARY_DEDUCTION_BRACKETS.length; i++) {
      var b = SALARY_DEDUCTION_BRACKETS[i];
      if (grossIncome <= b.limit) {
        var deduction = Math.max(550000, b.calc(grossIncome));
        return Math.max(0, grossIncome - deduction);
      }
    }
    return grossIncome;
  }

  function incomeTaxAmount(taxable) {
    if (taxable <= 0) return 0;
    for (var i = 0; i < TAX_BRACKETS.length; i++) {
      if (taxable <= TAX_BRACKETS[i].limit) {
        return Math.max(0, taxable * TAX_BRACKETS[i].rate - TAX_BRACKETS[i].deduct);
      }
    }
    var last = TAX_BRACKETS[TAX_BRACKETS.length - 1];
    return Math.max(0, taxable * last.rate - last.deduct);
  }

  function monthlyPayment(principal, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (i === 0) return principal / months;
    return (principal * i) / (1 - Math.pow(1 + i, -months));
  }

  // prepayAtMonth / prepayAmount は任意（省略時は従来どおり繰上返済なしの残高推移を返す）。
  // 指定した場合、その月の返済直後に prepayAmount を残高から一括で差し引く「期間短縮型」の
  // 繰上返済（js/loan-vs-invest.js の「繰上返済vs投資」タブと同じ考え方）として扱い、毎月の
  // 返済額（当初のpayment）は変えずに以降の返済を続ける。
  function simulateLoan(principal, annualRatePct, months, prepayAtMonth, prepayAmount) {
    var i = annualRatePct / 100 / 12;
    var payment = monthlyPayment(principal, annualRatePct, months);
    var balance = principal;
    var balances = [principal];
    for (var m = 1; m <= months; m++) {
      var interest = balance * i;
      var due = payment;
      if (due > balance + interest) due = balance + interest;
      balance = Math.max(0, balance + interest - due);
      if (prepayAtMonth && m === prepayAtMonth && prepayAmount > 0) {
        balance = Math.max(0, balance - prepayAmount);
      }
      balances.push(balance);
    }
    return balances;
  }

  // balances（simulateLoanが返す年末ではなく月末残高の配列、balances[0]=借入当初）から、
  // その返済スケジュールで実際に支払うことになる利息の合計を逆算する。完済後（残高0）の月は
  // 利息0として自然に合算されるため、prepayAtMonthで完済が早まったスケジュールにもそのまま使える。
  function totalInterestFromBalances(balances, annualRatePct) {
    var i = annualRatePct / 100 / 12;
    var total = 0;
    for (var m = 1; m < balances.length; m++) {
      total += balances[m - 1] * i;
    }
    return total;
  }

  // 1年分の年末残高推移（balances）と制度条件から、creditPeriod年間の控除スケジュールを計算する。
  // render() 内の本来の計算ロジックを、繰上返済ありのシナリオにもそのまま再利用できるよう切り出したもの。
  function computeCreditSchedule(balances, creditPeriod, loanMonths, limit, overIncomeLimit, taxAmount, residentTaxCap) {
    var rows = [];
    var totalCredit = 0;
    var totalUnused = 0;
    var firstYearCredit = 0;

    for (var y = 1; y <= creditPeriod; y++) {
      var monthIdx = y * 12;
      var yearEndBalance = monthIdx <= loanMonths ? balances[monthIdx] : 0;
      var eligibleBalance = Math.min(floorTo(yearEndBalance, 1000), limit);
      var rawCredit = overIncomeLimit ? 0 : floorTo(eligibleBalance * CREDIT_RATE, 100);
      var incomeTaxUsed = Math.min(rawCredit, taxAmount);
      var residentTaxUsed = Math.min(rawCredit - incomeTaxUsed, residentTaxCap);
      var used = incomeTaxUsed + residentTaxUsed;
      var unused = rawCredit - used;

      totalCredit += used;
      totalUnused += unused;
      if (y === 1) firstYearCredit = used;

      rows.push({
        year: y,
        balance: yearEndBalance,
        eligibleBalance: eligibleBalance,
        rawCredit: rawCredit,
        incomeTaxUsed: incomeTaxUsed,
        residentTaxUsed: residentTaxUsed,
        unused: unused,
      });
    }

    return { rows: rows, totalCredit: totalCredit, totalUnused: totalUnused, firstYearCredit: firstYearCredit };
  }

  function render() {
    var principal = clampNonNegative(els.principal.value);
    var loanRate = Number(els.loanRate.value);
    var loanYears = Math.max(1, Number(els.loanYears.value) || 1);
    var categoryKey = els.category.value;
    var category = CATEGORY_TABLE[categoryKey];
    var kosodate = els.kosodate.value === "yes";
    var grossIncome = clampNonNegative(els.salaryIncome.value);
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.round(Number(els.dependents.value) || 0));

    els.kosodateRow.style.display = category.kosodateApplicable ? "" : "none";

    var limit = category.kosodateApplicable && kosodate ? category.limitKosodate : category.limitNormal;
    var creditPeriod = category.period;

    var salaryIncome = salaryIncomeAfterDeduction(grossIncome);
    var incomeDeductions =
      incomeBasicDeduction(grossIncome) + (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) + dependents * INCOME_DEPENDENT_DEDUCTION;
    var taxableForIncomeTax = Math.max(0, salaryIncome - incomeDeductions);
    var taxAmount = incomeTaxAmount(taxableForIncomeTax);
    var residentTaxCap = Math.min(taxableForIncomeTax * RESIDENT_TAX_CREDIT_RATE_CAP, RESIDENT_TAX_CREDIT_YEN_CAP);

    var overIncomeLimit = salaryIncome > INCOME_LIMIT_FOR_ELIGIBILITY;

    var loanMonths = Math.round(loanYears * 12);
    var balances = simulateLoan(principal, loanRate, loanMonths);

    var schedule = computeCreditSchedule(balances, creditPeriod, loanMonths, limit, overIncomeLimit, taxAmount, residentTaxCap);
    var rows = schedule.rows;
    var totalCredit = schedule.totalCredit;
    var totalUnused = schedule.totalUnused;
    var firstYearCredit = schedule.firstYearCredit;

    els.resultLimit.textContent = manYen(limit);
    els.resultPeriod.textContent = creditPeriod + " 年";
    els.resultFirstYear.textContent = yen(firstYearCredit);
    els.resultTotal.textContent = manYen(totalCredit);
    els.resultIncomeTax.textContent = yen(taxAmount);

    if (overIncomeLimit) {
      els.verdict.textContent = "合計所得金額が2000万円を超えるため、この年は控除の対象外です";
      els.verdictSub.textContent = "住宅ローン控除には各年の合計所得金額が2,000万円以下という要件があります。年によって所得が変動する場合は、その年ごとに判定されます。";
    } else if (totalUnused > 0) {
      els.verdict.textContent = creditPeriod + "年間の控除額（実際に引ききれる分）は " + manYen(totalCredit) + " です";
      els.verdictSub.textContent =
        "年末残高から計算される控除枠のうち、合計 " + manYen(totalUnused) +
        " 分は所得税・住民税の負担額が足りず控除しきれない見込みです（原則、翌年への繰り越しはできません）。";
    } else {
      els.verdict.textContent = creditPeriod + "年間の控除額は合計 " + manYen(totalCredit) + " の見込みです";
      els.verdictSub.textContent = "この条件では、年末残高に基づく控除枠を所得税・住民税でちょうど（または余裕を持って）引ききれる見込みです。";
    }

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return (
          "<tr><td>" + r.year + "年目</td><td>" + yen(r.balance) + "</td><td>" + yen(r.rawCredit) +
          "</td><td>" + yen(r.incomeTaxUsed) + "</td><td>" + yen(r.residentTaxUsed) +
          "</td><td>" + (r.unused > 0 ? yen(r.unused) : "-") + "</td></tr>"
        );
      })
      .join("");

    // ---- 繰上返済（期間短縮型）を実行すると控除額・利息はどう変わる？ ----
    // 繰上返済額が0（初期値）の間は比較表を表示せず、既存の試算結果に一切影響しない。
    var prepayAmount = clampNonNegative(els.prepayAmount.value);
    if (prepayAmount > 0) {
      els.prepayTableWrap.style.display = "";
      var baseInterest = totalInterestFromBalances(balances, loanRate);
      var prepayRows = PREPAY_YEAR_SCENARIOS.filter(function (y) {
        return y === 0 || y * 12 <= loanMonths;
      }).map(function (y) {
        var yearBalances = y === 0 ? balances : simulateLoan(principal, loanRate, loanMonths, y * 12, prepayAmount);
        var yearSchedule = computeCreditSchedule(yearBalances, creditPeriod, loanMonths, limit, overIncomeLimit, taxAmount, residentTaxCap);
        var interest = totalInterestFromBalances(yearBalances, loanRate);
        return {
          year: y,
          totalCredit: yearSchedule.totalCredit,
          creditDiff: yearSchedule.totalCredit - totalCredit,
          interestSaved: baseInterest - interest,
        };
      });

      els.prepayBody.innerHTML = prepayRows
        .map(function (r) {
          var label = r.year === 0 ? "繰上返済なし" : r.year + "年目の年末に実行";
          var creditDiffText = r.year === 0 ? "－" : (r.creditDiff >= 0 ? "+" : "－") + manYen(Math.abs(r.creditDiff));
          var interestSavedText = r.year === 0 ? "－" : manYen(Math.max(0, r.interestSaved));
          return (
            "<tr><td>" + label + "</td><td>" + manYen(r.totalCredit) + "</td><td>" + creditDiffText +
            "</td><td>" + interestSavedText + "</td></tr>"
          );
        })
        .join("");

      var fiveYearRow = prepayRows.filter(function (r) { return r.year === 5; })[0];
      var referenceRow = fiveYearRow || prepayRows[prepayRows.length - 1];
      if (referenceRow && referenceRow.year > 0) {
        els.prepayNote.textContent =
          manYen(prepayAmount) + "の繰上返済（期間短縮型）を" + referenceRow.year + "年目の年末に実行すると、" + creditPeriod +
          "年間の住宅ローン控除額は繰上返済しない場合より約 " + manYen(Math.abs(referenceRow.creditDiff)) +
          " 少なくなる一方、完済までの利息は約 " + manYen(Math.max(0, referenceRow.interestSaved)) +
          " 軽減される見込みです。実行するタイミングが早いほど利息軽減効果は大きくなりやすい一方、年末残高が借入限度額を下回る年ほど控除額への影響も大きくなる傾向があります。";
      } else {
        els.prepayNote.textContent =
          "返済期間が短いため、比較できるタイミングの候補が限られています。下の表で実際に試算できるタイミングをご確認ください。";
      }
    } else {
      els.prepayTableWrap.style.display = "none";
    }

    var labels = rows.map(function (r) { return r.year + "年目"; });
    var data = {
      labels: labels,
      datasets: [
        {
          label: "所得税から控除",
          data: rows.map(function (r) { return Math.round(r.incomeTaxUsed); }),
          backgroundColor: "#0f5f4c",
          stack: "credit",
        },
        {
          label: "住民税から控除",
          data: rows.map(function (r) { return Math.round(r.residentTaxUsed); }),
          backgroundColor: "#4f9d84",
          stack: "credit",
        },
        {
          label: "控除しきれない額",
          data: rows.map(function (r) { return Math.round(r.unused); }),
          backgroundColor: "#d98e04",
          stack: "credit",
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: function (v) { return manYen(v); } } },
      },
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：" + yen(ctx.parsed.y);
            },
          },
        },
      },
    };

    var ctx = document.getElementById("koujo-creditChart").getContext("2d");
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "bar", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("koujo-creditDataTable", chart);
  }

  [
    els.principal,
    els.loanRate,
    els.loanYears,
    els.category,
    els.kosodate,
    els.salaryIncome,
    els.hasSpouse,
    els.dependents,
    els.prepayAmount,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

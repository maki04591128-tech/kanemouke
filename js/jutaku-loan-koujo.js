(function () {
  "use strict";

  var CREDIT_RATE = 0.007;
  var INCOME_LIMIT_FOR_ELIGIBILITY = 20000000; // 合計所得金額2000万円要件
  var RESIDENT_TAX_CREDIT_RATE_CAP = 0.05;
  var RESIDENT_TAX_CREDIT_YEN_CAP = 97500;

  // 2024〜2028年入居を対象とした現行制度の借入限度額（円）と控除期間。
  // 新築：認定住宅・ZEH水準省エネ住宅・その他の住宅（経過措置）・既存（中古）の各区分は、国税庁
  // タックスアンサーNo.1211-1（令和8年4月1日現在法令等）の借入限度額一覧表で、2024〜2028年（令和6〜10年）
  // 入居まで同一の金額・控除期間が示されているため、入居年によらない固定値として扱う。
  var CATEGORY_TABLE = {
    "new-nintei": { label: "新築：認定住宅（長期優良住宅・低炭素住宅）", limitNormal: 45000000, limitKosodate: 50000000, period: 13, kosodateApplicable: true },
    "new-zeh": { label: "新築：ZEH水準省エネ住宅", limitNormal: 35000000, limitKosodate: 45000000, period: 13, kosodateApplicable: true },
    "new-sonota": { label: "新築：その他の住宅（2023年末までに建築確認・経過措置）", limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
    "used-nintei": { label: "既存（中古）：認定住宅等・ZEH水準省エネ住宅・省エネ基準適合住宅", limitNormal: 30000000, limitKosodate: 30000000, period: 10, kosodateApplicable: false },
    "used-sonota": { label: "既存（中古）：その他の住宅", limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
  };

  // 新築：省エネ基準適合住宅のみ、入居年（令和6〜10年）に応じて借入限度額・控除期間が段階的に
  // 縮小する（同タックスアンサーの借入限度額一覧表より）。2024・2025年（令和6・7年）は3,000万円
  // （特例対象個人4,000万円）、2026年（令和8年）は2,000万円（特例対象個人3,000万円）でともに13年間、
  // 2027・2028年（令和9・10年）は特例対象個人の上乗せが無くなり2,000万円・10年間（建築確認等の期限
  // 要件あり、経過措置の「その他の住宅」と同じ扱い）になる。
  var SHOENE_BY_YEAR = {
    "2024_2025": { limitNormal: 30000000, limitKosodate: 40000000, period: 13, kosodateApplicable: true },
    "2026": { limitNormal: 20000000, limitKosodate: 30000000, period: 13, kosodateApplicable: true },
    "2027_2028": { limitNormal: 20000000, limitKosodate: 20000000, period: 10, kosodateApplicable: false },
  };
  var SHOENE_LABEL = "新築：省エネ基準適合住宅";

  function resolveCategory(categoryKey, yearBucket) {
    if (categoryKey === "new-shoene") {
      var byYear = SHOENE_BY_YEAR[yearBucket] || SHOENE_BY_YEAR["2026"];
      return {
        label: SHOENE_LABEL,
        limitNormal: byYear.limitNormal,
        limitKosodate: byYear.limitKosodate,
        period: byYear.period,
        kosodateApplicable: byYear.kosodateApplicable,
      };
    }
    return CATEGORY_TABLE[categoryKey];
  }

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
    loanMode: document.getElementById("koujo-loanMode"),
    principal: document.getElementById("koujo-principal"),
    principalLabel: document.getElementById("koujo-principalLabel"),
    principalBRow: document.getElementById("koujo-principalBRow"),
    principalB: document.getElementById("koujo-principalB"),
    shareARow: document.getElementById("koujo-shareARow"),
    shareA: document.getElementById("koujo-shareA"),
    loanRateLabel: document.getElementById("koujo-loanRateLabel"),
    loanRate: document.getElementById("koujo-loanRate"),
    loanRateBRow: document.getElementById("koujo-loanRateBRow"),
    loanRateB: document.getElementById("koujo-loanRateB"),
    loanYearsLabel: document.getElementById("koujo-loanYearsLabel"),
    loanYears: document.getElementById("koujo-loanYears"),
    loanYearsBRow: document.getElementById("koujo-loanYearsBRow"),
    loanYearsB: document.getElementById("koujo-loanYearsB"),
    moveInYear: document.getElementById("koujo-moveInYear"),
    category: document.getElementById("koujo-category"),
    kosodateRow: document.getElementById("koujo-kosodateRow"),
    kosodate: document.getElementById("koujo-kosodate"),
    salaryIncomeLabel: document.getElementById("koujo-salaryIncomeLabel"),
    salaryIncome: document.getElementById("koujo-salaryIncome"),
    hasSpouse: document.getElementById("koujo-hasSpouse"),
    dependentsLabel: document.getElementById("koujo-dependentsLabel"),
    dependents: document.getElementById("koujo-dependents"),
    salaryIncomeBRow: document.getElementById("koujo-salaryIncomeBRow"),
    salaryIncomeB: document.getElementById("koujo-salaryIncomeB"),
    dependentsBRow: document.getElementById("koujo-dependentsBRow"),
    dependentsB: document.getElementById("koujo-dependentsB"),
    prepayAmount: document.getElementById("koujo-prepayAmount"),
    prepayHint: document.getElementById("koujo-prepayHint"),
    verdict: document.getElementById("koujo-verdict"),
    verdictSub: document.getElementById("koujo-verdictSub"),
    resultLimit: document.getElementById("koujo-result-limit"),
    resultPeriod: document.getElementById("koujo-result-period"),
    resultFirstYear: document.getElementById("koujo-result-first-year"),
    resultTotal: document.getElementById("koujo-result-total"),
    resultSplitNote: document.getElementById("koujo-result-split-note"),
    resultIncomeTaxLabel: document.getElementById("koujo-result-income-tax-label"),
    resultIncomeTax: document.getElementById("koujo-result-income-tax"),
    resultIncomeTaxBCard: document.getElementById("koujo-result-income-tax-b-card"),
    resultIncomeTaxB: document.getElementById("koujo-result-income-tax-b"),
    breakdownTh: document.getElementById("koujo-breakdown-th"),
    tableBody: document.getElementById("koujo-breakdown-body"),
    breakdownBWrap: document.getElementById("koujo-breakdownBWrap"),
    tableBodyB: document.getElementById("koujo-breakdown-body-b"),
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

  // ペアローン・連帯債務（balancesBがnullなら単独）の世帯合計を計算する。balancesA/balancesBは
  // どちらも「年末残高の配列（本人・配偶者等それぞれが実際に負担する額ベース）」で、呼び出し側で
  // ペアローン（別々の借入額・別々の金利・返済期間）か連帯債務（1本の借入額を負担割合で按分、
  // 金利・返済期間は共通）かに応じて作り分ける。loanMonthsBは配偶者等の返済期間（連帯債務・単独
  // ではloanMonthsと同じ値）で、返済期間が異なると完済後の年末残高が0になるタイミングもずれる。
  // 借入限度額（limit）は按分せず、本人・配偶者等ともに住宅の区分に応じた限度額をそのまま使う
  // （国税庁の取り扱い上、ペアローン・連帯債務のいずれも1人あたりの借入限度額は按分されないため）。
  function computeHouseholdCredit(
    balancesA, creditPeriod, loanMonths, limit, overIncomeLimitA, taxAmountA, residentTaxCapA,
    balancesB, loanMonthsB, overIncomeLimitB, taxAmountB, residentTaxCapB
  ) {
    var a = computeCreditSchedule(balancesA, creditPeriod, loanMonths, limit, overIncomeLimitA, taxAmountA, residentTaxCapA);
    var b = balancesB ? computeCreditSchedule(balancesB, creditPeriod, loanMonthsB, limit, overIncomeLimitB, taxAmountB, residentTaxCapB) : null;
    return {
      a: a,
      b: b,
      totalCredit: a.totalCredit + (b ? b.totalCredit : 0),
      totalUnused: a.totalUnused + (b ? b.totalUnused : 0),
      firstYearCredit: a.firstYearCredit + (b ? b.firstYearCredit : 0),
    };
  }

  // 年末残高（balances、本人分の負担ベース）に対する所得税額・住民税所得割上限・合計所得金額
  // 要件判定を、本人・配偶者等どちらにも使い回せる形でまとめて計算する。
  function personTaxContext(grossIncome, extraDeductions) {
    var salaryIncome = salaryIncomeAfterDeduction(grossIncome);
    var incomeDeductions = incomeBasicDeduction(grossIncome) + extraDeductions;
    var taxableForIncomeTax = Math.max(0, salaryIncome - incomeDeductions);
    return {
      taxAmount: incomeTaxAmount(taxableForIncomeTax),
      residentTaxCap: Math.min(taxableForIncomeTax * RESIDENT_TAX_CREDIT_RATE_CAP, RESIDENT_TAX_CREDIT_YEN_CAP),
      overIncomeLimit: salaryIncome > INCOME_LIMIT_FOR_ELIGIBILITY,
    };
  }

  function render() {
    var loanMode = els.loanMode.value; // "single" | "pair" | "joint"
    var isPair = loanMode === "pair";
    var isJoint = loanMode === "joint";
    var isShared = isPair || isJoint;

    els.principalBRow.style.display = isPair ? "" : "none";
    els.loanRateBRow.style.display = isPair ? "" : "none";
    els.loanYearsBRow.style.display = isPair ? "" : "none";
    els.shareARow.style.display = isJoint ? "" : "none";
    els.salaryIncomeBRow.style.display = isShared ? "" : "none";
    els.dependentsBRow.style.display = isShared ? "" : "none";
    els.principalLabel.innerHTML = (isPair ? "本人の借入額（当初）" : isJoint ? "借入額（当初・世帯合計）" : "借入額（当初）") + ' <span class="unit">円</span>';
    els.loanRateLabel.innerHTML = (isPair ? "本人の借入金利（年率）" : "借入金利（年率）") + ' <span class="unit">%</span>';
    els.loanYearsLabel.innerHTML = (isPair ? "本人の返済期間" : "返済期間") + ' <span class="unit">年</span>';
    els.salaryIncomeLabel.innerHTML = (isShared ? "給与収入（本人・年収・額面）" : "給与収入（年収・額面）") + ' <span class="unit">円</span>';
    els.dependentsLabel.innerHTML = (isShared ? "本人の扶養親族の人数（配偶者を除く）" : "扶養親族の人数（配偶者を除く）") + ' <span class="unit">人</span>';
    els.prepayHint.textContent = isPair
      ? "0のまま（初期値）なら繰上返済なしで試算します。ペアローンでは本人の借入分にのみ繰上返済を適用します（配偶者等の借入は変更しません）。"
      : "0のまま（初期値）なら繰上返済なしで試算します。金額を入力すると、下に「繰上返済すると控除額はどう変わる？」の比較表が表示されます。";

    var principal = clampNonNegative(els.principal.value);
    var loanRate = Number(els.loanRate.value);
    var loanYears = Math.max(1, Number(els.loanYears.value) || 1);
    var categoryKey = els.category.value;
    var yearBucket = els.moveInYear.value;
    var category = resolveCategory(categoryKey, yearBucket);
    var kosodate = els.kosodate.value === "yes";
    var grossIncome = clampNonNegative(els.salaryIncome.value);
    var hasSpouse = els.hasSpouse.value === "yes";
    var dependents = Math.max(0, Math.round(Number(els.dependents.value) || 0));

    els.kosodateRow.style.display = category.kosodateApplicable ? "" : "none";

    var limit = category.kosodateApplicable && kosodate ? category.limitKosodate : category.limitNormal;
    var creditPeriod = category.period;

    var ctxA = personTaxContext(grossIncome, (hasSpouse ? INCOME_SPOUSE_DEDUCTION : 0) + dependents * INCOME_DEPENDENT_DEDUCTION);
    var taxAmount = ctxA.taxAmount;
    var residentTaxCap = ctxA.residentTaxCap;
    var overIncomeLimit = ctxA.overIncomeLimit;

    var loanMonths = Math.round(loanYears * 12);
    var loanRateB = Number(els.loanRateB.value);
    var loanYearsB = Math.max(1, Number(els.loanYearsB.value) || 1);
    var loanMonthsB = loanMonths; // 連帯債務・単独は本人と同じ1本の借入のため同じ返済期間を使う

    var principalB = 0;
    var shareA = 1;
    var balances; // 本人の負担ベースの年末残高（繰上返済なし）
    var balancesB = null; // 配偶者等の負担ベースの年末残高（単独モードではnull）
    var totalBalances; // 利息計算・繰上返済の基準となる「ローン全体」の残高

    if (isPair) {
      principalB = clampNonNegative(els.principalB.value);
      loanMonthsB = Math.round(loanYearsB * 12);
      balances = simulateLoan(principal, loanRate, loanMonths);
      balancesB = simulateLoan(principalB, loanRateB, loanMonthsB);
      totalBalances = balances; // 繰上返済は本人分の借入にのみ適用する
    } else if (isJoint) {
      shareA = Math.min(99, Math.max(1, Number(els.shareA.value) || 50)) / 100;
      totalBalances = simulateLoan(principal, loanRate, loanMonths);
      balances = totalBalances.map(function (b) { return b * shareA; });
      balancesB = totalBalances.map(function (b) { return b * (1 - shareA); });
    } else {
      balances = simulateLoan(principal, loanRate, loanMonths);
      totalBalances = balances;
    }

    var taxAmountB = 0, residentTaxCapB = 0, overIncomeLimitB = false;
    if (isShared) {
      var grossIncomeB = clampNonNegative(els.salaryIncomeB.value);
      var dependentsB = Math.max(0, Math.round(Number(els.dependentsB.value) || 0));
      var ctxB = personTaxContext(grossIncomeB, dependentsB * INCOME_DEPENDENT_DEDUCTION);
      taxAmountB = ctxB.taxAmount;
      residentTaxCapB = ctxB.residentTaxCap;
      overIncomeLimitB = ctxB.overIncomeLimit;
    }

    var household = computeHouseholdCredit(
      balances, creditPeriod, loanMonths, limit, overIncomeLimit, taxAmount, residentTaxCap,
      balancesB, loanMonthsB, overIncomeLimitB, taxAmountB, residentTaxCapB
    );
    var rows = household.a.rows;
    var rowsB = household.b ? household.b.rows : null;
    var totalCredit = household.totalCredit;
    var totalUnused = household.totalUnused;
    var firstYearCredit = household.firstYearCredit;

    els.resultLimit.textContent = manYen(limit);
    els.resultPeriod.textContent = creditPeriod + " 年";
    els.resultFirstYear.textContent = yen(firstYearCredit);
    els.resultTotal.textContent = manYen(totalCredit);
    els.resultIncomeTaxLabel.textContent = isShared ? "本人の所得税額（概算・年間）" : "所得税額（概算・年間）";
    els.resultIncomeTax.textContent = yen(taxAmount);
    els.resultIncomeTaxBCard.style.display = isShared ? "" : "none";
    if (isShared) els.resultIncomeTaxB.textContent = yen(taxAmountB);

    els.resultSplitNote.style.display = isShared ? "" : "none";
    if (isShared) {
      var modeLabel = isPair ? "ペアローン" : "連帯債務（本人負担割合" + Math.round(shareA * 100) + "%）";
      els.resultSplitNote.textContent =
        "世帯合計（" + modeLabel + "）の内訳：本人 " + manYen(household.a.totalCredit) + " ／ 配偶者等 " + manYen(household.b.totalCredit) + "。";
    }

    if (overIncomeLimit && (!isShared || overIncomeLimitB)) {
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

    els.breakdownTh.textContent = isShared ? "経過年（本人）" : "経過年";
    els.tableBody.innerHTML = rows
      .map(function (r) {
        return (
          "<tr><td>" + r.year + "年目</td><td>" + yen(r.balance) + "</td><td>" + yen(r.rawCredit) +
          "</td><td>" + yen(r.incomeTaxUsed) + "</td><td>" + yen(r.residentTaxUsed) +
          "</td><td>" + (r.unused > 0 ? yen(r.unused) : "-") + "</td></tr>"
        );
      })
      .join("");

    els.breakdownBWrap.style.display = isShared ? "" : "none";
    if (isShared) {
      els.tableBodyB.innerHTML = rowsB
        .map(function (r) {
          return (
            "<tr><td>" + r.year + "年目</td><td>" + yen(r.balance) + "</td><td>" + yen(r.rawCredit) +
            "</td><td>" + yen(r.incomeTaxUsed) + "</td><td>" + yen(r.residentTaxUsed) +
            "</td><td>" + (r.unused > 0 ? yen(r.unused) : "-") + "</td></tr>"
          );
        })
        .join("");
    }

    // ---- 繰上返済（期間短縮型）を実行すると控除額・利息はどう変わる？ ----
    // 繰上返済額が0（初期値）の間は比較表を表示せず、既存の試算結果に一切影響しない。
    // ペアローンでは本人の借入分のみ、連帯債務ではローン全体（按分前）に繰上返済を適用する。
    var prepayAmount = clampNonNegative(els.prepayAmount.value);
    if (prepayAmount > 0) {
      els.prepayTableWrap.style.display = "";
      var baseInterest = totalInterestFromBalances(totalBalances, loanRate) + (isPair ? totalInterestFromBalances(balancesB, loanRateB) : 0);
      var prepayRows = PREPAY_YEAR_SCENARIOS.filter(function (y) {
        return y === 0 || y * 12 <= loanMonths;
      }).map(function (y) {
        var yearTotalBalances = y === 0 ? totalBalances : simulateLoan(principal, loanRate, loanMonths, y * 12, prepayAmount);
        var yearBalancesA, yearBalancesB, interest;
        if (isJoint) {
          yearBalancesA = yearTotalBalances.map(function (b) { return b * shareA; });
          yearBalancesB = yearTotalBalances.map(function (b) { return b * (1 - shareA); });
          interest = totalInterestFromBalances(yearTotalBalances, loanRate);
        } else if (isPair) {
          yearBalancesA = yearTotalBalances;
          yearBalancesB = balancesB;
          interest = totalInterestFromBalances(yearTotalBalances, loanRate) + totalInterestFromBalances(balancesB, loanRateB);
        } else {
          yearBalancesA = yearTotalBalances;
          yearBalancesB = null;
          interest = totalInterestFromBalances(yearTotalBalances, loanRate);
        }
        var yearHousehold = computeHouseholdCredit(
          yearBalancesA, creditPeriod, loanMonths, limit, overIncomeLimit, taxAmount, residentTaxCap,
          yearBalancesB, loanMonthsB, overIncomeLimitB, taxAmountB, residentTaxCapB
        );
        return {
          year: y,
          totalCredit: yearHousehold.totalCredit,
          creditDiff: yearHousehold.totalCredit - totalCredit,
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
          "年間の住宅ローン控除額（世帯合計）は繰上返済しない場合より約 " + manYen(Math.abs(referenceRow.creditDiff)) +
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
    var incomeTaxUsedByYear = rows.map(function (r, idx) { return r.incomeTaxUsed + (rowsB ? rowsB[idx].incomeTaxUsed : 0); });
    var residentTaxUsedByYear = rows.map(function (r, idx) { return r.residentTaxUsed + (rowsB ? rowsB[idx].residentTaxUsed : 0); });
    var unusedByYear = rows.map(function (r, idx) { return r.unused + (rowsB ? rowsB[idx].unused : 0); });
    var data = {
      labels: labels,
      datasets: [
        {
          label: "所得税から控除",
          data: incomeTaxUsedByYear.map(function (v) { return Math.round(v); }),
          backgroundColor: "#0f5f4c",
          stack: "credit",
        },
        {
          label: "住民税から控除",
          data: residentTaxUsedByYear.map(function (v) { return Math.round(v); }),
          backgroundColor: "#4f9d84",
          stack: "credit",
        },
        {
          label: "控除しきれない額",
          data: unusedByYear.map(function (v) { return Math.round(v); }),
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
    els.loanMode,
    els.principal,
    els.principalB,
    els.shareA,
    els.loanRate,
    els.loanRateB,
    els.loanYears,
    els.loanYearsB,
    els.moveInYear,
    els.category,
    els.kosodate,
    els.salaryIncome,
    els.hasSpouse,
    els.dependents,
    els.salaryIncomeB,
    els.dependentsB,
    els.prepayAmount,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

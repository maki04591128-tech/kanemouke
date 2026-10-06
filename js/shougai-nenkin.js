(function () {
  "use strict";

  // 障害年金シミュレーター。
  // 病気やけがで一定の障害の状態になった場合に支給される障害基礎年金・
  // 障害厚生年金・配偶者加給年金額の見込み額を試算する。
  //
  // 障害基礎年金：1級1,059,125円・2級847,300円（令和8年度）＋子の加算
  // （1人目・2人目 各243,800円、3人目以降 各81,300円）。3級には障害基礎
  // 年金が存在しないため、初診日時点で国民年金のみに加入していた方が3級
  // 相当の場合は障害年金そのものが支給されない。
  // 障害厚生年金：老齢厚生年金の報酬比例部分相当額（平均年収の月額換算×
  // 5.481/1000×加入月数）をもとに、1級はその1.25倍・2級はそのまま・3級
  // もそのまま（ただし令和8年度は635,500円の最低保障あり）。遺族厚生年金
  // の短期要件と同様、加入月数が300月（25年）に満たない場合は300月とみな
  // す。
  // 配偶者加給年金額：1級・2級の障害厚生年金に、生計を維持されている65歳
  // 未満の配偶者がいる場合に加算される243,800円（令和8年度）。老齢厚生
  // 年金の配偶者加給年金額と異なり、受給者の生年月日による特別加算は無い。
  //
  // 20歳前の傷病による障害基礎年金の所得制限：保険料を納付していない期間
  // の障害のため、本人の前年所得に応じて年金額の一部・全部が支給停止され
  // る（令和8年10月以降：前年所得3,858,000円超で2分の1停止、4,918,000円
  // 超で全部停止。対象期間は10月分〜翌年9月分）。扶養親族の所得制限額の
  // 加算は区分により異なり、老人控除対象配偶者・老人扶養親族は1人48万円、
  // 特定扶養親族・19歳未満の控除対象扶養親族は1人63万円、その他の扶養親
  // 族は1人38万円を加算する。国民年金のみ加入時のみ対象。
  //
  // 労災保険の障害（補償）年金との調整：同一の病気・けがについて労災保険
  // の障害（補償）年金（1〜7級）と障害年金（障害基礎年金・障害厚生年金）
  // を同時に受け取る場合、二重填補を避けるため労災保険側に調整率がかかり
  // 減額される。障害年金側はそのまま全額支給される（厚生労働省発表）。
  // 調整率は併給される年金の組み合わせで決まり、障害基礎年金＋障害厚生年
  // 金の場合0.73、障害厚生年金のみ0.83、障害基礎年金のみ0.88。さらに
  // 「調整後の労災年金＋障害年金の合計が、調整前の労災年金の額を下回らな
  // い」という下限保護がある。障害手当金（一時金）は労災の障害（補償）一
  // 時金（8〜14級）と同様に一時金のため、この調整の対象外（簡略化）。

  var els = {
    pensionType: document.getElementById("shougai-pensionType"),
    grade: document.getElementById("shougai-grade"),
    kouseiYears: document.getElementById("shougai-kouseiYears"),
    kouseiYearsOut: document.getElementById("shougai-kouseiYearsOut"),
    avgIncome: document.getElementById("shougai-avgIncome"),
    childCount: document.getElementById("shougai-childCount"),
    hasSpouse: document.getElementById("shougai-hasSpouse"),
    spouseAge: document.getElementById("shougai-spouseAge"),
    rousaiMode: document.getElementById("shougai-rousaiMode"),
    rousaiFields: document.getElementById("shougai-rousaiFields"),
    rousaiAmount: document.getElementById("shougai-rousaiAmount"),
    is20mae: document.getElementById("shougai-is20mae"),
    is20maeField: document.getElementById("shougai-is20mae-field"),
    zennenShotoku: document.getElementById("shougai-zennenShotoku"),
    fuyouRoujin: document.getElementById("shougai-fuyouRoujin"),
    fuyouTokutei: document.getElementById("shougai-fuyouTokutei"),
    fuyouSonota: document.getElementById("shougai-fuyouSonota"),
    incomeLimitFields: document.getElementById("shougai-incomeLimit-fields"),
    verdict: document.getElementById("shougai-verdict"),
    verdictSub: document.getElementById("shougai-verdictSub"),
    notice: document.getElementById("shougai-notice"),
    teate: document.getElementById("shougai-result-teate"),
    yearly: document.getElementById("shougai-result-yearly"),
    monthly: document.getElementById("shougai-result-monthly"),
    kiso: document.getElementById("shougai-result-kiso"),
    kousei: document.getElementById("shougai-result-kousei"),
    kakyu: document.getElementById("shougai-result-kakyu"),
    cardTeate: document.getElementById("shougai-card-teate"),
    cardYearly: document.getElementById("shougai-card-yearly"),
    cardMonthly: document.getElementById("shougai-card-monthly"),
    cardKiso: document.getElementById("shougai-card-kiso"),
    cardKousei: document.getElementById("shougai-card-kousei"),
    cardKakyu: document.getElementById("shougai-card-kakyu"),
    breakdownBody: document.getElementById("shougai-breakdown-body"),
  };
  if (!els.grade || !els.avgIncome || !els.breakdownBody) return;

  var KISO_GRADE1_YEARLY = 1059125; // 障害基礎年金1級（令和8年度）
  var KISO_GRADE2_YEARLY = 847300; // 障害基礎年金2級（令和8年度、老齢基礎年金の満額と同額）
  var CHILD_ADD_FIRST_SECOND = 243800; // 子の加算（1人目・2人目、1人あたり／令和8年度）
  var CHILD_ADD_THIRD_PLUS = 81300; // 子の加算（3人目以降、1人あたり／令和8年度）
  var KOSEI_RATE = 5.481 / 1000; // 報酬比例部分の乗率（2003年4月以降・総報酬制）
  var MIN_GUARANTEED_MONTHS = 300; // 「300月みなし」
  var GRADE3_MIN_YEARLY = 635500; // 障害厚生年金3級の最低保障（令和8年度）
  var TEATE_MIN = 1271000; // 障害手当金の最低保障（報酬比例部分の2倍相当、令和8年度）
  var SPOUSE_ADDITION_YEARLY = 243800; // 配偶者加給年金額（令和8年度、特別加算なし）
  var SPOUSE_MAX_AGE = 65; // 65歳未満が対象
  var INCOME_LIMIT_HALF = 3858000; // 20歳前傷病：2分の1停止の所得基準（令和8年10月以降）
  var INCOME_LIMIT_FULL = 4918000; // 20歳前傷病：全部停止の所得基準（令和8年10月以降）
  var DEPENDENT_ADD_ROUJIN = 480000; // 老人控除対象配偶者・老人扶養親族1人あたりの加算
  var DEPENDENT_ADD_TOKUTEI = 630000; // 特定扶養親族・19歳未満の控除対象扶養親族1人あたりの加算
  var DEPENDENT_ADD_SONOTA = 380000; // その他の扶養親族1人あたりの加算（一般区分）
  var ROUSAI_RATIO_BOTH = 0.73; // 障害基礎年金＋障害厚生年金と併給時の労災調整率
  var ROUSAI_RATIO_KOUSEI_ONLY = 0.83; // 障害厚生年金のみと併給時の労災調整率
  var ROUSAI_RATIO_KISO_ONLY = 0.88; // 障害基礎年金のみと併給時の労災調整率

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function calc(pensionType, grade, kouseiYears, avgIncomeYen, childCount, hasSpouse, spouseAge, is20mae, zennenShotokuYen, fuyouRoujin, fuyouTokutei, fuyouSonota, rousaiReceiving, rousaiAmountYen) {
    var isKousei = pensionType === "kousei";
    var isTeate = grade === "teate";
    var kouseiMonths = isKousei ? kouseiYears * 12 : 0;

    var hoshuHireiBubun = 0;
    if (isKousei && kouseiMonths > 0) {
      var guaranteedMonths = Math.max(kouseiMonths, MIN_GUARANTEED_MONTHS);
      var avgMonthlyRemuneration = avgIncomeYen / 12;
      hoshuHireiBubun = avgMonthlyRemuneration * KOSEI_RATE * guaranteedMonths;
    }

    if (isTeate) {
      var teateAmount = hoshuHireiBubun > 0 ? Math.max(hoshuHireiBubun * 2, TEATE_MIN) : 0;
      return {
        isTeate: true,
        teateAmount: teateAmount,
        kiso: 0,
        childAddition: 0,
        kousei: 0,
        kakyu: 0,
        total: teateAmount,
        ineligibleGrade3Kokumin: false,
        ineligibleTeateKokumin: !isKousei,
        rousaiApplicable: false,
      };
    }

    var kisoBase = 0;
    if (grade === "1") kisoBase = KISO_GRADE1_YEARLY;
    else if (grade === "2") kisoBase = KISO_GRADE2_YEARLY;
    // 3級には障害基礎年金が存在しない。

    var childAddition = 0;
    if (kisoBase > 0 && childCount > 0) {
      childAddition += Math.min(childCount, 2) * CHILD_ADD_FIRST_SECOND;
      if (childCount > 2) childAddition += (childCount - 2) * CHILD_ADD_THIRD_PLUS;
    }
    var kisoFull = kisoBase > 0 ? kisoBase + childAddition : 0;
    var dependentAdd =
      fuyouRoujin * DEPENDENT_ADD_ROUJIN + fuyouTokutei * DEPENDENT_ADD_TOKUTEI + fuyouSonota * DEPENDENT_ADD_SONOTA;
    var limitFull = INCOME_LIMIT_FULL + dependentAdd;
    var limitHalf = INCOME_LIMIT_HALF + dependentAdd;
    var incomeStop = "none";
    var incomeStoppedAmount = 0;
    var stopFactor = 1;
    if (kisoFull > 0 && is20mae && !isKousei) {
      if (zennenShotokuYen > limitFull) {
        incomeStop = "full";
        stopFactor = 0;
      } else if (zennenShotokuYen > limitHalf) {
        incomeStop = "half";
        stopFactor = 0.5;
      }
    }
    var kiso = kisoFull * stopFactor;
    childAddition = childAddition * stopFactor;
    incomeStoppedAmount = kisoFull - kiso;

    var kousei = 0;
    if (hoshuHireiBubun > 0) {
      if (grade === "1") kousei = hoshuHireiBubun * 1.25;
      else if (grade === "2") kousei = hoshuHireiBubun;
      else if (grade === "3") kousei = Math.max(hoshuHireiBubun, GRADE3_MIN_YEARLY);
    }

    var spouseEligible =
      isKousei &&
      (grade === "1" || grade === "2") &&
      kousei > 0 &&
      hasSpouse === "yes" &&
      spouseAge < SPOUSE_MAX_AGE;
    var kakyu = spouseEligible ? SPOUSE_ADDITION_YEARLY : 0;

    var ineligibleGrade3Kokumin = !isKousei && grade === "3";
    var total = kiso + kousei + kakyu;

    var rousaiApplicable = rousaiReceiving && total > 0;
    var rousaiRatio = 0;
    var rousaiAmountAdjusted = 0;
    var rousaiFloorApplied = false;
    if (rousaiApplicable) {
      if (kiso > 0 && kousei > 0) rousaiRatio = ROUSAI_RATIO_BOTH;
      else if (kousei > 0) rousaiRatio = ROUSAI_RATIO_KOUSEI_ONLY;
      else rousaiRatio = ROUSAI_RATIO_KISO_ONLY;
      rousaiAmountAdjusted = Math.floor(rousaiAmountYen * rousaiRatio);
      // 下限保護：調整後の労災年金＋障害年金の合計が、調整前の労災年金の額を下回らないようにする。
      var floorNeeded = rousaiAmountYen - total;
      if (rousaiAmountAdjusted < floorNeeded) {
        rousaiAmountAdjusted = Math.min(rousaiAmountYen, Math.max(0, floorNeeded));
        rousaiFloorApplied = true;
      }
    }

    return {
      isTeate: false,
      teateAmount: 0,
      kiso: kiso,
      kisoFull: kisoFull,
      childAddition: childAddition,
      kousei: kousei,
      kakyu: kakyu,
      total: total,
      ineligibleGrade3Kokumin: ineligibleGrade3Kokumin,
      ineligibleTeateKokumin: false,
      incomeStop: incomeStop,
      incomeStoppedAmount: incomeStoppedAmount,
      dependentAdd: dependentAdd,
      limitFull: limitFull,
      limitHalf: limitHalf,
      rousaiApplicable: rousaiApplicable,
      rousaiRatio: rousaiRatio,
      rousaiAmountOriginal: rousaiAmountYen,
      rousaiAmountAdjusted: rousaiAmountAdjusted,
      rousaiFloorApplied: rousaiFloorApplied,
      householdTotal: total + rousaiAmountAdjusted,
    };
  }

  var chart = null;

  function render() {
    var pensionType = els.pensionType && els.pensionType.value === "kokumin" ? "kokumin" : "kousei";
    var gradeOptions = ["1", "2", "3", "teate"];
    var grade = gradeOptions.indexOf(els.grade.value) !== -1 ? els.grade.value : "2";
    var isTeateGrade = grade === "teate";
    var kouseiYears = Math.min(50, clampNonNegative(els.kouseiYears ? els.kouseiYears.value : 0));
    var avgIncome = clampNonNegative(els.avgIncome.value) * 10000;
    var childCount = Math.min(5, clampNonNegative(els.childCount ? els.childCount.value : 0));
    var hasSpouse = els.hasSpouse && els.hasSpouse.value === "yes" ? "yes" : "none";
    var spouseAge = clampNonNegative(els.spouseAge ? els.spouseAge.value : 0);
    var is20maeAvailable = pensionType === "kokumin" && (grade === "1" || grade === "2");
    var is20mae = is20maeAvailable && els.is20mae && els.is20mae.value === "yes";
    var zennenShotoku = clampNonNegative(els.zennenShotoku ? els.zennenShotoku.value : 0) * 10000;
    var fuyouRoujin = Math.min(5, clampNonNegative(els.fuyouRoujin ? els.fuyouRoujin.value : 0));
    var fuyouTokutei = Math.min(5, clampNonNegative(els.fuyouTokutei ? els.fuyouTokutei.value : 0));
    var fuyouSonota = Math.min(5, clampNonNegative(els.fuyouSonota ? els.fuyouSonota.value : 0));
    var rousaiReceiving = !isTeateGrade && els.rousaiMode && els.rousaiMode.value === "received";
    var rousaiAmount = clampNonNegative(els.rousaiAmount ? els.rousaiAmount.value : 0) * 10000;

    if (els.kouseiYearsOut) els.kouseiYearsOut.textContent = kouseiYears + " 年";
    if (els.kouseiYears) els.kouseiYears.disabled = pensionType === "kokumin";
    if (els.childCount) els.childCount.disabled = isTeateGrade;
    if (els.hasSpouse) els.hasSpouse.disabled = isTeateGrade;
    if (els.spouseAge) els.spouseAge.disabled = isTeateGrade;
    if (els.is20maeField) els.is20maeField.style.display = is20maeAvailable ? "" : "none";
    if (els.is20mae) els.is20mae.disabled = !is20maeAvailable;
    if (els.incomeLimitFields) els.incomeLimitFields.style.display = is20mae ? "" : "none";
    if (els.zennenShotoku) els.zennenShotoku.disabled = !is20mae;
    if (els.fuyouRoujin) els.fuyouRoujin.disabled = !is20mae;
    if (els.fuyouTokutei) els.fuyouTokutei.disabled = !is20mae;
    if (els.fuyouSonota) els.fuyouSonota.disabled = !is20mae;
    if (els.rousaiMode) els.rousaiMode.disabled = isTeateGrade;
    if (els.rousaiFields) els.rousaiFields.style.display = rousaiReceiving ? "" : "none";
    if (els.rousaiAmount) els.rousaiAmount.disabled = !rousaiReceiving;

    var r = calc(
      pensionType,
      grade,
      kouseiYears,
      avgIncome,
      childCount,
      hasSpouse,
      spouseAge,
      is20mae,
      zennenShotoku,
      fuyouRoujin,
      fuyouTokutei,
      fuyouSonota,
      rousaiReceiving,
      rousaiAmount
    );
    var monthly = r.total / 12;

    if (els.cardTeate) els.cardTeate.hidden = !r.isTeate;
    [els.cardYearly, els.cardMonthly, els.cardKiso, els.cardKousei, els.cardKakyu].forEach(function (card) {
      if (card) card.hidden = r.isTeate;
    });

    if (r.isTeate) {
      if (els.teate) els.teate.textContent = yen(r.teateAmount);
    } else {
      if (els.yearly) els.yearly.textContent = yen(r.total) + " /年";
      if (els.monthly) els.monthly.textContent = yen(monthly) + " /月";
      if (els.kiso) els.kiso.textContent = yen(r.kiso) + " /年";
      if (els.kousei) els.kousei.textContent = yen(r.kousei) + " /年";
      if (els.kakyu) els.kakyu.textContent = yen(r.kakyu) + " /年";
    }

    if (els.notice) {
      if (r.ineligibleGrade3Kokumin) {
        els.notice.style.display = "block";
        els.notice.innerHTML =
          "<p><strong>3級には障害基礎年金が存在しません：</strong>障害厚生年金3級は厚生年金加入者のみの等級のため、初診日時点で国民年金のみに加入していた場合、3級相当の障害の状態では障害年金（障害基礎年金・障害厚生年金のいずれも）は支給されません。2級以上に該当する場合は障害基礎年金が支給されます。</p>" +
          (rousaiReceiving ? "<p>障害年金が0円のため、労災保険の障害（補償）年金との調整は発生せず、労災保険から調整前の全額が支給される見込みです。</p>" : "");
      } else if (r.ineligibleTeateKokumin) {
        els.notice.style.display = "block";
        els.notice.innerHTML =
          "<p><strong>国民年金のみでは障害手当金は対象外です：</strong>障害手当金は厚生年金に加入中の初診日であることが条件のため、初診日時点で国民年金のみに加入していた場合は支給されません。</p>";
      } else if (r.incomeStop === "full") {
        els.notice.style.display = "block";
        els.notice.innerHTML =
          "<p><strong>所得制限により障害基礎年金は全額支給停止の見込みです：</strong>20歳前の傷病による障害基礎年金は保険料を納めていない期間の障害のため、前年の所得が一定額を超えると支給停止になります。入力した前年所得・扶養親族の人数（区分別の加算額込み）では、全額停止の基準額（" + yen(r.limitFull) + "）を超えているため、障害基礎年金・子の加算は0円として試算しています。</p>" +
          (rousaiReceiving ? "<p>障害年金が0円のため、労災保険の障害（補償）年金との調整は発生せず、労災保険から調整前の全額が支給される見込みです。</p>" : "");
      } else if (r.incomeStop === "half") {
        els.notice.style.display = "block";
        els.notice.innerHTML =
          "<p><strong>所得制限により障害基礎年金は2分の1停止の見込みです：</strong>入力した前年所得・扶養親族の人数（区分別の加算額込み）では、2分の1停止の基準額（" + yen(r.limitHalf) + "）を超え、全額停止の基準額（" + yen(r.limitFull) + "）以下のため、障害基礎年金（子の加算含む）を2分の1（" + yen(r.incomeStoppedAmount) + "停止）として試算しています。</p>";
      } else {
        els.notice.style.display = "none";
        els.notice.innerHTML = "";
      }
    }

    if (els.verdict) {
      if (r.isTeate) {
        if (r.teateAmount > 0) {
          els.verdict.textContent = "障害手当金は一時金 " + yen(r.teateAmount) + " の見込みです";
        } else {
          els.verdict.textContent = "この条件では障害手当金の対象外です";
        }
      } else if (r.total > 0) {
        els.verdict.textContent = "障害年金は年額 " + yen(r.total) + "（月額 " + yen(monthly) + "）の見込みです";
      } else if (r.incomeStop === "full") {
        els.verdict.textContent = "所得制限により障害基礎年金は全額支給停止（0円）の見込みです";
      } else {
        els.verdict.textContent = "この条件では障害年金の対象外です";
      }
    }
    if (els.verdictSub) {
      if (r.isTeate) {
        if (r.teateAmount > 0) {
          els.verdictSub.textContent =
            "報酬比例部分相当額の2倍（最低保障" + yen(TEATE_MIN) + "）で試算した、1回限りの一時金です。年金のように毎年・毎月支給されるものではなく、子の加算・配偶者加給年金額もありません。実際の受給には、厚生年金加入中の初診日から5年以内に治った（症状が固定した）ことなどの要件を満たす必要があります。";
        } else {
          els.verdictSub.textContent =
            "障害手当金は厚生年金に加入中の初診日であることが条件のため、初診日時点で国民年金のみに加入していた場合の試算結果は0円です。";
        }
      } else if (r.total > 0) {
        var parts = [];
        if (r.kiso > 0) parts.push("障害基礎年金 " + yen(r.kiso));
        if (r.kousei > 0) parts.push("障害厚生年金 " + yen(r.kousei));
        if (r.kakyu > 0) parts.push("配偶者加給年金額 " + yen(r.kakyu));
        els.verdictSub.textContent =
          parts.join("＋") + "（いずれも年額）の合計です。実際の受給には保険料納付要件・障害認定日に一定の障害等級へ該当していることなどの要件を満たす必要があります。" +
          (r.incomeStop === "half" ? "20歳前傷病による所得制限で障害基礎年金が2分の1停止になる条件のため、停止後の金額です。" : "") +
          (r.rousaiApplicable
            ? "労災保険の障害（補償）年金（調整前" + yen(r.rousaiAmountOriginal) + "）も受け取るため、労災保険側が調整率" + r.rousaiRatio + "で減額され、世帯の合計受取額は" + yen(r.householdTotal) + "（年額）になります。"
            : "");
      } else if (r.incomeStop === "full") {
        els.verdictSub.textContent =
          "20歳前の傷病による障害基礎年金は、前年所得が所得制限の基準額を超えると全額支給停止になります。入力した条件では基準額を超えているため、試算結果は0円です。";
      } else {
        els.verdictSub.textContent =
          "障害基礎年金は1級・2級のみに存在し、障害厚生年金は初診日時点で厚生年金に加入していた場合のみ支給されます。いずれにも該当しない条件のため、試算結果は0円です。";
      }
    }

    if (r.isTeate) {
      els.breakdownBody.innerHTML =
        "<tr><td>障害手当金（報酬比例部分の2倍・300月みなし）</td><td>" + yen(r.teateAmount) + "（一時金）</td></tr>";
    } else {
      els.breakdownBody.innerHTML =
        "<tr><td>障害基礎年金（本人分）</td><td>" + yen(r.kiso > 0 ? r.kiso - r.childAddition : 0) + " /年</td></tr>" +
        "<tr><td>子の加算（" + childCount + "人）</td><td>" + yen(r.childAddition) + " /年</td></tr>" +
        (r.incomeStop !== "none"
          ? "<tr><td>所得制限による停止額（" + (r.incomeStop === "full" ? "全部" : "2分の1") + "）</td><td>-" + yen(r.incomeStoppedAmount) + " /年</td></tr>"
          : "") +
        "<tr><td>障害厚生年金（" + grade + "級・300月みなし）</td><td>" + yen(r.kousei) + " /年</td></tr>" +
        "<tr><td>配偶者加給年金額</td><td>" + yen(r.kakyu) + " /年</td></tr>" +
        "<tr><td><strong>合計（年額）</strong></td><td><strong>" + yen(r.total) + "</strong></td></tr>" +
        "<tr><td><strong>合計（月額）</strong></td><td><strong>" + yen(monthly) + "</strong></td></tr>" +
        (r.rousaiApplicable
          ? "<tr><td>労災保険の障害（補償）年金（調整前・年額）</td><td>" + yen(r.rousaiAmountOriginal) + "</td></tr>" +
            "<tr><td>労災保険との調整率</td><td>" + r.rousaiRatio + (r.rousaiFloorApplied ? "（下限保護により調整後）" : "") + "</td></tr>" +
            "<tr><td>労災保険の障害（補償）年金（調整後・年額）</td><td>" + yen(r.rousaiAmountAdjusted) + "</td></tr>" +
            "<tr><td><strong>世帯の合計受取額（年額・障害年金＋調整後の労災年金）</strong></td><td><strong>" + yen(r.householdTotal) + "</strong></td></tr>"
          : "");
    }

    var canvas = document.getElementById("shougai-breakdownChart");
    if (canvas && window.Chart) {
      var labels = [];
      var data = [];
      var colors = [];
      if (r.isTeate) {
        if (r.teateAmount > 0) { labels.push("障害手当金（一時金）"); data.push(Math.round(r.teateAmount)); colors.push("#c96b3f"); }
      } else {
        if (r.kiso - r.childAddition > 0) { labels.push("障害基礎年金（本人分）"); data.push(Math.round(r.kiso - r.childAddition)); colors.push("#0f5f4c"); }
        if (r.childAddition > 0) { labels.push("子の加算"); data.push(Math.round(r.childAddition)); colors.push("#7fa998"); }
        if (r.kousei > 0) { labels.push("障害厚生年金"); data.push(Math.round(r.kousei)); colors.push("#d98e04"); }
        if (r.kakyu > 0) { labels.push("配偶者加給年金額"); data.push(Math.round(r.kakyu)); colors.push("#c96b3f"); }
      }
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
      if (window.renderChartDataTable) window.renderChartDataTable("shougai-breakdownDataTable", chart);
    }
  }

  [els.kouseiYears, els.avgIncome, els.childCount, els.spouseAge, els.zennenShotoku, els.fuyouRoujin, els.fuyouTokutei, els.fuyouSonota, els.rousaiAmount].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  if (els.pensionType) els.pensionType.addEventListener("change", render);
  if (els.grade) els.grade.addEventListener("change", render);
  if (els.hasSpouse) els.hasSpouse.addEventListener("change", render);
  if (els.is20mae) els.is20mae.addEventListener("change", render);
  if (els.rousaiMode) els.rousaiMode.addEventListener("change", render);

  render();
})();

(function () {
  "use strict";

  // 確定申告 要否チェック（setsuzei-hub.html の4番目のタブ）。
  // 「年末調整のやり方ガイド」「確定申告のやり方ガイド」で解説している
  // 「会社員でも確定申告が必要になる主なケース」を、はい/いいえの
  // 8項目のチェックリストとして機械的に判定できるようにしたもの。
  // 既存の解説記事（プレーンテキスト）と違い、自分の状況を選ぶだけで
  // 「義務（申告納税）」「任意（還付申告）」「不要」のどれに当たるかを
  // その場で判定できる。他ツール（js/fukugyo-20man.js等）のような
  // 金額の複利計算は行わず、条件マッチのみの軽量な判定ロジック。

  var els = {
    verdict: document.getElementById("kakutei-verdict"),
    verdictSub: document.getElementById("kakutei-verdictSub"),
    noticeBox: document.getElementById("kakutei-noticeBox"),
    mandatoryCount: document.getElementById("kakutei-result-mandatory-count"),
    optionalCount: document.getElementById("kakutei-result-optional-count"),
    breakdownBody: document.getElementById("kakutei-breakdown-body")
  };
  if (!els.verdict || !els.breakdownBody) return;

  // severity: "mandatory" = 該当すると原則確定申告が必須（申告納税）。
  //           "optional"  = 確定申告をしなくても罰則はないが、申告すれば
  //                         還付・軽減を受けられる（還付申告）。
  var CONDITIONS = [
    {
      id: "kk-twoJobs",
      label: "給与を2か所以上から受けている（すべて年末調整済みではない）",
      severity: "mandatory",
      note: "年末調整で精算できるのは、原則としてメイン1社分の給与のみです。2か所以上から給与を受けている場合、他の給与分もあわせて自分で確定申告する必要があります。"
    },
    {
      id: "kk-noNenchosei",
      label: "年の途中で退職し、年末調整を受けていない（年内に再就職していない）",
      severity: "mandatory",
      note: "年末調整を受けていないと、毎月源泉徴収されてきた税額の精算が済んでいません。多くの場合は還付が受けられるため、確定申告をおすすめします。"
    },
    {
      id: "kk-sideIncome",
      label: "副業などの所得（雑所得・事業所得、給与以外）が年間20万円を超える",
      severity: "mandatory",
      note: "副業の「所得」（収入－必要経費）が年間20万円を超える場合、いわゆる「20万円ルール」の対象を超えるため所得税の確定申告が必要です。",
      link: { href: "setsuzei-hub.html?tool=fukugyo", label: "副業20万円ルール シミュレーターで確認する" }
    },
    {
      id: "kk-salaryOver2000",
      label: "給与収入が2,000万円を超える",
      severity: "mandatory",
      note: "給与収入が2,000万円を超える場合、他の条件にかかわらず年末調整の対象外となり、確定申告が必要です。"
    },
    {
      id: "kk-iryouhi",
      label: "医療費控除（またはセルフメディケーション税制）を受けたい",
      severity: "optional",
      note: "医療費控除は年末調整では受けられない控除のため、適用を受けるには確定申告（還付申告）が必要です。",
      link: { href: "setsuzei-hub.html?tool=iryouhi", label: "医療費控除シミュレーターで確認する" }
    },
    {
      id: "kk-jutaku",
      label: "住宅ローン控除を初めて受ける（1年目）",
      severity: "optional",
      note: "住宅ローン控除は初年度のみ確定申告が必要です（2年目以降は勤務先の年末調整で対応できます）。",
      link: { href: "jutaku-hub.html?tool=koujo", label: "住宅ローン控除シミュレーターで確認する" }
    },
    {
      id: "kk-furusato",
      label: "ふるさと納税でワンストップ特例を使っていない、または寄付先が6自治体以上ある",
      severity: "optional",
      note: "ワンストップ特例が使えない場合、控除を受けるには確定申告が必要です。",
      link: { href: "setsuzei-hub.html?tool=furusato", label: "ふるさと納税シミュレーターで確認する" }
    },
    {
      id: "kk-haitou",
      label: "上場株式等の配当を申告分離課税・総合課税で申告したい",
      severity: "optional",
      note: "確定申告不要制度（源泉徴収のみで完結）ではなく、申告分離課税・総合課税を選ぶ場合は確定申告が必要です。",
      link: { href: "haitou-hub.html?tool=kazei", label: "配当所得 課税方式シミュレーターで確認する" }
    }
  ];

  var SEVERITY_LABEL = {
    mandatory: "申告納税（義務）",
    optional: "還付申告（任意）"
  };

  function isYes(cond) {
    var el = document.getElementById(cond.id);
    return !!el && el.value === "yes";
  }

  function render() {
    var mandatoryMatched = [];
    var optionalMatched = [];

    CONDITIONS.forEach(function (cond) {
      if (!isYes(cond)) return;
      if (cond.severity === "mandatory") {
        mandatoryMatched.push(cond);
      } else {
        optionalMatched.push(cond);
      }
    });

    els.mandatoryCount.textContent = mandatoryMatched.length + " 件";
    els.optionalCount.textContent = optionalMatched.length + " 件";

    function joinLabels(list) {
      return list.map(function (c) { return c.label; }).join("、");
    }

    if (mandatoryMatched.length > 0) {
      els.verdict.textContent = "この条件では確定申告が必要です（義務）";
      els.verdictSub.textContent =
        "該当した項目：" + joinLabels(mandatoryMatched) +
        "。年末調整だけでは手続きが完結しないため、ご自身で確定申告する必要があります。";
    } else if (optionalMatched.length > 0) {
      els.verdict.textContent = "確定申告をした方が得になる可能性があります（任意・還付申告）";
      els.verdictSub.textContent =
        "該当した項目：" + joinLabels(optionalMatched) +
        "。確定申告をしなくても罰則はありませんが、申告すれば税金の還付・軽減を受けられる可能性があります。";
    } else {
      els.verdict.textContent = "年末調整だけで完了する可能性が高いです（確定申告は不要）";
      els.verdictSub.textContent =
        "上のチェック項目にどれも当てはまらなければ、通常は確定申告をする必要はありません。状況が変わったら、いつでもこのチェックを見直してください。";
    }

    // ワンストップ特例を使っている（＝furusato項目に「いいえ」＝未チェック）
    // つもりでも、他の理由で確定申告をすることになった場合は
    // ワンストップ特例の申請が自動的に無効になるため、見落とされがちな
    // この注意点だけは条件を満たしたときに強調表示する。
    var furusatoCond = CONDITIONS[6];
    var furusatoUsesOneStop = !isYes(furusatoCond);
    var otherReasonRequiresFiling =
      mandatoryMatched.length > 0 ||
      optionalMatched.some(function (c) { return c.id !== furusatoCond.id; });

    if (furusatoUsesOneStop && otherReasonRequiresFiling) {
      els.noticeBox.style.display = "block";
      els.noticeBox.innerHTML =
        "<p><strong>ふるさと納税のワンストップ特例にご注意：</strong>ワンストップ特例を申請済みでも、他の理由で確定申告をする場合はその申請が自動的に無効になります。ふるさと納税分の寄付金控除も、忘れずに確定申告書へ記載し直してください。</p>";
    } else {
      els.noticeBox.style.display = "none";
      els.noticeBox.innerHTML = "";
    }

    els.breakdownBody.innerHTML = CONDITIONS.map(function (cond) {
      var answeredYes = isYes(cond);
      var impact = answeredYes ? SEVERITY_LABEL[cond.severity] : "—";
      return (
        "<tr><td>" + cond.label + "</td><td>" + (answeredYes ? "はい" : "いいえ") +
        "</td><td>" + impact + "</td></tr>"
      );
    }).join("");
  }

  CONDITIONS.forEach(function (cond) {
    var el = document.getElementById(cond.id);
    if (el) el.addEventListener("change", render);
  });

  render();
})();

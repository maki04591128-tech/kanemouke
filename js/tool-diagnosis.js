(function () {
  "use strict";

  // トップページ「30秒でおすすめのツールを診断」機能。
  // 「9カテゴリ・80以上のリンクからどれを見ればいいか分からない」という
  // 初めての利用者向けに、2問（家族の状況／いちばん気になること）だけで
  // 具体的なツール1つに絞り込んで提示する。
  //
  // Q1（家族の状況）の回答は、js/profile-sync.js が使う共有プロフィール
  // （localStorageの kanemouke:profile:hasSpouse）にそのまま書き込む。
  // これにより、診断結果のツールを開いたときに「配偶者の有無」欄が
  // 自動で選択された状態になり、二度手間にならない。「扶養人数」は
  // 診断の選択肢だけでは人数まで特定できないため書き込まない
  // （誤った人数を自動入力すると税額試算がかえって不正確になるため）。

  var PROFILE_PREFIX = "kanemouke:profile:"; // js/profile-sync.js と同じキー体系

  var CONCERNS = {
    tsumitate: {
      href: "pages/nisa-hub.html?tool=tsumitate",
      title: "積立複利シミュレーター",
      desc: "毎月の積立額から将来の資産額をグラフで確認できます。まずはここから。"
    },
    ideco: {
      href: "pages/ideco-hub.html?tool=setsuzei",
      title: "iDeCo節税シミュレーター",
      desc: "掛金の所得控除でいくら節税できるかを試算します。"
    },
    setsuzei: {
      href: "pages/setsuzei-hub.html?tool=furusato",
      title: "ふるさと納税 控除上限額シミュレーター",
      desc: "自己負担2,000円で寄付できる上限額の目安がわかります。"
    },
    jutaku: {
      href: "pages/jutaku-hub.html?tool=koujo",
      title: "住宅ローン控除シミュレーター",
      desc: "借入額や住宅区分から、年ごとの控除額を試算します。"
    },
    kyouiku: {
      href: "pages/kyouiku-hub.html?tool=kyouiku",
      title: "教育資金シミュレーター",
      desc: "進学プランに応じて必要な教育資金の目安を試算します。"
    },
    haitou: {
      href: "pages/haitou-hub.html?tool=saitoushi",
      title: "配当再投資シミュレーター",
      desc: "配当を再投資した場合としない場合の資産推移を比較します。"
    },
    fire: {
      href: "pages/fire-hub.html?tool=fire",
      title: "FIRE達成シミュレーター",
      desc: "資産取り崩しを続けられる年数の目安を試算します。"
    },
    souzoku: {
      href: "pages/souzoku-hub.html?tool=souzokuzei",
      title: "相続税シミュレーター（概算）",
      desc: "遺産総額と家族構成から、相続税の目安を試算します。"
    },
    nenshu: {
      href: "pages/nenshu-hub.html?tool=tedori",
      title: "年収から手取り額シミュレーター",
      desc: "額面年収から社会保険料・税金を引いた手取りを試算します。"
    }
  };

  var STATUS_LABEL = {
    single: "独身",
    spouse: "配偶者あり",
    "spouse-child": "配偶者・子どもあり",
    skip: "答えない"
  };

  // Q1（家族の状況）× Q2（気になること）の組み合わせによっては、
  // メインのおすすめ1件だけでは拾いきれない関連ツールがある。
  // 該当する組み合わせだけ「あわせてチェック」として2件目を出す
  // （すべての組み合わせを網羅するのではなく、明確に関連性が高いものだけに絞る）。
  var RELATED = {
    "setsuzei|spouse-child": {
      href: "pages/setsuzei-hub.html?tool=iryouhi",
      title: "医療費控除シミュレーター",
      desc: "家族の医療費が年間10万円を超えていれば、あわせて確認しておきたい控除です。"
    },
    "setsuzei|spouse": {
      href: "pages/haiguusha-fuyou-koujo-guide.html",
      title: "配偶者控除・配偶者特別控除ガイド",
      desc: "配偶者の年収に応じて控除額がどう変わるかをまとめています。"
    },
    "kyouiku|spouse-child": {
      href: "pages/gakushihoken-nisa-simulator.html",
      title: "学資保険 vs NISA比較シミュレーター",
      desc: "教育資金を学資保険とNISAのどちらで準備すべきか比較できます。"
    },
    "ideco|spouse-child": {
      href: "pages/kyouiku-hub.html?tool=kyouiku",
      title: "教育資金シミュレーター",
      desc: "老後資金の準備とあわせて、お子さまの教育資金の目安も確認できます。"
    },
    "jutaku|spouse-child": {
      href: "pages/kyouiku-hub.html?tool=kyouiku",
      title: "教育資金シミュレーター",
      desc: "住宅ローンと教育資金、両方の負担感をあわせて確認しておくと安心です。"
    },
    "nenshu|spouse": {
      href: "pages/nenshu-hub.html?tool=kabe",
      title: "年収の壁シミュレーター",
      desc: "配偶者の働き方によって変わる「年収の壁」の目安を確認できます。"
    },
    "nenshu|spouse-child": {
      href: "pages/nenshu-hub.html?tool=kabe",
      title: "年収の壁シミュレーター",
      desc: "配偶者の働き方によって変わる「年収の壁」の目安を確認できます。"
    }
  };

  var step1 = document.getElementById("diagnosis-step-1");
  var step2 = document.getElementById("diagnosis-step-2");
  var result = document.getElementById("diagnosis-result");
  if (!step1 || !step2 || !result) return;

  var resultCard = document.getElementById("diagnosis-result-card");
  var resultTitle = document.getElementById("diagnosis-result-title");
  var resultDesc = document.getElementById("diagnosis-result-desc");
  var resultNote = document.getElementById("diagnosis-result-note");
  var backBtn = document.getElementById("diagnosis-back");
  var restartBtn = document.getElementById("diagnosis-restart");
  var related = document.getElementById("diagnosis-related");
  var relatedCard = document.getElementById("diagnosis-related-card");
  var relatedTitle = document.getElementById("diagnosis-related-title");
  var relatedDesc = document.getElementById("diagnosis-related-desc");

  var selectedStatus = null;

  function storageAvailable() {
    try {
      var testKey = "__kanemouke_diagnosis_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }
  var canUseStorage = storageAvailable();

  function saveHasSpouse(status) {
    if (!canUseStorage || status === "skip") return;
    var value = status === "spouse" || status === "spouse-child" ? "yes" : "no";
    try {
      window.localStorage.setItem(PROFILE_PREFIX + "hasSpouse", value);
    } catch (e) {
      // 保存に失敗しても診断結果の表示自体は続行する。
    }
  }

  function showStep2() {
    step1.hidden = true;
    step2.hidden = false;
    result.hidden = true;
  }

  function showResult(concernKey) {
    var info = CONCERNS[concernKey];
    if (!info) return;

    resultCard.href = info.href;
    resultTitle.textContent = info.title;
    resultDesc.textContent = info.desc;

    if (selectedStatus && selectedStatus !== "skip") {
      resultNote.textContent =
        "「" + STATUS_LABEL[selectedStatus] + "」の回答をもとに、ツールを開くと配偶者の有無欄が自動で入力されます（変更できます）。";
      resultNote.hidden = false;
    } else {
      resultNote.hidden = true;
      resultNote.textContent = "";
    }

    if (related && relatedCard && relatedTitle && relatedDesc) {
      var relatedInfo = selectedStatus ? RELATED[concernKey + "|" + selectedStatus] : null;
      if (relatedInfo) {
        relatedCard.href = relatedInfo.href;
        relatedTitle.textContent = relatedInfo.title;
        relatedDesc.textContent = relatedInfo.desc;
        related.hidden = false;
      } else {
        related.hidden = true;
      }
    }

    step1.hidden = true;
    step2.hidden = true;
    result.hidden = false;
  }

  function reset() {
    selectedStatus = null;
    result.hidden = true;
    step2.hidden = true;
    step1.hidden = false;
    if (related) related.hidden = true;
  }

  step1.addEventListener("click", function (e) {
    var btn = e.target.closest(".diagnosis-option");
    if (!btn) return;
    selectedStatus = btn.getAttribute("data-status");
    saveHasSpouse(selectedStatus);
    showStep2();
  });

  step2.addEventListener("click", function (e) {
    var btn = e.target.closest(".diagnosis-option");
    if (!btn) return;
    showResult(btn.getAttribute("data-concern"));
  });

  if (backBtn) {
    backBtn.addEventListener("click", function () {
      step2.hidden = true;
      step1.hidden = false;
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener("click", reset);
  }
})();

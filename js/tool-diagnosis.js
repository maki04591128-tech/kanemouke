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
  // 該当する組み合わせだけ「あわせてチェック」として2件目以降を出す
  // （すべての組み合わせを網羅するのではなく、明確に関連性が高いものだけに絞る）。
  // 各キーの値は配列（1〜2件）。表示件数を増やす場合も、情報過多になら
  // ないよう1件ずつ根拠を確認してから追加すること。
  var RELATED = {
    "setsuzei|spouse-child": [{
      href: "pages/setsuzei-hub.html?tool=iryouhi",
      title: "医療費控除シミュレーター",
      desc: "家族の医療費が年間10万円を超えていれば、あわせて確認しておきたい控除です。"
    }],
    "setsuzei|spouse": [{
      href: "pages/haiguusha-fuyou-koujo-guide.html",
      title: "配偶者控除・配偶者特別控除ガイド",
      desc: "配偶者の年収に応じて控除額がどう変わるかをまとめています。"
    }],
    "kyouiku|spouse-child": [{
      href: "pages/gakushihoken-nisa-simulator.html",
      title: "学資保険 vs NISA比較シミュレーター",
      desc: "教育資金を学資保険とNISAのどちらで準備すべきか比較できます。"
    }],
    // ideco（iDeCo）は、メインのおすすめ（iDeCo節税タブ）と同じ
    // ideco-hub.html内にある「iDeCovsNISA」タブ（毎月の投資額を
    // iDeCo優先・NISA優先・半分ずつで比較）が、iDeCoを始めようとする
    // 全ての家族構成に共通して関連性が高いため、家族の状況ごとの
    // 個別の関連ツールに加えて必ず1件（既存の関連ツールがある場合は
    // 2件目として）提示する。
    "ideco|spouse-child": [
      {
        href: "pages/kyouiku-hub.html?tool=kyouiku",
        title: "教育資金シミュレーター",
        desc: "老後資金の準備とあわせて、お子さまの教育資金の目安も確認できます。"
      },
      {
        href: "pages/ideco-hub.html?tool=yuusen",
        title: "iDeCovsNISA 優先順位シミュレーター",
        desc: "毎月の投資額を「iDeCo優先」「NISA優先」「半分ずつ」で配分した場合の節税額・資産評価額・引き出し制限の違いを比較できます。"
      }
    ],
    // jutaku（住宅ローン）は、メインのおすすめ（住宅ローン控除タブ）と同じ
    // jutaku-hub.html内にある「変動vs固定金利」タブ（5年ルール・125%ルールを
    // 踏まえた金利上昇時の返済額・未払利息の試算）が、住宅ローンを組む全ての
    // 家族構成に共通して関連性が高いため、家族の状況ごとの個別の関連ツールに
    // 加えて必ず1件（既存の関連ツールがある場合は2件目として）提示する。
    "jutaku|spouse-child": [
      {
        href: "pages/kyouiku-hub.html?tool=kyouiku",
        title: "教育資金シミュレーター",
        desc: "住宅ローンと教育資金、両方の負担感をあわせて確認しておくと安心です。"
      },
      {
        href: "pages/jutaku-hub.html?tool=kinri",
        title: "変動vs固定金利 金利上昇シミュレーター",
        desc: "住宅ローン控除とあわせて、変動金利が上昇した場合に返済額・未払利息がどう変わるかも確認しておくと安心です。"
      }
    ],
    "nenshu|spouse": [{
      href: "pages/nenshu-hub.html?tool=kabe",
      title: "年収の壁シミュレーター",
      desc: "配偶者の働き方によって変わる「年収の壁」の目安を確認できます。"
    }],
    "nenshu|spouse-child": [{
      href: "pages/nenshu-hub.html?tool=kabe",
      title: "年収の壁シミュレーター",
      desc: "配偶者の働き方によって変わる「年収の壁」の目安を確認できます。"
    }],
    "tsumitate|spouse-child": [{
      href: "pages/kyouiku-hub.html?tool=kyouiku",
      title: "教育資金シミュレーター",
      desc: "積立と並行して、お子さまの教育資金の目安もあわせて確認できます。"
    }],
    // haitou（配当・高配当株）は、メインのおすすめ（配当再投資タブ）と同じ
    // haitou-hub.html内にある「課税方式比較」タブ（確定申告不要・申告分離課税・
    // 総合課税のどれが有利かの比較）が、配当を受け取る全ての家族構成に共通して
    // 関連性が高いため、家族の状況ごとの個別の関連ツールに加えて必ず1件
    // （既存の関連ツールがある場合は2件目として）提示する。
    "haitou|spouse-child": [
      {
        href: "pages/kyouiku-hub.html?tool=kyouiku",
        title: "教育資金シミュレーター",
        desc: "配当再投資と並行して、お子さまの教育資金の目安もあわせて確認できます。"
      },
      {
        href: "pages/haitou-hub.html?tool=kazei",
        title: "配当課税方式比較シミュレーター",
        desc: "配当再投資とあわせて、確定申告不要・申告分離課税・総合課税のどれが有利かも確認しておくと安心です。"
      }
    ],
    // fire（FIRE・資産取り崩し）は、メインのおすすめ（FIRE達成タブ）と同じ
    // fire-hub.html内にある「資産取り崩し」タブ（定額・定率・定率＋下限額の
    // 3方式比較。FIRE達成タブの解説文自身が「達成後に取り崩しながら運用を
    // 続けた場合」に言及し、取り崩しタブの解説文も逆にFIRE達成タブを名指しで
    // 参照しており、2つのタブは互いに補完しあう関係にある）が、FIREを目指す
    // 全ての家族構成に共通して関連性が高いため、家族の状況ごとの個別の関連
    // ツールに加えて必ず1件（既存の関連ツールがある場合は2件目として）提示する。
    "fire|spouse-child": [
      {
        href: "pages/kyouiku-hub.html?tool=kyouiku",
        title: "教育資金シミュレーター",
        desc: "FIRE後の生活費とあわせて、お子さまの教育資金の目安も確認しておくと安心です。"
      },
      {
        href: "pages/fire-hub.html?tool=torikuzushi",
        title: "資産取り崩しシミュレーター（3方式比較）",
        desc: "FIRE達成後、定額・定率・定率＋下限額のどの取り崩し方式を選ぶかで資産の持続年数が変わります。あわせて確認しておくと安心です。"
      }
    ],
    // souzoku（相続・贈与）は、メインのおすすめ（相続税タブ）と同じ
    // souzoku-hub.html内にある「生前贈与vs相続」タブ（暦年贈与・相続時
    // 精算課税制度を含む）が全ての家族構成に共通して関連性が高いため、
    // 家族の状況ごとの個別の関連ツールに加えて必ず2件目として提示する。
    "souzoku|spouse-child": [
      {
        href: "pages/hoken-koujo-simulator.html",
        title: "生命保険料控除・地震保険料控除シミュレーター",
        desc: "相続・贈与の対策とあわせて、毎年の保険料控除も見直しておくと安心です。"
      },
      {
        href: "pages/souzoku-hub.html?tool=zouyo",
        title: "生前贈与 vs 相続 比較シミュレーター",
        desc: "お子さまへの生前贈与（暦年贈与・相続時精算課税制度）と、何もせず相続する場合とで、家族全体の負担額の差を比較できます。"
      }
    ],
    "souzoku|spouse": [
      {
        href: "pages/souzokuzei-guide.html",
        title: "相続税とは？基礎控除・税率・配偶者の税額軽減の仕組み 完全ガイド",
        desc: "配偶者には「1億6,000万円」までの相続税額軽減がありますが、二次相続で税負担が増えるケースもあるため、あわせて確認しておくと安心です。"
      },
      {
        href: "pages/souzoku-hub.html?tool=zouyo",
        title: "生前贈与 vs 相続 比較シミュレーター",
        desc: "生前贈与（暦年贈与・相続時精算課税制度）と、何もせず相続する場合とで、家族全体の負担額の差を比較できます。"
      }
    ],
    "souzoku|single": [{
      href: "pages/souzoku-hub.html?tool=zouyo",
      title: "生前贈与 vs 相続 比較シミュレーター",
      desc: "生前贈与（暦年贈与・相続時精算課税制度）と、何もせず相続する場合とで、家族全体の負担額の差を比較できます。"
    }],
    "souzoku|skip": [{
      href: "pages/souzoku-hub.html?tool=zouyo",
      title: "生前贈与 vs 相続 比較シミュレーター",
      desc: "生前贈与（暦年贈与・相続時精算課税制度）と、何もせず相続する場合とで、家族全体の負担額の差を比較できます。"
    }],
    "ideco|spouse": [
      {
        href: "pages/haiguusha-fuyou-koujo-guide.html",
        title: "配偶者控除・配偶者特別控除ガイド",
        desc: "配偶者の年収によってご自身が受けられる控除額が変わります。iDeCoの節税効果とあわせて確認しておくと安心です。"
      },
      {
        href: "pages/ideco-hub.html?tool=yuusen",
        title: "iDeCovsNISA 優先順位シミュレーター",
        desc: "毎月の投資額を「iDeCo優先」「NISA優先」「半分ずつ」で配分した場合の節税額・資産評価額・引き出し制限の違いを比較できます。"
      }
    ],
    "ideco|single": [{
      href: "pages/ideco-hub.html?tool=yuusen",
      title: "iDeCovsNISA 優先順位シミュレーター",
      desc: "毎月の投資額を「iDeCo優先」「NISA優先」「半分ずつ」で配分した場合の節税額・資産評価額・引き出し制限の違いを比較できます。"
    }],
    "ideco|skip": [{
      href: "pages/ideco-hub.html?tool=yuusen",
      title: "iDeCovsNISA 優先順位シミュレーター",
      desc: "毎月の投資額を「iDeCo優先」「NISA優先」「半分ずつ」で配分した場合の節税額・資産評価額・引き出し制限の違いを比較できます。"
    }],
    "jutaku|spouse": [
      {
        href: "pages/haiguusha-fuyou-koujo-guide.html",
        title: "配偶者控除・配偶者特別控除ガイド",
        desc: "住宅ローンは世帯収入で計画することが多く、配偶者の年収による控除額の変化もあわせて確認しておくと安心です。"
      },
      {
        href: "pages/jutaku-hub.html?tool=kinri",
        title: "変動vs固定金利 金利上昇シミュレーター",
        desc: "住宅ローン控除とあわせて、変動金利が上昇した場合に返済額・未払利息がどう変わるかも確認しておくと安心です。"
      }
    ],
    "jutaku|single": [{
      href: "pages/jutaku-hub.html?tool=kinri",
      title: "変動vs固定金利 金利上昇シミュレーター",
      desc: "住宅ローン控除とあわせて、変動金利が上昇した場合に返済額・未払利息がどう変わるかも確認しておくと安心です。"
    }],
    "jutaku|skip": [{
      href: "pages/jutaku-hub.html?tool=kinri",
      title: "変動vs固定金利 金利上昇シミュレーター",
      desc: "住宅ローン控除とあわせて、変動金利が上昇した場合に返済額・未払利息がどう変わるかも確認しておくと安心です。"
    }],
    "tsumitate|spouse": [{
      href: "pages/nisa-hub.html?tool=waku",
      title: "新NISA 生涯投資枠 使いきりシミュレーター",
      desc: "配偶者もNISA口座を持てば、非課税枠を夫婦2人分（合計3,600万円）活用できます。ご自身の枠の使用ペースもあわせて確認できます。"
    }],
    "haitou|spouse": [
      {
        href: "pages/nisa-hub.html?tool=waku",
        title: "新NISA 生涯投資枠 使いきりシミュレーター",
        desc: "配当再投資と並行して、配偶者もNISA口座を持てば非課税枠を夫婦2人分に広げられます。生涯投資枠の使用ペースもあわせて確認できます。"
      },
      {
        href: "pages/haitou-hub.html?tool=kazei",
        title: "配当課税方式比較シミュレーター",
        desc: "配当再投資とあわせて、確定申告不要・申告分離課税・総合課税のどれが有利かも確認しておくと安心です。"
      }
    ],
    "haitou|single": [{
      href: "pages/haitou-hub.html?tool=kazei",
      title: "配当課税方式比較シミュレーター",
      desc: "配当再投資とあわせて、確定申告不要・申告分離課税・総合課税のどれが有利かも確認しておくと安心です。"
    }],
    "haitou|skip": [{
      href: "pages/haitou-hub.html?tool=kazei",
      title: "配当課税方式比較シミュレーター",
      desc: "配当再投資とあわせて、確定申告不要・申告分離課税・総合課税のどれが有利かも確認しておくと安心です。"
    }],
    "fire|spouse": [
      {
        href: "pages/nisa-hub.html?tool=waku",
        title: "新NISA 生涯投資枠 使いきりシミュレーター",
        desc: "FIREを目指す資産形成では、配偶者もNISA口座を持つことで非課税枠を夫婦2人分に広げられます。生涯投資枠の使用ペースもあわせて確認できます。"
      },
      {
        href: "pages/fire-hub.html?tool=torikuzushi",
        title: "資産取り崩しシミュレーター（3方式比較）",
        desc: "FIRE達成後、定額・定率・定率＋下限額のどの取り崩し方式を選ぶかで資産の持続年数が変わります。あわせて確認しておくと安心です。"
      }
    ],
    "fire|single": [{
      href: "pages/fire-hub.html?tool=torikuzushi",
      title: "資産取り崩しシミュレーター（3方式比較）",
      desc: "FIRE達成後、定額・定率・定率＋下限額のどの取り崩し方式を選ぶかで資産の持続年数が変わります。あわせて確認しておくと安心です。"
    }],
    "fire|skip": [{
      href: "pages/fire-hub.html?tool=torikuzushi",
      title: "資産取り崩しシミュレーター（3方式比較）",
      desc: "FIRE達成後、定額・定率・定率＋下限額のどの取り崩し方式を選ぶかで資産の持続年数が変わります。あわせて確認しておくと安心です。"
    }]
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
  var relatedList = document.getElementById("diagnosis-related-list");

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

    if (related && relatedList) {
      var relatedItems = selectedStatus ? RELATED[concernKey + "|" + selectedStatus] : null;
      relatedList.innerHTML = "";
      if (relatedItems && relatedItems.length) {
        relatedItems.forEach(function (item) {
          var card = document.createElement("a");
          card.className = "tool-card diagnosis-related-card";
          card.href = item.href;
          var h3 = document.createElement("h3");
          h3.textContent = item.title;
          var p = document.createElement("p");
          p.textContent = item.desc;
          card.appendChild(h3);
          card.appendChild(p);
          relatedList.appendChild(card);
        });
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

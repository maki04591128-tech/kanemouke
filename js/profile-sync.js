(function () {
  "use strict";

  // 「年収」「配偶者控除の対象になる配偶者」「扶養親族の人数」は、性質の異なる
  // 複数のツール（ふるさと納税・医療費控除・住宅ローン控除・生命保険料控除・
  // 配当課税方式・年収から手取り額・副業20万円ルール・賞与手取り）で
  // 繰り返し同じ内容を尋ねている。1つのツールで入力した内容を
  // 「共有プロフィール」としてlocalStorageに保存し、他のツールを初めて開いた
  // ときに自動で反映することで、同じ情報の再入力をなくす。
  //
  // 対象フィールドはページ間で単位（円 / 万円）や上限（max属性）が異なるため、
  // 下記FIELDSで個別に正規化する。id命名パターンからの推測はしない
  // （例：fukugyo-salaryIncomeは名前に反しid単位ではなく万円入力のため、
  // パターン一致だけで単位を判定すると誤った値を復元してしまう）。
  //
  // 「配偶者の有無」を尋ねているだけの相続・贈与ツール（souzokuzei-hasSpouse等）
  // は、控除対象かどうかという別の質問のため対象に含めない。
  // 「年収の壁」シミュレーターのkabe-incomeは、扶養に入る側（パート等）の
  // 収入という別人の値を尋ねているため、同じ理由で対象外にしている。
  //
  // 「想定利回り（年率）」も、積立・一括投資・住宅ローン繰上返済vs投資・
  // iDeCo・退職金運用など複数のツールで同じ「投資信託等への長期投資で
  // 見込む年率リターン」という前提を尋ねている。これらはkind: "investYield"
  // として共有対象に含める。ただし同じ「利率」でも性質が異なるものは対象外：
  // 住宅ローン金利（roan-loanRate等、借入コストであり運用利回りではない）、
  // iDeCo・退職金の据置年金原資の運用利率（uketori-annuityRate等、上限3%
  // 程度の保守的な運用を前提にした別の値）、小規模企業共済の想定利率
  // （kyosai-rate、共済独自の予定利率）、学資保険の返戻率（gakushi-returnRate、
  // 年率ではなく満期時の払込総額に対する受取率）は、id命名パターンが似て
  // いても意味が異なるため含めない。
  //
  // 統合ハブページ（例：setsuzei-hub.htmlのふるさと納税タブと医療費控除タブ）
  // では、同じkindのフィールドが最初からDOMに同居している。ページ読み込み時の
  // 復元だけでは、読み込み後にタブを切り替えながら片方に入力しても、もう一方の
  // タブには反映されない（次回訪問時まで反映を待つことになる）。これを防ぐため、
  // 実際のユーザー操作（Event.isTrusted）による変更時のみ、同じページ内に存在する
  // 同kindの未確定フィールド（そのフィールド自身がまだ明示的に入力・復元されて
  // いないもの）へ即時に反映する。一度でも明示的な値を持ったフィールドは
  // 「確定」として扱い、以後は他フィールドからの反映で上書きしない。

  var STORAGE_PREFIX = "kanemouke:profile:";
  var FIELD_STORAGE_PREFIX = "kanemouke:input:"; // js/input-memory.js と同じキー体系

  var FIELDS = [
    { id: "furusato-salaryIncome", kind: "income", unit: 1 },
    { id: "iryouhi-salaryIncome", kind: "income", unit: 1 },
    { id: "koujo-salaryIncome", kind: "income", unit: 1 },
    { id: "hoken-salaryIncome", kind: "income", unit: 1 },
    { id: "kazei-income", kind: "income", unit: 10000 },
    { id: "tedori-income", kind: "income", unit: 10000 },
    { id: "fukugyo-salaryIncome", kind: "income", unit: 10000 },

    { id: "furusato-hasSpouse", kind: "hasSpouse" },
    { id: "iryouhi-hasSpouse", kind: "hasSpouse" },
    { id: "koujo-hasSpouse", kind: "hasSpouse" },
    { id: "hoken-hasSpouse", kind: "hasSpouse" },
    { id: "kazei-hasSpouse", kind: "hasSpouse" },
    { id: "tedori-hasSpouse", kind: "hasSpouse" },

    { id: "furusato-dependents", kind: "dependents" },
    { id: "iryouhi-dependents", kind: "dependents" },
    { id: "koujo-dependents", kind: "dependents" },
    { id: "hoken-dependents", kind: "dependents" },
    { id: "kazei-dependents", kind: "dependents" },
    { id: "tedori-dependents", kind: "dependents" },
    { id: "shoyo-dependents", kind: "dependents" },

    { id: "tsumitate-rate", kind: "investYield" },
    { id: "hitsuyou-rate", kind: "investYield" },
    { id: "waku-rate", kind: "investYield" },
    { id: "haibun-rate", kind: "investYield" },
    { id: "ikkatsu-annualRate", kind: "investYield" },
    { id: "bouraku-annualRate", kind: "investYield" },
    { id: "shintaku-grossRate", kind: "investYield" },
    { id: "kyouiku-rate", kind: "investYield" },
    { id: "gakushi-nisaRate", kind: "investYield" },
    { id: "roan-investRate", kind: "investYield" },
    { id: "kurioage-investRate", kind: "investYield" },
    { id: "setsuzei-rate", kind: "investYield" },
    { id: "yuusen-rate", kind: "investYield" },
    { id: "uketori-investRate", kind: "investYield" },
    { id: "taishokukin-investRate", kind: "investYield" }
  ];

  function storageAvailable() {
    try {
      var testKey = "__kanemouke_profile_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (!storageAvailable()) return;

  function dispatch(el, type) {
    var evt;
    try {
      evt = new Event(type, { bubbles: true });
    } catch (e) {
      evt = document.createEvent("Event");
      evt.initEvent(type, true, true);
    }
    el.dispatchEvent(evt);
  }

  function profileKey(kind) {
    return STORAGE_PREFIX + kind;
  }

  function readProfile(kind) {
    var v = window.localStorage.getItem(profileKey(kind));
    return v === null ? null : v;
  }

  function writeProfile(kind, value) {
    try {
      window.localStorage.setItem(profileKey(kind), value);
    } catch (e) {
      // 保存に失敗しても計算・表示は従来どおり継続する。
    }
  }

  // フィールドに実際に反映した値からの逆算（保存用の正規化）。
  function valueToProfile(field, el) {
    if (field.kind === "income") {
      var raw = parseFloat(el.value);
      if (isNaN(raw)) return null;
      return String(Math.round(raw * field.unit));
    }
    if (field.kind === "hasSpouse") {
      return el.value === "yes" ? "yes" : "no";
    }
    if (field.kind === "dependents") {
      var n = parseInt(el.value, 10);
      if (isNaN(n) || n < 0) return null;
      return String(n);
    }
    if (field.kind === "investYield") {
      var pct = parseFloat(el.value);
      if (isNaN(pct)) return null;
      return String(Math.round(pct * 10) / 10);
    }
    return null;
  }

  // プロフィールの正規化値から、そのフィールド固有の単位・上限に変換した表示値。
  function profileToFieldValue(field, el, profileValue) {
    if (field.kind === "income") {
      var yen = parseFloat(profileValue);
      if (isNaN(yen)) return null;
      var v = Math.round(yen / field.unit);
      var max = el.getAttribute("max");
      if (max !== null && v > Number(max)) v = Number(max);
      if (v < 0) v = 0;
      return String(v);
    }
    if (field.kind === "hasSpouse") {
      return profileValue === "yes" ? "yes" : "no";
    }
    if (field.kind === "dependents") {
      var n = parseInt(profileValue, 10);
      if (isNaN(n)) return null;
      var dmax = el.getAttribute("max");
      if (dmax !== null && n > Number(dmax)) n = Number(dmax);
      if (n < 0) n = 0;
      return String(n);
    }
    if (field.kind === "investYield") {
      var rate = parseFloat(profileValue);
      if (isNaN(rate)) return null;
      var rateMax = el.getAttribute("max");
      var rateMin = el.getAttribute("min");
      if (rateMax !== null && rate > Number(rateMax)) rate = Number(rateMax);
      if (rateMin !== null && rate < Number(rateMin)) rate = Number(rateMin);
      else if (rateMin === null && rate < 0) rate = 0;
      return String(rate);
    }
    return null;
  }

  var urlParams = new URLSearchParams(window.location.search);
  var appliedEls = [];
  var fieldEls = {}; // field.id -> el（このページに存在するフィールドのみ）

  // 複数のフィールドがmax属性の異なる同kindを共有する場合（例：想定利回りは
  // ページによって上限8〜12%まで様々）、このスクリプト自身が復元・伝播のために
  // 発火させたイベントで各フィールド固有のクランプ後の値を毎回プロフィールへ
  // 書き戻すと、最後に処理したフィールドの（より狭い上限で切り詰められた）
  // 値でプロフィールが上書きされ続け、本来の値が徐々に失われてしまう。これを
  // 防ぐため、このスクリプトが自分で発火させたイベント処理中はプロフィールへの
  // 書き戻しを行わない（真のユーザー操作や他スクリプト由来のイベントでの
  // 書き戻しは従来どおり行う）。
  var isInternalDispatch = false;
  function dispatchInternal(el, type) {
    isInternalDispatch = true;
    try {
      dispatch(el, type);
    } finally {
      isInternalDispatch = false;
    }
  }

  function markSynced(el) {
    if (el.classList.contains("profile-synced-field")) return;
    el.classList.add("profile-synced-field");
    var hint = document.createElement("p");
    hint.className = "field-hint sync-hint";
    hint.textContent = "🔄 他のツールの入力内容を自動反映（変更できます）";
    el.insertAdjacentElement("afterend", hint);
  }

  FIELDS.forEach(function (field) {
    var el = document.getElementById(field.id);
    if (!el) return; // このページには存在しないツールのフィールド
    fieldEls[field.id] = el;

    // このページで既に自分の値として保存済み、または共有URLで指定済みの
    // フィールドは、他ツールの値で上書きしない（js/input-memory.js・
    // js/share.jsの復元結果を尊重する）。以後、同ページ内の同kindフィールド
    // からの自動反映（propagateToSiblings）でも上書きしない「確定」状態にする。
    field.locked = urlParams.has(field.id) || window.localStorage.getItem(FIELD_STORAGE_PREFIX + field.id) !== null;

    if (!field.locked) {
      var profileValue = readProfile(field.kind);
      if (profileValue !== null) {
        if (field.kind === "hasSpouse" || el.tagName === "SELECT") {
          var targetValue = field.kind === "hasSpouse" ? (profileValue === "yes" ? "yes" : "no") : profileToFieldValue(field, el, profileValue);
          var hasOption = Array.prototype.some.call(el.options || [], function (opt) {
            return opt.value === targetValue;
          });
          if (hasOption) {
            el.value = targetValue;
            appliedEls.push(el);
          }
        } else {
          var fieldValue = profileToFieldValue(field, el, profileValue);
          if (fieldValue !== null) {
            el.value = fieldValue;
            appliedEls.push(el);
          }
        }
      }
    }
  });

  // 統合ハブページ内で、あるフィールドへの実入力を同ページ内の同kindの
  // 未確定フィールドへ即時反映する（例：setsuzei-hub.htmlのふるさと納税タブに
  // 入力した年収を、同じページの医療費控除タブへもタブ切り替え前に反映）。
  var isSyncing = false;
  function propagateToSiblings(sourceField, sourceEl) {
    if (isSyncing) return;
    isSyncing = true;
    try {
      var normalized = valueToProfile(sourceField, sourceEl);
      if (normalized === null) return;
      FIELDS.forEach(function (field) {
        if (field.kind !== sourceField.kind || field.id === sourceField.id || field.locked) return;
        var el = fieldEls[field.id];
        if (!el) return; // このページには存在しない
        var targetValue = field.kind === "hasSpouse" ? (normalized === "yes" ? "yes" : "no") : profileToFieldValue(field, el, normalized);
        if (targetValue === null) return;
        if (field.kind === "hasSpouse" || el.tagName === "SELECT") {
          var hasOption = Array.prototype.some.call(el.options || [], function (opt) {
            return opt.value === targetValue;
          });
          if (!hasOption) return;
        }
        if (el.value === targetValue) return;
        el.value = targetValue;
        dispatchInternal(el, "input");
        dispatchInternal(el, "change");
        markSynced(el);
      });
    } finally {
      isSyncing = false;
    }
  }

  FIELDS.forEach(function (field) {
    var el = fieldEls[field.id];
    if (!el) return;

    // 値の変更を共有プロフィールへ反映する（自分自身の入力操作・他スクリプト
    // による復元のいずれも対象。ただしこのスクリプト自身がdispatchInternalで
    // 発火させたイベントは対象外＝上記の理由でプロフィールを書き戻さない）。
    function handleChange(e) {
      if (!isInternalDispatch) {
        var normalized = valueToProfile(field, el);
        if (normalized !== null) writeProfile(field.kind, normalized);
      }
      // Event.isTrusted な実操作のときだけ「確定」扱いにして、同ページ内の
      // 他タブの未確定フィールドへ反映する（プログラム的な復元イベントでは
      // 確定扱いにしない＝あとから他フィールドの入力で上書きされ得る状態を保つ）。
      if (e && e.isTrusted) {
        field.locked = true;
        if (!isSyncing) propagateToSiblings(field, el);
      }
    }
    el.addEventListener("input", handleChange);
    el.addEventListener("change", handleChange);
  });

  appliedEls.forEach(function (el) {
    dispatchInternal(el, "input");
    dispatchInternal(el, "change");
    markSynced(el);
  });
})();

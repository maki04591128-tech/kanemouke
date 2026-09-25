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
    { id: "shoyo-dependents", kind: "dependents" }
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
    return null;
  }

  var urlParams = new URLSearchParams(window.location.search);
  var appliedEls = [];
  var fieldEls = {}; // field.id -> el（このページに存在するフィールドのみ）

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
        dispatch(el, "input");
        dispatch(el, "change");
        markSynced(el);
      });
    } finally {
      isSyncing = false;
    }
  }

  FIELDS.forEach(function (field) {
    var el = fieldEls[field.id];
    if (!el) return;

    // 値の変更を常に共有プロフィールへ反映する（自分自身の入力操作・
    // 他スクリプトによる復元のいずれも対象）。
    function handleChange(e) {
      var normalized = valueToProfile(field, el);
      if (normalized !== null) writeProfile(field.kind, normalized);
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
    dispatch(el, "input");
    dispatch(el, "change");
    markSynced(el);
  });
})();

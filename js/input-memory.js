(function () {
  "use strict";

  // 各ツールの入力値（数値入力・スライダー・プルダウン）をlocalStorageに
  // 保存し、次回同じ端末で同じツールを開いたときに自動で復元する補助
  // スクリプト。js/share.js（URLクエリパラメータからの復元、共有リンク用）
  // より後に読み込むことで、共有URL経由で開いた場合はURLの値を優先し、
  // URLに含まれないフィールドだけをlocalStorageから復元する。
  // 対象は`.panel input[id]`/`.panel select[id]`全件（統合ハブページの
  // 非表示タブ内フィールドも含む。全ツールのフィールドが読み込み時点で
  // DOMに存在するため、タブ切り替え後の遅延読み込みは考慮不要）。

  var STORAGE_PREFIX = "kanemouke:input:";

  function storageAvailable() {
    try {
      var testKey = "__kanemouke_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      // プライベートブラウズ等でlocalStorageが使えない環境では何もしない。
      return false;
    }
  }

  if (!storageAvailable()) return;

  var fields = Array.prototype.slice.call(document.querySelectorAll(".panel input[id], .panel select[id]"));
  if (fields.length === 0) return;

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

  // input.defaultValue はvalue属性に紐づき.valueへの代入では変化しないため、
  // 復元処理より後で参照してもHTML本来の初期値を安全に取得できる。
  // selectはdefaultValueを持たないため、defaultSelectedなoptionから求める。
  function trueDefaultValue(el) {
    if (el.tagName === "SELECT") {
      var defaultOpt = Array.prototype.filter.call(el.options, function (opt) {
        return opt.defaultSelected;
      })[0];
      if (defaultOpt) return defaultOpt.value;
      return el.options.length ? el.options[0].value : "";
    }
    return el.defaultValue;
  }

  var urlParams = new URLSearchParams(window.location.search);

  var restored = [];
  fields.forEach(function (el) {
    if (urlParams.has(el.id)) return; // 共有URL側の値をshare.jsが優先的に復元済み
    var saved = window.localStorage.getItem(STORAGE_PREFIX + el.id);
    if (saved === null) return;
    if (el.tagName === "SELECT") {
      var hasOption = Array.prototype.some.call(el.options, function (opt) {
        return opt.value === saved;
      });
      if (!hasOption) return;
    }
    el.value = saved;
    restored.push(el);
  });
  restored.forEach(function (el) {
    dispatch(el, "input");
    dispatch(el, "change");
  });

  fields.forEach(function (el) {
    el.addEventListener("input", function () {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + el.id, el.value);
      } catch (e) {
        // 保存に失敗しても計算・表示は従来どおり継続する。
      }
    });
  });

  var resetBtn = document.getElementById("reset-inputs-btn");
  if (!resetBtn) return;

  var feedback = document.getElementById("share-url-feedback");
  var feedbackTimer = null;

  resetBtn.addEventListener("click", function () {
    fields.forEach(function (el) {
      try {
        window.localStorage.removeItem(STORAGE_PREFIX + el.id);
      } catch (e) {
        // ignore
      }
      el.value = trueDefaultValue(el);
    });
    fields.forEach(function (el) {
      dispatch(el, "input");
      dispatch(el, "change");
    });

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (feedback) {
      feedback.textContent = "入力を初期値に戻しました。";
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(function () {
        feedback.textContent = "";
      }, 3000);
    }
  });
})();

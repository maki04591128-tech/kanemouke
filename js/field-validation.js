(function () {
  "use strict";

  // 数値入力欄（.field 内の input[type="number"]）に、入力値が空欄・
  // 数値以外・min/max属性の範囲外だった場合のインラインバリデーション
  // 表示（赤枠＋エラーメッセージ）を追加する補助スクリプト。
  // 各ツールの計算ロジック（render関数）は従来どおり
  // Math.max(0, Number(v) || 0) 等の防御的な丸めで計算を続けるため、
  // 本スクリプトは計算結果には一切介入せず、入力欄の見た目と
  // メッセージだけを担当する。

  function messageFor(input) {
    var raw = input.value.trim();
    if (raw === "") return "数値を入力してください。";

    var value = Number(raw);
    if (!isFinite(value)) return "半角数字で入力してください。";

    if (input.min !== "" && value < Number(input.min)) {
      return Number(input.min).toLocaleString("ja-JP") + " 以上の数値を入力してください。";
    }
    if (input.max !== "" && value > Number(input.max)) {
      return Number(input.max).toLocaleString("ja-JP") + " 以下の数値を入力してください。";
    }
    return "";
  }

  function attach(input) {
    var field = input.closest(".field");
    if (!field) return;

    var errorEl = document.createElement("p");
    errorEl.className = "field-error";
    errorEl.setAttribute("aria-live", "polite");
    input.insertAdjacentElement("afterend", errorEl);

    function update() {
      var message = messageFor(input);
      if (message) {
        field.classList.add("has-error");
        input.setAttribute("aria-invalid", "true");
        errorEl.textContent = message;
      } else {
        field.classList.remove("has-error");
        input.removeAttribute("aria-invalid");
        errorEl.textContent = "";
      }
    }

    input.addEventListener("input", update);
    input.addEventListener("blur", update);
    update();
  }

  function init() {
    var inputs = document.querySelectorAll('.field input[type="number"]');
    Array.prototype.forEach.call(inputs, attach);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

(function () {
  "use strict";

  // 金額・率などを入力する数値フィールド（.field input[type="number"]）に、
  // 入力中・入力後のインラインバリデーション表示を追加する。
  // 空欄・数値でない・min/max範囲外の値を入力した際に、フィールド直下へ
  // 具体的な許容範囲を示すメッセージを出し、枠線とラベルを警告色にする。
  // 計算ロジックが読む input.value 自体は一切変更せず、あくまで見た目の注意喚起のみ行う。

  function labelUnit(input) {
    if (!input.id) return "";
    var label = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
    if (!label) return "";
    var unitEl = label.querySelector(".unit");
    return unitEl ? unitEl.textContent.trim() : "";
  }

  function formatNum(n) {
    return n.toLocaleString("ja-JP");
  }

  function attach(input) {
    var field = input.closest(".field");
    var unit = labelUnit(input);
    var min = input.min !== "" ? Number(input.min) : null;
    var max = input.max !== "" ? Number(input.max) : null;
    if (min === null && max === null) return;

    var errorEl = document.createElement("p");
    errorEl.className = "field-error";
    errorEl.hidden = true;
    errorEl.setAttribute("aria-live", "polite");
    var errorId = (input.id || "field") + "-error";
    errorEl.id = errorId;
    input.insertAdjacentElement("afterend", errorEl);

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
      input.setAttribute("aria-invalid", "true");
      var describedBy = input.getAttribute("aria-describedby");
      if (!describedBy) {
        input.setAttribute("aria-describedby", errorId);
      } else if (describedBy.indexOf(errorId) === -1) {
        input.setAttribute("aria-describedby", describedBy + " " + errorId);
      }
      if (field) field.classList.add("has-error");
    }

    function clearError() {
      errorEl.hidden = true;
      input.removeAttribute("aria-invalid");
      if (field) field.classList.remove("has-error");
    }

    function validate() {
      var raw = input.value;
      if (raw.trim() === "") {
        showError("値を入力してください");
        return;
      }
      var num = Number(raw);
      if (!isFinite(num)) {
        showError("数値を入力してください");
        return;
      }
      if (min !== null && num < min) {
        showError(formatNum(min) + unit + "以上の値を入力してください");
        return;
      }
      if (max !== null && num > max) {
        showError(formatNum(max) + unit + "以下の値を入力してください");
        return;
      }
      clearError();
    }

    input.addEventListener("input", validate);
    input.addEventListener("blur", validate);
    validate();
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

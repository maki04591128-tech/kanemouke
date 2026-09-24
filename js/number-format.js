(function () {
  "use strict";

  // 金額を入力する数値フィールド（ラベル内の<span class="unit">が「円」または
  // 「万円」のもの）に、桁区切りと万円/億円換算を添える補助表示。
  // 「500000」のような桁数の多い入力はゼロの数を目視で数えにくく、
  // 一桁多く（少なく）入力しても気づきにくいため、入力するたびに
  // 「500,000円（約50万円）」のように読みやすい形を横に出す。
  // 計算ロジックが読む input.value 自体は一切変更しない。

  function unitFor(input) {
    if (!input.id) return null;
    var label = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
    if (!label) return null;
    var unitEl = label.querySelector(".unit");
    return unitEl ? unitEl.textContent.trim() : null;
  }

  function toManOku(yen) {
    var abs = Math.abs(yen);
    if (abs >= 100000000) {
      var oku = yen / 100000000;
      var okuText = Number.isInteger(oku)
        ? oku.toLocaleString("ja-JP")
        : oku.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
      return okuText + "億円";
    }
    var man = yen / 10000;
    var manText = Number.isInteger(man)
      ? man.toLocaleString("ja-JP")
      : man.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
    return manText + "万円";
  }

  function attach(input) {
    var unit = unitFor(input);
    if (unit !== "円" && unit !== "万円") return;

    var hint = document.createElement("p");
    hint.className = "number-value-hint";
    hint.hidden = true;
    input.insertAdjacentElement("afterend", hint);

    function update() {
      var raw = input.value;
      var num = Number(raw);
      if (raw === "" || !isFinite(num)) {
        hint.hidden = true;
        return;
      }

      if (unit === "円") {
        if (Math.abs(num) < 10000) {
          hint.hidden = true;
          return;
        }
        hint.hidden = false;
        hint.textContent = num.toLocaleString("ja-JP") + "円（約" + toManOku(num) + "）";
      } else {
        if (Math.abs(num) < 1000) {
          hint.hidden = true;
          return;
        }
        hint.hidden = false;
        var text = num.toLocaleString("ja-JP") + "万円";
        if (Math.abs(num) >= 10000) {
          text += "（約" + toManOku(num * 10000) + "）";
        }
        hint.textContent = text;
      }
    }

    input.addEventListener("input", update);
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

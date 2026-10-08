(function () {
  "use strict";

  // 遺留分計算シミュレーター。
  //
  // 個人の遺留分＝相続人全体の遺留分の割合（直系尊属のみが相続人の場合は
  // 遺産全体の3分の1、それ以外は2分の1）×その人の法定相続分、という
  // 2段階の計算を行う。法定相続分の判定ロジックは js/souzokuzei.js の
  // 相続税タブと同じ考え方（配偶者＋子／配偶者＋直系尊属／配偶者＋兄弟姉妹の
  // 3パターン）だが、兄弟姉妹（および代襲相続人の甥・姪）には遺留分が
  // ないため、兄弟姉妹パターンでは人数入力を求めず、配偶者の遺留分のみを
  // 試算する（法定相続分の構造上、兄弟姉妹がいる前提の配偶者の取り分＝3/4を
  // 固定値として使う）。

  var els = {
    baseAmount: document.getElementById("iryubun-baseAmount"),
    hasSpouse: document.getElementById("iryubun-hasSpouse"),
    heirPattern: document.getElementById("iryubun-heirPattern"),
    childCountRow: document.getElementById("iryubun-childCountRow"),
    childCount: document.getElementById("iryubun-childCount"),
    parentCountRow: document.getElementById("iryubun-parentCountRow"),
    parentCount: document.getElementById("iryubun-parentCount"),
    spouseActualRow: document.getElementById("iryubun-spouseActualRow"),
    spouseActual: document.getElementById("iryubun-spouseActual"),
    childActualRow: document.getElementById("iryubun-childActualRow"),
    childActualEach: document.getElementById("iryubun-childActualEach"),
    parentActualRow: document.getElementById("iryubun-parentActualRow"),
    parentActualEach: document.getElementById("iryubun-parentActualEach"),
    verdict: document.getElementById("iryubun-verdict"),
    verdictSub: document.getElementById("iryubun-verdictSub"),
    shortfallTotal: document.getElementById("iryubun-result-shortfall-total"),
    overallRatio: document.getElementById("iryubun-result-overall-ratio"),
    spouseReserve: document.getElementById("iryubun-result-spouse-reserve"),
    otherLabel: document.getElementById("iryubun-result-other-label"),
    otherReserve: document.getElementById("iryubun-result-other-reserve"),
    chartSection: document.getElementById("iryubun-chartSection"),
    chartDataDetails: document.getElementById("iryubun-chartDataDetails"),
    tableBody: document.getElementById("iryubun-breakdown-body"),
  };

  var chart = null;

  function manYen(manValue) {
    return Math.round(manValue).toLocaleString("ja-JP") + " 万円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  // 相続人構成から、配偶者・子（または直系尊属）それぞれの法定相続分を判定する。
  // 戻り値はいずれも0〜1の割合（法定相続分そのもの、遺留分の割合は含まない）。
  function legalShares(hasSpouse, pattern, childCount, parentCount) {
    if (pattern === "child") {
      if (childCount > 0) {
        return { spouseShare: hasSpouse ? 0.5 : 0, otherShareEach: hasSpouse ? 0.5 / childCount : 1 / childCount };
      }
      return { spouseShare: hasSpouse ? 1 : 0, otherShareEach: 0 };
    }
    if (pattern === "parent") {
      if (parentCount > 0) {
        return { spouseShare: hasSpouse ? 2 / 3 : 0, otherShareEach: hasSpouse ? 1 / 3 / parentCount : 1 / parentCount };
      }
      return { spouseShare: hasSpouse ? 1 : 0, otherShareEach: 0 };
    }
    // 兄弟姉妹（第3順位）：兄弟姉妹の人数にかかわらず遺留分は常に0のため、
    // 配偶者の法定相続分（兄弟姉妹がいる前提の3/4）だけを使う。
    return { spouseShare: hasSpouse ? 0.75 : 0, otherShareEach: 0 };
  }

  function updateFieldVisibility(pattern, hasSpouse) {
    els.childCountRow.style.display = pattern === "child" ? "" : "none";
    els.parentCountRow.style.display = pattern === "parent" ? "" : "none";
    els.childActualRow.style.display = pattern === "child" ? "" : "none";
    els.parentActualRow.style.display = pattern === "parent" ? "" : "none";
    els.spouseActualRow.style.display = hasSpouse ? "" : "none";
  }

  function render() {
    var pattern = els.heirPattern.value;
    var hasSpouse = els.hasSpouse.value === "yes";
    updateFieldVisibility(pattern, hasSpouse);

    var baseAmount = clampNonNegative(els.baseAmount.value);
    var childCount = pattern === "child" ? Math.max(0, Math.round(Number(els.childCount.value) || 0)) : 0;
    var parentCount = pattern === "parent" ? Math.max(0, Math.round(Number(els.parentCount.value) || 0)) : 0;
    var spouseActual = hasSpouse ? clampNonNegative(els.spouseActual.value) : 0;
    var childActualEach = pattern === "child" ? clampNonNegative(els.childActualEach.value) : 0;
    var parentActualEach = pattern === "parent" ? clampNonNegative(els.parentActualEach.value) : 0;

    var overallRatio = pattern === "parent" && !hasSpouse ? 1 / 3 : 1 / 2;
    var shares = legalShares(hasSpouse, pattern, childCount, parentCount);

    var spouseReserve = hasSpouse ? baseAmount * overallRatio * shares.spouseShare : 0;
    var otherReserveEach = baseAmount * overallRatio * shares.otherShareEach;
    var otherCount = pattern === "child" ? childCount : pattern === "parent" ? parentCount : 0;
    var otherReserveTotal = otherReserveEach * otherCount;
    var otherActualEach = pattern === "child" ? childActualEach : pattern === "parent" ? parentActualEach : 0;

    var spouseShortfall = Math.max(0, spouseReserve - spouseActual);
    var otherShortfallEach = Math.max(0, otherReserveEach - otherActualEach);
    var otherShortfallTotal = otherShortfallEach * otherCount;
    var shortfallTotal = spouseShortfall + otherShortfallTotal;

    var hasAnyReserve = spouseReserve > 0 || otherReserveTotal > 0;
    var otherNoun = pattern === "parent" ? "父母・祖父母" : "子";
    var otherLabelText = otherNoun + "の遺留分（1人あたり）";
    els.otherLabel.textContent = otherLabelText;

    els.overallRatio.textContent = overallRatio === 1 / 3 ? "3分の1" : "2分の1";
    els.spouseReserve.textContent = hasSpouse ? manYen(spouseReserve) : "-（配偶者なし）";
    els.otherReserve.textContent = otherCount > 0 ? manYen(otherReserveEach) : "-";
    els.shortfallTotal.textContent = manYen(shortfallTotal);

    if (!hasAnyReserve) {
      els.verdict.textContent = "この相続人構成には遺留分を持つ人がいません";
      els.verdictSub.textContent =
        "兄弟姉妹（またはその代襲相続人である甥・姪）には遺留分がなく、配偶者もいないため、遺留分を主張できる相続人がいません。遺言により全財産を自由に渡すことができます。";
    } else if (shortfallTotal > 0) {
      els.verdict.textContent = "遺留分侵害額請求ができる可能性があります（合計 " + manYen(shortfallTotal) + "）";
      els.verdictSub.textContent =
        "個人の遺留分の金額が、実際に受け取る（受け取った）財産額を上回っています。差額分は「遺留分侵害額請求」によって金銭の支払いを求められる可能性があります。実際の請求には1年の消滅時効があるため、早めに弁護士へご相談ください。";
    } else {
      els.verdict.textContent = "遺留分は侵害されていません";
      els.verdictSub.textContent =
        "入力した実際の取得額が、個人の遺留分の金額を下回っていないため、現時点では遺留分侵害額請求の対象になる差額はありません。";
    }

    var rows = [
      ["遺留分算定の基礎となる財産", manYen(baseAmount)],
      ["相続人全体の遺留分の割合", els.overallRatio.textContent],
    ];
    if (hasSpouse) {
      rows.push(["配偶者の法定相続分", (shares.spouseShare * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " %"]);
      rows.push(["配偶者の遺留分", manYen(spouseReserve)]);
      rows.push(["配偶者が実際に受け取る財産額", manYen(spouseActual)]);
      rows.push(["配偶者の遺留分侵害額", manYen(spouseShortfall)]);
    } else {
      rows.push(["配偶者", "なし"]);
    }
    if (pattern !== "sibling") {
      rows.push([otherNoun + "の法定相続分（1人あたり）", (shares.otherShareEach * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 }) + " %"]);
      rows.push([otherLabelText, otherCount > 0 ? manYen(otherReserveEach) : "-"]);
      rows.push([otherNoun + "の遺留分（合計）", otherCount > 0 ? manYen(otherReserveTotal) : "-"]);
      rows.push([otherNoun + "1人あたりが実際に受け取る財産額", manYen(otherActualEach)]);
      rows.push([otherNoun + "の遺留分侵害額（合計）", manYen(otherShortfallTotal)]);
    } else {
      rows.push(["兄弟姉妹の遺留分", "0円（遺留分なし）"]);
    }
    rows.push(["遺留分侵害額の合計", manYen(shortfallTotal)]);

    els.tableBody.innerHTML = rows
      .map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>";
      })
      .join("");

    var labels = [];
    var reserveData = [];
    var actualData = [];
    if (hasSpouse) {
      labels.push("配偶者");
      reserveData.push(spouseReserve);
      actualData.push(spouseActual);
    }
    if (pattern !== "sibling" && otherCount > 0) {
      labels.push(otherNoun);
      reserveData.push(otherReserveEach);
      actualData.push(otherActualEach);
    }

    if (labels.length === 0) {
      els.chartSection.hidden = true;
      els.chartDataDetails.hidden = true;
    } else {
      els.chartSection.hidden = false;
      els.chartDataDetails.hidden = false;
      var ctx = document.getElementById("iryubun-growthChart").getContext("2d");
      var data = {
        labels: labels,
        datasets: [
          { label: "個人の遺留分", data: reserveData, backgroundColor: "#0f5f4c" },
          { label: "実際に受け取る金額", data: actualData, backgroundColor: "#d98e04" },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              label: function (c) {
                return c.dataset.label + "：" + manYen(c.parsed.y);
              },
            },
          },
        },
        scales: {
          y: { title: { display: true, text: "金額（万円）" } },
        },
      };
      if (chart) {
        chart.data = data;
        chart.options = options;
        chart.update();
      } else {
        chart = new Chart(ctx, { type: "bar", data: data, options: options });
      }
      if (window.renderChartDataTable) window.renderChartDataTable("iryubun-growthDataTable", chart);
    }
  }

  [
    els.baseAmount,
    els.hasSpouse,
    els.heirPattern,
    els.childCount,
    els.parentCount,
    els.spouseActual,
    els.childActualEach,
    els.parentActualEach,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

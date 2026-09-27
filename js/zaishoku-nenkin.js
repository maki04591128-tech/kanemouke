(function () {
  "use strict";

  // 在職老齢年金シミュレーター。
  // 60歳以降も厚生年金に加入して働きながら老齢厚生年金を受け取る場合、
  // 「基本月額」（加給年金額を除いた老齢厚生年金の報酬比例部分の月額）と
  // 「総報酬月額相当額」（標準報酬月額＋直近1年間の標準賞与額の合計÷12）
  // の合計が「支給停止調整額」を超えると、超えた額の1/2が支給停止となる。
  // 令和4年4月の制度改正で60〜64歳・65歳以上の基準が統一され、現在は
  // 年齢を問わず同じ計算式・同じ基準額が適用される。
  // 支給停止調整額は毎年度、賃金変動に応じて改定され、令和7年度は51万円、
  // 令和8年度（本ツールの既定値）は65万円（日本年金機構
  // 「在職老齢年金制度が改正されました」ページで確認済み）。
  // 老齢基礎年金は在職老齢年金の対象外であり、この仕組みによる調整は
  // 老齢厚生年金（報酬比例部分）のみに適用される。

  var els = {
    kihongaku: document.getElementById("zaishoku-kihongaku"),
    hyoujun: document.getElementById("zaishoku-hyoujun"),
    shoyo: document.getElementById("zaishoku-shoyo"),
    threshold: document.getElementById("zaishoku-threshold"),
    verdict: document.getElementById("zaishoku-verdict"),
    verdictSub: document.getElementById("zaishoku-verdictSub"),
    soho: document.getElementById("zaishoku-result-soho"),
    teishi: document.getElementById("zaishoku-result-teishi"),
    jissai: document.getElementById("zaishoku-result-jissai"),
    breakdownBody: document.getElementById("zaishoku-breakdown-body"),
    tableBody: document.getElementById("zaishoku-table-body"),
  };
  if (!els.kihongaku || !els.hyoujun || !els.shoyo || !els.threshold) return;

  var TABLE_LEVELS = [200000, 300000, 400000, 500000, 600000, 650000, 700000, 800000, 900000, 1000000];

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function calcSoho(hyoujun, shoyo) {
    return Math.max(0, Number(hyoujun) || 0) + Math.max(0, Number(shoyo) || 0) / 12;
  }

  function calcTeishi(kihongaku, soho, threshold) {
    var goukei = kihongaku + soho;
    if (goukei <= threshold) return 0;
    return Math.min(kihongaku, (goukei - threshold) / 2);
  }

  function render() {
    var kihongaku = Math.max(0, Number(els.kihongaku.value) || 0);
    var hyoujunInput = Math.max(0, Number(els.hyoujun.value) || 0);
    var shoyoInput = Math.max(0, Number(els.shoyo.value) || 0);
    var threshold = Number(els.threshold.value) || 650000;

    var soho = calcSoho(hyoujunInput, shoyoInput);
    var goukei = kihongaku + soho;
    var teishi = calcTeishi(kihongaku, soho, threshold);
    var jissai = kihongaku - teishi;
    var thresholdLabel = threshold >= 650000 ? "65万円（令和8年度）" : "51万円（令和7年度以前）";

    if (els.soho) els.soho.textContent = yen(soho);
    if (els.teishi) els.teishi.textContent = yen(teishi);
    if (els.jissai) els.jissai.textContent = yen(jissai);

    if (els.verdict) {
      if (teishi <= 0) {
        els.verdict.textContent = "支給停止はなく、老齢厚生年金は全額支給されます";
      } else if (jissai <= 0) {
        els.verdict.textContent = "老齢厚生年金（報酬比例部分）は全額支給停止となります";
      } else {
        els.verdict.textContent = "老齢厚生年金は月額 " + yen(teishi) + " が支給停止となり、実際の支給額は月額 " + yen(jissai) + " です";
      }
    }
    if (els.verdictSub) {
      els.verdictSub.textContent =
        "基本月額" + yen(kihongaku) + "＋総報酬月額相当額" + yen(soho) + "＝合計" + yen(goukei) +
        "。支給停止調整額（基準額" + thresholdLabel + "）を" +
        (goukei <= threshold ? "超えていないため、支給停止は発生しません。" : "超えた額の1/2が支給停止となります。") +
        "（老齢基礎年金は在職老齢年金の対象外のため、この調整に関わらず全額支給されます）";
    }

    if (els.breakdownBody) {
      els.breakdownBody.innerHTML =
        "<tr><td>基本月額（老齢厚生年金の報酬比例部分。加給年金額を除く）</td><td>" + yen(kihongaku) + "</td></tr>" +
        "<tr><td>標準報酬月額</td><td>" + yen(hyoujunInput) + "</td></tr>" +
        "<tr><td>直近1年間の標準賞与額の合計 ÷ 12</td><td>" + yen(shoyoInput / 12) + "</td></tr>" +
        "<tr><td>総報酬月額相当額</td><td>" + yen(soho) + "</td></tr>" +
        "<tr><td>基本月額＋総報酬月額相当額</td><td>" + yen(goukei) + "</td></tr>" +
        "<tr><td>適用する支給停止調整額（基準額）</td><td>" + thresholdLabel + "</td></tr>" +
        "<tr><td>支給停止額</td><td>" + yen(teishi) + "</td></tr>" +
        "<tr><td><strong>実際の年金支給月額（老齢厚生年金）</strong></td><td><strong>" + yen(jissai) + "</strong></td></tr>";
    }

    if (els.tableBody) {
      var closest = TABLE_LEVELS.reduce(function (best, v) {
        return Math.abs(v - soho) < Math.abs(best - soho) ? v : best;
      }, TABLE_LEVELS[0]);
      var rows = TABLE_LEVELS.map(function (v) {
        var t = calcTeishi(kihongaku, v, threshold);
        var j = kihongaku - t;
        var isCurrent = v === closest;
        return (
          "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + yen(v) + "</td>" +
          "<td>" + yen(kihongaku + v) + "</td>" +
          "<td>" + (t > 0 ? yen(t) : "支給停止なし") + "</td>" +
          "<td>" + yen(j) + "</td>" +
          "</tr>"
        );
      });
      els.tableBody.innerHTML = rows.join("");
    }

    var canvas = document.getElementById("zaishoku-growthChart");
    if (canvas && window.Chart) {
      var labels = TABLE_LEVELS.map(function (v) { return (v / 10000) + "万円"; });
      var values = TABLE_LEVELS.map(function (v) {
        var t = calcTeishi(kihongaku, v, threshold);
        var j = kihongaku - t;
        return v + j;
      });
      var data = {
        labels: labels,
        datasets: [
          {
            label: "総報酬月額相当額＋実際の年金支給月額",
            data: values,
            backgroundColor: "#0f5f4c",
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "総報酬月額相当額" } },
          y: {
            title: { display: true, text: "総報酬月額相当額＋年金の合計（円）" },
            ticks: { callback: function (v) { return v.toLocaleString("ja-JP") + " 円"; } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return yen(ctx.parsed.y);
              },
            },
          },
        },
      };

      if (chart) {
        chart.data = data;
        chart.options = options;
        chart.update();
      } else {
        chart = new Chart(canvas.getContext("2d"), { type: "bar", data: data, options: options });
      }
      if (window.renderChartDataTable) window.renderChartDataTable("zaishoku-growthDataTable", chart);
    }
  }

  [els.kihongaku, els.hyoujun, els.shoyo].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  els.threshold.addEventListener("change", render);

  render();
})();

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
  //
  // 高年齢雇用継続給付（60歳以上65歳未満向け）を同時に受給している場合、
  // 上記の在職支給停止に加えて、高年齢雇用継続給付の給付額に応じた
  // 追加の年金支給停止が行われる（日本年金機構「知っておきたい厚生年金・
  // 退職等年金給付」記載の調整額計算式より）。調整額（月額）は
  // 「高年齢雇用継続給付の支給率（低下率に応じて0〜上限10%／15%）×
  // 標準報酬月額×2/5」で算出でき、これは上限が標準報酬月額の4%
  // （令和7年4月以降に60歳到達等）・6%（経過措置）となる計算式と
  // 数学的に同値（公式の省令定める率の式を代入して検証済み）。本ツールは
  // 標準報酬月額を高年齢雇用継続給付の算定上の賃金とみなして簡略計算する
  // （標準報酬月額と実際の賃金が異なる場合は目安）。高年齢雇用継続給付
  // 自体の主な受給要件である「60歳到達時点で被保険者であった期間が
  // 通算5年以上」（js/kourei-koyou.js と同じ判定）も反映し、5年未満の
  // 場合は年金への追加調整を発生させない。

  var els = {
    kihongaku: document.getElementById("zaishoku-kihongaku"),
    hyoujun: document.getElementById("zaishoku-hyoujun"),
    shoyo: document.getElementById("zaishoku-shoyo"),
    threshold: document.getElementById("zaishoku-threshold"),
    koureiMode: document.getElementById("zaishoku-koureiMode"),
    koureiFields: document.getElementById("zaishoku-koureiFields"),
    koureiWagebase: document.getElementById("zaishoku-kourei-wagebase"),
    koureiRule: document.getElementById("zaishoku-kourei-rule"),
    koureiInsured: document.getElementById("zaishoku-kourei-insured"),
    tableNote: document.getElementById("zaishoku-table-note"),
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

  // 高年齢雇用継続給付の支給額計算（js/kourei-koyou.js と同じ厚生労働省の
  // 計算式・限度額。令和8年8月1日改定・令和9年7月31日まで有効の値）。
  var KOUREI_WAGEBASE_UPPER = 522000;
  var KOUREI_WAGEBASE_LOWER = 96090;
  var KOUREI_PAYMENT_LIMIT = 397369;
  var KOUREI_MIN_LIMIT = 2562;
  var KOUREI_NEW_FLAT_RATE = 0.10;
  var KOUREI_NEW_FLAT_BOUNDARY = 64;
  var KOUREI_OLD_FLAT_RATE = 0.15;
  var KOUREI_OLD_FLAT_BOUNDARY = 61;
  var KOUREI_PENSION_ADJUST_RATIO = 2 / 5; // 支給率に対する年金調整率の比率（新・旧ルール共通）

  function clampKoureiWageBase(n) {
    return Math.min(KOUREI_WAGEBASE_UPPER, Math.max(KOUREI_WAGEBASE_LOWER, Math.max(0, Number(n) || 0)));
  }

  function calcKoureiRawBenefit(wage, wageBase, isNewRule) {
    if (wageBase <= 0) return 0;
    var dropRate = (wage / wageBase) * 100;
    if (dropRate >= 75) return 0;
    if (isNewRule) {
      if (dropRate <= KOUREI_NEW_FLAT_BOUNDARY) return wage * KOUREI_NEW_FLAT_RATE;
      return (-64 / 110) * wage + (48 / 110) * wageBase;
    }
    if (dropRate <= KOUREI_OLD_FLAT_BOUNDARY) return wage * KOUREI_OLD_FLAT_RATE;
    return (-183 / 280) * wage + (137.25 / 280) * wageBase;
  }

  function calcKoureiBenefit(wage, wageBase, isNewRule) {
    var raw = Math.max(0, Math.floor(calcKoureiRawBenefit(wage, wageBase, isNewRule)));
    if (wage >= KOUREI_PAYMENT_LIMIT) {
      raw = 0;
    } else if (wage + raw > KOUREI_PAYMENT_LIMIT) {
      raw = Math.max(0, KOUREI_PAYMENT_LIMIT - wage);
    }
    if (raw <= KOUREI_MIN_LIMIT) raw = 0;
    return raw;
  }

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

    var koureiReceived = els.koureiMode && els.koureiMode.value === "received";
    if (els.koureiFields) els.koureiFields.style.display = koureiReceived ? "" : "none";
    var koureiInsuredOk = !els.koureiInsured || els.koureiInsured.value !== "under5";
    var koureiEligible = koureiReceived && koureiInsuredOk;

    var soho = calcSoho(hyoujunInput, shoyoInput);
    var goukei = kihongaku + soho;
    var teishi = calcTeishi(kihongaku, soho, threshold);
    var thresholdLabel = threshold >= 650000 ? "65万円（令和8年度）" : "51万円（令和7年度以前）";

    var koureiBenefit = 0;
    var koureiAdjust = 0;
    var koureiRuleLabel = "";
    if (koureiEligible) {
      var koureiWageBase = clampKoureiWageBase(els.koureiWagebase ? els.koureiWagebase.value : 0);
      var koureiIsNewRule = !els.koureiRule || els.koureiRule.value !== "old";
      koureiBenefit = calcKoureiBenefit(hyoujunInput, koureiWageBase, koureiIsNewRule);
      koureiAdjust = Math.floor(koureiBenefit * KOUREI_PENSION_ADJUST_RATIO);
      koureiRuleLabel = koureiIsNewRule
        ? "令和7年4月1日以降に60歳到達等（上限4%）"
        : "令和7年3月31日以前に60歳到達等・経過措置（上限6%）";
    }

    var totalTeishi = Math.min(kihongaku, teishi + koureiAdjust);
    var jissai = kihongaku - totalTeishi;

    if (els.soho) els.soho.textContent = yen(soho);
    if (els.teishi) els.teishi.textContent = yen(totalTeishi);
    if (els.jissai) els.jissai.textContent = yen(jissai);

    if (els.verdict) {
      if (totalTeishi <= 0) {
        els.verdict.textContent = "支給停止はなく、老齢厚生年金は全額支給されます";
      } else if (jissai <= 0) {
        els.verdict.textContent = "老齢厚生年金（報酬比例部分）は全額支給停止となります";
      } else {
        els.verdict.textContent = "老齢厚生年金は月額 " + yen(totalTeishi) + " が支給停止となり、実際の支給額は月額 " + yen(jissai) + " です";
      }
    }
    if (els.verdictSub) {
      els.verdictSub.textContent =
        "基本月額" + yen(kihongaku) + "＋総報酬月額相当額" + yen(soho) + "＝合計" + yen(goukei) +
        "。支給停止調整額（基準額" + thresholdLabel + "）を" +
        (goukei <= threshold ? "超えていないため、在職による支給停止は発生しません。" : "超えた額の1/2が在職による支給停止となります。") +
        (koureiReceived
          ? (koureiInsuredOk
              ? "高年齢雇用継続給付（支給見込み額" + yen(koureiBenefit) + "）を同時に受給しているため、さらに月額" + yen(koureiAdjust) + "の追加調整が加わります。"
              : "被保険者であった期間が5年未満の場合、高年齢雇用継続給付自体が原則受け取れないため、年金への追加調整は発生しません。")
          : "") +
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
        "<tr><td>在職による支給停止額</td><td>" + yen(teishi) + "</td></tr>" +
        (koureiReceived
          ? (koureiInsuredOk
              ? "<tr><td>高年齢雇用継続給付の支給見込み額（参考・" + koureiRuleLabel + "）</td><td>" + yen(koureiBenefit) + "</td></tr>" +
                "<tr><td>高年齢雇用継続給付受給による追加の支給停止額</td><td>" + yen(koureiAdjust) + "</td></tr>"
              : "<tr><td>高年齢雇用継続給付受給による追加の支給停止額</td><td>対象外（被保険者であった期間5年未満のため）</td></tr>")
          : "") +
        "<tr><td>支給停止額の合計</td><td>" + yen(totalTeishi) + "</td></tr>" +
        "<tr><td><strong>実際の年金支給月額（老齢厚生年金）</strong></td><td><strong>" + yen(jissai) + "</strong></td></tr>";
    }

    if (els.tableNote) {
      els.tableNote.hidden = !koureiReceived;
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
  if (els.koureiMode) els.koureiMode.addEventListener("change", render);
  if (els.koureiWagebase) {
    els.koureiWagebase.addEventListener("input", render);
    els.koureiWagebase.addEventListener("change", render);
  }
  if (els.koureiRule) els.koureiRule.addEventListener("change", render);
  if (els.koureiInsured) els.koureiInsured.addEventListener("change", render);

  render();
})();

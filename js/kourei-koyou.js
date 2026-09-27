(function () {
  "use strict";

  // 高年齢雇用継続給付シミュレーター。
  // 60歳到達等時点に比べて賃金が75%未満に低下した状態で働き続ける
  // 60歳以上65歳未満の一般被保険者に、雇用保険から支給される
  // 「高年齢雇用継続基本給付金」「高年齢再就職給付金」の支給見込み額を
  // 試算する（支給額の計算式自体は両給付金で共通）。
  //
  // 支給率は令和7年4月1日以降に60歳に到達等した方（新ルール／上限10%・
  // 64%以下）と、令和7年3月31日以前に60歳に到達等した方（経過措置／
  // 上限15%・61%以下）で異なる。厚生労働省パンフレット「高年齢雇用継続
  // 給付の内容及び支給申請手続について」（PL080801保05）に記載の
  // 原則計算式（低下率64%超75%未満：支給額＝-64/110×賃金＋48/110×
  // 賃金月額、旧ルールの61%超75%未満：支給額＝-183/280×賃金＋
  // 137.25/280×賃金月額）をそのまま用いて算定するため、0.5%刻みの
  // 早見表を用いる場合よりも連続的で正確な値が得られる。
  // 60歳到達時等賃金月額の上限額522,000円・下限額96,090円、支給限度額
  // 397,369円、最低限度額2,562円はいずれも令和8年8月1日改定・
  // 令和9年7月31日まで有効の値（毎年8月1日に「毎月勤労統計」の
  // 平均定期給与額の増減に応じて改定される）。

  var els = {
    wagebase: document.getElementById("kourei-wagebase"),
    wage: document.getElementById("kourei-wage"),
    rule: document.getElementById("kourei-rule"),
    insured: document.getElementById("kourei-insured"),
    verdict: document.getElementById("kourei-verdict"),
    verdictSub: document.getElementById("kourei-verdictSub"),
    benefit: document.getElementById("kourei-result-benefit"),
    droprate: document.getElementById("kourei-result-droprate"),
    total: document.getElementById("kourei-result-total"),
    breakdownBody: document.getElementById("kourei-breakdown-body"),
    tableBody: document.getElementById("kourei-table-body"),
  };
  if (!els.wagebase || !els.wage || !els.rule || !els.insured) return;

  var WAGEBASE_UPPER = 522000; // 令和8年8月1日改定（60歳到達時等賃金月額の上限額）
  var WAGEBASE_LOWER = 96090; // 令和8年8月1日改定（60歳到達時等賃金月額の下限額）
  var PAYMENT_LIMIT = 397369; // 令和8年8月1日改定（支給限度額）
  var MIN_LIMIT = 2562; // 令和8年8月1日改定（最低限度額。この額を超えない支給額は支給されない）
  var NEW_FLAT_RATE = 0.10; // 令和7年4月1日以降到達：低下率64%以下の支給率
  var NEW_FLAT_BOUNDARY = 64;
  var OLD_FLAT_RATE = 0.15; // 令和7年3月31日以前到達（経過措置）：低下率61%以下の支給率
  var OLD_FLAT_BOUNDARY = 61;

  var TABLE_PERCENTS = [100, 90, 80, 75, 74, 70, 65, 60, 55, 50, 45, 40];

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampWageBase(n) {
    return Math.min(WAGEBASE_UPPER, Math.max(WAGEBASE_LOWER, Math.max(0, Number(n) || 0)));
  }

  function calcRawBenefit(wage, wageBase, isNewRule) {
    if (wageBase <= 0) return 0;
    var dropRate = (wage / wageBase) * 100;
    if (dropRate >= 75) return 0;
    if (isNewRule) {
      if (dropRate <= NEW_FLAT_BOUNDARY) return wage * NEW_FLAT_RATE;
      return (-64 / 110) * wage + (48 / 110) * wageBase;
    }
    if (dropRate <= OLD_FLAT_BOUNDARY) return wage * OLD_FLAT_RATE;
    return (-183 / 280) * wage + (137.25 / 280) * wageBase;
  }

  function calcBenefit(wage, wageBase, isNewRule) {
    var raw = Math.max(0, Math.floor(calcRawBenefit(wage, wageBase, isNewRule)));
    if (wage >= PAYMENT_LIMIT) {
      raw = 0;
    } else if (wage + raw > PAYMENT_LIMIT) {
      raw = Math.max(0, PAYMENT_LIMIT - wage);
    }
    if (raw <= MIN_LIMIT) raw = 0;
    return raw;
  }

  function render() {
    var wagebaseInput = Math.max(0, Number(els.wagebase.value) || 0);
    var wage = Math.max(0, Number(els.wage.value) || 0);
    var isNewRule = els.rule.value !== "old";
    var insuredOk = els.insured.value !== "under5";

    var wageBase = clampWageBase(wagebaseInput);
    var dropRate = wageBase > 0 ? (wage / wageBase) * 100 : 0;
    var benefit = insuredOk ? calcBenefit(wage, wageBase, isNewRule) : 0;
    var total = wage + benefit;

    if (els.benefit) els.benefit.textContent = yen(benefit);
    if (els.droprate) els.droprate.textContent = wageBase > 0 ? dropRate.toFixed(2) + " %" : "-";
    if (els.total) els.total.textContent = yen(total);

    var ruleLabel = isNewRule
      ? "令和7年4月1日以降に60歳到達等（支給率上限10%・64%以下で上限適用）"
      : "令和7年3月31日以前に60歳到達等・経過措置（支給率上限15%・61%以下で上限適用）";

    if (els.verdict) {
      if (!insuredOk) {
        els.verdict.textContent = "高年齢雇用継続給付は原則対象外です";
      } else if (dropRate >= 75) {
        els.verdict.textContent = "賃金が75%未満に低下していないため、対象外です";
      } else if (benefit <= 0) {
        els.verdict.textContent = "支給額が最低限度額（" + yen(MIN_LIMIT) + "）以下のため、支給されません";
      } else {
        els.verdict.textContent = "高年齢雇用継続給付の支給見込み額は月あたり " + yen(benefit) + " です";
      }
    }
    if (els.verdictSub) {
      var sub;
      if (!insuredOk) {
        sub = "60歳に達した日（または60歳到達時点で被保険者であった期間が5年に満たない場合は、その期間が5年を満たすこととなった日）における被保険者であった期間が通算5年以上あることが主な要件の一つです。";
      } else {
        sub =
          "60歳到達時等の賃金月額" + yen(wageBase) + "（上限52万2,000円・下限9万6,090円で調整後）と比較した、支給対象月の賃金" + yen(wage) + "の低下率は" + dropRate.toFixed(2) + "%です。" + ruleLabel + "の計算式で試算しています。";
      }
      els.verdictSub.textContent = sub;
    }

    if (els.breakdownBody) {
      var wageBaseNote = wageBase !== wagebaseInput
        ? yen(wageBase) + "（入力値" + yen(wagebaseInput) + "を上限52万2,000円・下限9万6,090円の範囲に調整）"
        : yen(wageBase);
      els.breakdownBody.innerHTML =
        "<tr><td>算定に使用する60歳到達時等の賃金月額</td><td>" + wageBaseNote + "</td></tr>" +
        "<tr><td>支給対象月の賃金（60歳以後の月給）</td><td>" + yen(wage) + "</td></tr>" +
        "<tr><td>賃金の低下率</td><td>" + (wageBase > 0 ? dropRate.toFixed(2) + " %" : "-") + "</td></tr>" +
        "<tr><td>適用する支給率のルール</td><td>" + ruleLabel + "</td></tr>" +
        "<tr><td><strong>高年齢雇用継続給付の支給見込み額</strong></td><td><strong>" + (insuredOk ? yen(benefit) : "対象外") + "</strong></td></tr>" +
        "<tr><td>賃金＋給付金の合計（支給限度額39万7,369円が上限）</td><td>" + yen(insuredOk ? total : wage) + "</td></tr>";
    }

    if (els.tableBody) {
      var closest = TABLE_PERCENTS.reduce(function (best, p) {
        return Math.abs(p - dropRate) < Math.abs(best - dropRate) ? p : best;
      }, TABLE_PERCENTS[0]);
      var rows = TABLE_PERCENTS.map(function (p) {
        var w = Math.round((wageBase * p) / 100 / 1000) * 1000;
        var b = calcBenefit(w, wageBase, isNewRule);
        var isCurrent = p === closest;
        return (
          "<tr" + (isCurrent ? ' class="wall-crossed"' : "") + ">" +
          "<td>" + p + " %</td>" +
          "<td>" + yen(w) + "</td>" +
          "<td>" + (b > 0 ? yen(b) : "支給なし") + "</td>" +
          "<td>" + yen(w + b) + "</td>" +
          "</tr>"
        );
      });
      els.tableBody.innerHTML = rows.join("");
    }

    var canvas = document.getElementById("kourei-growthChart");
    if (canvas && window.Chart) {
      var labels = TABLE_PERCENTS.slice().reverse().map(function (p) { return p + "%"; });
      var values = TABLE_PERCENTS.slice().reverse().map(function (p) {
        var w = Math.round((wageBase * p) / 100 / 1000) * 1000;
        var b = calcBenefit(w, wageBase, isNewRule);
        return w + b;
      });
      var data = {
        labels: labels,
        datasets: [
          {
            label: "賃金＋給付金の合計",
            data: values,
            backgroundColor: "#0f5f4c",
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "低下率（60歳到達時等賃金月額に対する割合）" } },
          y: {
            title: { display: true, text: "賃金＋給付金の合計（円）" },
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
      if (window.renderChartDataTable) window.renderChartDataTable("kourei-growthDataTable", chart);
    }
  }

  [els.wagebase, els.wage].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  els.rule.addEventListener("change", render);
  els.insured.addEventListener("change", render);

  render();
})();

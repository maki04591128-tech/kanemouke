(function () {
  "use strict";

  // 高等学校等就学支援金（高校無償化）シミュレーター。
  // 令和8年度（2026年度）から所得制限が完全に撤廃され、世帯の所得に
  // かかわらず、国公立高校（全日制）は年118,800円、私立高校（全日制）
  // は年457,200円を上限に支援金が支給される。
  // 私立高校の場合、実際の年間授業料が上限額を上回る分は自己負担と
  // なるため、授業料を入力してもらい上限額との差額を試算する。国公立
  // 高校は授業料が上限額とほぼ一致する（自治体の条例で上限額付近に
  // 設定されている）前提で、自己負担は実質0円として扱う。
  // なお、支援金は「授業料」のみが対象で、入学金・施設整備費・教材費・
  // 修学旅行費等は対象外（本ツールでは扱わない）。

  var els = {
    schoolType: document.getElementById("koukou-schoolType"),
    privateFields: document.getElementById("koukou-privateFields"),
    tuition: document.getElementById("koukou-tuition"),
    years: document.getElementById("koukou-years"),
    children: document.getElementById("koukou-children"),
    verdict: document.getElementById("koukou-verdict"),
    verdictSub: document.getElementById("koukou-verdictSub"),
    annual: document.getElementById("koukou-result-annual"),
    selfpay: document.getElementById("koukou-result-selfpay"),
    total: document.getElementById("koukou-result-total"),
    tableBody: document.getElementById("koukou-breakdown-body"),
  };
  if (!els.schoolType || !els.years || !els.children) return;

  var PUBLIC_CAP = 118800;
  var PRIVATE_CAP = 457200;

  var chart = null;

  function yen(n) {
    return Math.round(Math.max(0, n)).toLocaleString("ja-JP") + " 円";
  }

  function clampInt(n, min, max) {
    n = Math.round(Number(n) || 0);
    return Math.min(max, Math.max(min, n));
  }

  function render() {
    var isPrivate = els.schoolType.value === "private";
    if (els.privateFields) els.privateFields.hidden = !isPrivate;

    var years = clampInt(els.years.value, 1, 3);
    var children = clampInt(els.children.value, 1, 5);
    var cap = isPrivate ? PRIVATE_CAP : PUBLIC_CAP;

    var tuition;
    if (isPrivate) {
      tuition = Math.max(0, Number(els.tuition.value) || 0);
    } else {
      tuition = PUBLIC_CAP;
    }

    var supportPerYear = Math.min(tuition, cap);
    var selfPayPerYear = Math.max(0, tuition - cap);
    var totalSupportPerChild = supportPerYear * years;
    var totalSelfPayPerChild = selfPayPerYear * years;
    var totalSupportAll = totalSupportPerChild * children;
    var totalSelfPayAll = totalSelfPayPerChild * children;

    if (els.annual) els.annual.textContent = yen(supportPerYear);
    if (els.selfpay) els.selfpay.textContent = yen(selfPayPerYear);
    if (els.total) els.total.textContent = yen(totalSupportAll);

    if (els.verdict) {
      var schoolLabel = isPrivate ? "私立高校（全日制）" : "国公立高校（全日制）";
      if (selfPayPerYear > 0) {
        els.verdict.textContent = schoolLabel + "で1人あたり年間" + yen(supportPerYear) + "の支援を受けられます";
        els.verdictSub.textContent =
          "入力した年間授業料" + yen(tuition) + "のうち、上限" + yen(cap) + "までが支援金でカバーされ、残りの" + yen(selfPayPerYear) +
          "（年間・1人あたり）は自己負担です。入学金・施設整備費・教材費・修学旅行費等は支援金の対象外のため別途必要です。" +
          "在学予定" + years + "年・お子さま" + children + "人分では、支援金の合計は" + yen(totalSupportAll) + "、自己負担（授業料のみ）の合計は" + yen(totalSelfPayAll) + "です。";
      } else {
        els.verdict.textContent = schoolLabel + "で1人あたり年間" + yen(supportPerYear) + "の支援を受けられます（授業料の自己負担は実質0円）";
        els.verdictSub.textContent =
          "所得制限はなく、世帯の所得にかかわらず対象です。在学予定" + years + "年・お子さま" + children + "人分では、支援金の合計は" + yen(totalSupportAll) +
          "です。入学金・施設整備費・教材費・修学旅行費等は支援金の対象外のため別途必要です。";
      }
    }

    if (els.tableBody) {
      var rows = [
        ["学校の種類", isPrivate ? "私立高校（全日制）" : "国公立高校（全日制）", ""],
        ["支給上限額（年額・1人）", "", yen(cap)],
        ["年間授業料（1人・入力値）", "", yen(tuition)],
        ["支援金の支給額（年額・1人）", "", yen(supportPerYear)],
        ["自己負担額（年額・1人、授業料のみ）", "", yen(selfPayPerYear)],
        ["在学予定年数 × お子さまの人数", years + " 年 × " + children + " 人", ""],
        ["支援金の合計支給額（在学期間・人数分）", "", yen(totalSupportAll)],
        ["自己負担の合計額（在学期間・人数分、授業料のみ）", "", yen(totalSelfPayAll)],
      ];
      els.tableBody.innerHTML = rows
        .map(function (r) {
          return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
        })
        .join("");
    }

    var canvas = document.getElementById("koukou-growthChart");
    if (canvas && window.Chart) {
      var labels = ["支援金（年額・1人）", "自己負担（年額・1人、授業料のみ）"];
      var values = [supportPerYear, selfPayPerYear];
      var data = {
        labels: labels,
        datasets: [
          {
            label: "年間の内訳",
            data: values,
            backgroundColor: ["#0f5f4c", "#b5541a"],
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: "年額（円）" },
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
      if (window.renderChartDataTable) window.renderChartDataTable("koukou-growthDataTable", chart);
    }
  }

  [els.schoolType, els.tuition, els.years, els.children].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

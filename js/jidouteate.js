(function () {
  "use strict";

  // 児童手当シミュレーター（2024年10月改正後の制度に対応）。
  // 2024年10月分から、所得制限が撤廃され、支給対象が高校生年代
  // （18歳に達する日以後の最初の3月31日まで）まで拡大された。
  // また、月額が第3子以降に該当するかどうかを数える際にカウントする
  // 子の範囲が、大学生年代（22歳に達する日以後の最初の3月31日まで）
  // まで拡大された（大学生年代の子自身は支給対象外）。
  //
  // 本ツールは年齢を「0〜3歳未満」「3歳〜高校生年代」「19歳〜大学生
  // 年代（支給対象外・カウントのみ）」の3区分の人数で入力してもらい、
  // 年齢の高い区分ほど出生順が早いという前提（同一世帯の子は年齢区分が
  // 重ならない限り必ず成立する）で出生順を推定し、第1子・第2子か
  // 第3子以降かを判定する。

  var els = {
    under3: document.getElementById("jidouteate-under3"),
    highschool: document.getElementById("jidouteate-highschool"),
    university: document.getElementById("jidouteate-university"),
    verdict: document.getElementById("jidouteate-verdict"),
    verdictSub: document.getElementById("jidouteate-verdictSub"),
    monthly: document.getElementById("jidouteate-result-monthly"),
    annual: document.getElementById("jidouteate-result-annual"),
    thirdplus: document.getElementById("jidouteate-result-thirdplus"),
    tableBody: document.getElementById("jidouteate-breakdown-body"),
  };
  if (!els.under3 || !els.highschool || !els.university) return;

  var UNDER3_RATE = 15000;
  var HIGHSCHOOL_RATE = 10000;
  var THIRD_PLUS_RATE = 30000;

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampCount(n) {
    return Math.max(0, Math.round(Number(n) || 0));
  }

  // 大学生年代→高校生年代まで→0〜3歳未満、の順に出生順（rank）を
  // 割り振り、各区分のうち何人が「第1子・第2子」「第3子以降」に
  // 該当するかを数える。
  function classify(university, highschool, under3) {
    var rank = university; // 大学生年代の人数ぶん、先に出生順を進めておく（支給対象外）
    var result = {
      highschoolNormal: 0,
      highschoolThird: 0,
      under3Normal: 0,
      under3Third: 0,
    };
    for (var i = 0; i < highschool; i++) {
      rank++;
      if (rank <= 2) result.highschoolNormal++;
      else result.highschoolThird++;
    }
    for (var j = 0; j < under3; j++) {
      rank++;
      if (rank <= 2) result.under3Normal++;
      else result.under3Third++;
    }
    return result;
  }

  function render() {
    var university = clampCount(els.university.value);
    var highschool = clampCount(els.highschool.value);
    var under3 = clampCount(els.under3.value);

    var c = classify(university, highschool, under3);

    var subtotalUnder3Normal = c.under3Normal * UNDER3_RATE;
    var subtotalUnder3Third = c.under3Third * THIRD_PLUS_RATE;
    var subtotalHighschoolNormal = c.highschoolNormal * HIGHSCHOOL_RATE;
    var subtotalHighschoolThird = c.highschoolThird * THIRD_PLUS_RATE;

    var monthly = subtotalUnder3Normal + subtotalUnder3Third + subtotalHighschoolNormal + subtotalHighschoolThird;
    var annual = monthly * 12;
    var thirdPlusCount = c.under3Third + c.highschoolThird;
    var paidChildren = highschool + under3;

    if (els.monthly) els.monthly.textContent = yen(monthly);
    if (els.annual) els.annual.textContent = yen(annual);
    if (els.thirdplus) els.thirdplus.textContent = thirdPlusCount + " 人";

    if (els.verdict) {
      if (paidChildren === 0) {
        els.verdict.textContent = "支給対象のお子さまがいません";
        els.verdictSub.textContent = "0歳〜高校生年代（18歳に達する日以後の最初の3月31日まで）のお子さまの人数を入力すると、支給額の目安が表示されます。";
      } else {
        els.verdict.textContent = "毎月の支給額（目安）は " + yen(monthly) + " です";
        var subMsg = "年間では " + yen(annual) + "（実際の振込は年6回・偶数月にまとめて）。";
        if (thirdPlusCount > 0) {
          subMsg += "うち" + thirdPlusCount + "人が「第3子以降」として月額30,000円の対象です。";
        }
        els.verdictSub.textContent = subMsg;
      }
    }

    if (els.tableBody) {
      var rows = [
        ["0〜3歳未満（第1子・第2子）", c.under3Normal + " 人 × " + yen(UNDER3_RATE), yen(subtotalUnder3Normal)],
        ["0〜3歳未満（第3子以降）", c.under3Third + " 人 × " + yen(THIRD_PLUS_RATE), yen(subtotalUnder3Third)],
        ["3歳〜高校生年代（第1子・第2子）", c.highschoolNormal + " 人 × " + yen(HIGHSCHOOL_RATE), yen(subtotalHighschoolNormal)],
        ["3歳〜高校生年代（第3子以降）", c.highschoolThird + " 人 × " + yen(THIRD_PLUS_RATE), yen(subtotalHighschoolThird)],
        ["合計（月額）", "", yen(monthly)],
        ["合計（年額）", "", yen(annual)],
      ];
      els.tableBody.innerHTML = rows
        .map(function (r) {
          return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
        })
        .join("");
    }

    var canvas = document.getElementById("jidouteate-growthChart");
    if (canvas && window.Chart) {
      var labels = ["0〜3歳未満\n(第1・2子)", "0〜3歳未満\n(第3子以降)", "高校生年代まで\n(第1・2子)", "高校生年代まで\n(第3子以降)"];
      var values = [subtotalUnder3Normal, subtotalUnder3Third, subtotalHighschoolNormal, subtotalHighschoolThird];
      var data = {
        labels: labels,
        datasets: [
          {
            label: "月額の内訳",
            data: values,
            backgroundColor: ["#0f5f4c", "#d98e04", "#3d7a8c", "#b5541a"],
          },
        ],
      };
      var options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: "月額（円）" },
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
      if (window.renderChartDataTable) window.renderChartDataTable("jidouteate-growthDataTable", chart);
    }
  }

  [els.under3, els.highschool, els.university].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

(function () {
  "use strict";

  // 賃貸で住み続ける場合と住宅を購入する場合の総支出を比較する。
  // 購入シナリオは、比較期間終了時点で売却したと仮定した場合の
  // 資産価値（想定売却額からローン残債を差し引いた手取り額）を
  // 差し引いた「正味支出」で比較する（賃貸には資産として残るものが
  // 無いため、購入側だけに売却価値の控除が発生する非対称な比較になる
  // 点に注意。これは実際の経済的な損得を反映するための意図的な設計）。
  // 頭金・諸費用の差額を投資に回した場合の機会費用は計算に含めない
  // （同じ考え方の比較は本ハブの「ローンvs投資」タブが担うため、
  // 本ツールは住居費そのものの比較に絞っている）。

  var els = {
    years: document.getElementById("chintai-years"),
    yearsOut: document.getElementById("chintai-yearsOut"),
    rent: document.getElementById("chintai-rent"),
    rentInitialCost: document.getElementById("chintai-rentInitialCost"),
    rentUpdateFee: document.getElementById("chintai-rentUpdateFee"),
    rentUpdateFeeOut: document.getElementById("chintai-rentUpdateFeeOut"),
    rentIncreaseRate: document.getElementById("chintai-rentIncreaseRate"),
    rentIncreaseRateOut: document.getElementById("chintai-rentIncreaseRateOut"),
    price: document.getElementById("chintai-price"),
    downPayment: document.getElementById("chintai-downPayment"),
    loanRate: document.getElementById("chintai-loanRate"),
    loanRateOut: document.getElementById("chintai-loanRateOut"),
    loanYears: document.getElementById("chintai-loanYears"),
    loanYearsOut: document.getElementById("chintai-loanYearsOut"),
    maintenance: document.getElementById("chintai-maintenance"),
    propertyTax: document.getElementById("chintai-propertyTax"),
    insurance: document.getElementById("chintai-insurance"),
    purchaseCost: document.getElementById("chintai-purchaseCost"),
    resaleRate: document.getElementById("chintai-resaleRate"),
    resaleRateOut: document.getElementById("chintai-resaleRateOut"),
    verdict: document.getElementById("chintai-verdict"),
    verdictSub: document.getElementById("chintai-verdictSub"),
    resultRentTotal: document.getElementById("chintai-result-rent-total"),
    resultBuyGross: document.getElementById("chintai-result-buy-gross"),
    resultResale: document.getElementById("chintai-result-resale"),
    resultBuyNet: document.getElementById("chintai-result-buy-net"),
    resultDiff: document.getElementById("chintai-result-diff"),
    detailLoanTotal: document.getElementById("chintai-detail-loan-total"),
    detailLoanRemain: document.getElementById("chintai-detail-loan-remain"),
    detailUpkeep: document.getElementById("chintai-detail-upkeep"),
    detailUpdateFee: document.getElementById("chintai-detail-update-fee"),
    detailFinalRent: document.getElementById("chintai-detail-final-rent"),
  };

  if (!els.years) return;

  var chart = null;

  function yen(n) {
    return Math.round(n).toLocaleString("ja-JP") + " 円";
  }

  function clampNonNegative(n) {
    return Math.max(0, Number(n) || 0);
  }

  function monthlyPayment(balance, annualRatePct, months) {
    var i = annualRatePct / 100 / 12;
    if (months <= 0) return balance;
    if (i === 0) return balance / months;
    return (balance * i) / (1 - Math.pow(1 + i, -months));
  }

  // 賃貸シナリオ：家賃上昇率（年率）が0%の場合は横ばいのまま。
  // 0%より大きい場合、1年ごと（13ヶ月目・25ヶ月目…）に複利で家賃を引き上げる。
  // 更新料（2年ごと）は、その時点の（上昇後の）家賃を基準に計算する。
  function simulateRent(monthsTotal, rentMonthly, updateFeeMonths, initialCost, rentIncreaseRatePct) {
    var growth = 1 + (Number(rentIncreaseRatePct) || 0) / 100;
    var currentRent = rentMonthly;
    var cumulativeRent = 0;
    var cumulativeUpdateFee = 0;
    var yearly = [initialCost];
    for (var m = 1; m <= monthsTotal; m++) {
      if (m > 1 && (m - 1) % 12 === 0) {
        currentRent = currentRent * growth;
      }
      cumulativeRent += currentRent;
      if (m % 24 === 0) {
        cumulativeUpdateFee += currentRent * updateFeeMonths;
      }
      if (m % 12 === 0) {
        yearly.push(initialCost + cumulativeRent + cumulativeUpdateFee);
      }
    }
    var total = yearly[yearly.length - 1];
    return {
      yearly: yearly,
      total: total,
      totalRentPaid: cumulativeRent,
      totalUpdateFee: cumulativeUpdateFee,
      finalRent: currentRent,
    };
  }

  // 購入シナリオ：元利均等返済。ローン完済後（比較期間の方が長い場合）は
  // 返済額なしで維持費のみが発生し続ける前提。比較期間の方が短い場合は
  // 残債を「売却時にローンを完済するための支出」として資産価値から差し引く。
  function simulateBuy(monthsTotal, price, downPayment, loanRatePct, loanYears, maintenanceMonthly, propertyTaxAnnual, insuranceAnnual, purchaseCost, resaleRatePct) {
    var loanPrincipal = Math.max(0, price - downPayment);
    var loanMonths = Math.max(1, Math.round(loanYears * 12));
    var payment = monthlyPayment(loanPrincipal, loanRatePct, loanMonths);
    var i = loanRatePct / 100 / 12;
    var balance = loanPrincipal;
    var loanPaidCumulative = 0;
    var upkeepMonthly = maintenanceMonthly + (propertyTaxAnnual + insuranceAnnual) / 12;

    var yearly = [downPayment + purchaseCost];
    for (var m = 1; m <= monthsTotal; m++) {
      if (m <= loanMonths && balance > 0) {
        var interest = balance * i;
        var due = Math.min(payment, balance + interest);
        var principalPaid = due - interest;
        balance = Math.max(0, balance - principalPaid);
        loanPaidCumulative += due;
      }
      if (m % 12 === 0) {
        yearly.push(downPayment + purchaseCost + loanPaidCumulative + upkeepMonthly * m);
      }
    }

    var remainingBalance = balance;
    var resaleValue = price * (resaleRatePct / 100);
    var netResale = resaleValue - remainingBalance;
    var grossTotal = yearly[yearly.length - 1];
    var netTotal = grossTotal - netResale;

    return {
      yearly: yearly,
      grossTotal: grossTotal,
      netTotal: netTotal,
      totalLoanPaid: loanPaidCumulative,
      remainingBalance: remainingBalance,
      resaleValue: resaleValue,
      netResale: netResale,
      upkeepTotal: upkeepMonthly * monthsTotal,
    };
  }

  function render() {
    var years = Math.max(1, Number(els.years.value) || 1);
    var months = Math.round(years * 12);

    var rentMonthly = clampNonNegative(els.rent.value);
    var rentInitialCost = clampNonNegative(els.rentInitialCost.value);
    var rentUpdateFeeMonths = clampNonNegative(els.rentUpdateFee.value);
    var rentIncreaseRate = clampNonNegative(els.rentIncreaseRate.value);

    var price = clampNonNegative(els.price.value);
    var downPayment = clampNonNegative(els.downPayment.value);
    var loanRate = Number(els.loanRate.value);
    var loanYears = Math.max(1, Number(els.loanYears.value) || 1);
    var maintenance = clampNonNegative(els.maintenance.value);
    var propertyTax = clampNonNegative(els.propertyTax.value);
    var insurance = clampNonNegative(els.insurance.value);
    var purchaseCost = clampNonNegative(els.purchaseCost.value);
    var resaleRate = Number(els.resaleRate.value);

    els.yearsOut.textContent = years + " 年";
    els.rentUpdateFeeOut.textContent = rentUpdateFeeMonths.toFixed(1) + " ヶ月分";
    els.rentIncreaseRateOut.textContent = rentIncreaseRate.toFixed(1) + " %";
    els.loanRateOut.textContent = loanRate.toFixed(2) + " %";
    els.loanYearsOut.textContent = loanYears + " 年";
    els.resaleRateOut.textContent = resaleRate + " %";

    var rent = simulateRent(months, rentMonthly, rentUpdateFeeMonths, rentInitialCost, rentIncreaseRate);
    var buy = simulateBuy(months, price, downPayment, loanRate, loanYears, maintenance, propertyTax, insurance, purchaseCost, resaleRate);

    els.resultRentTotal.textContent = yen(rent.total);
    els.resultBuyGross.textContent = yen(buy.grossTotal);
    els.resultResale.textContent = yen(buy.netResale);
    els.resultBuyNet.textContent = yen(buy.netTotal);

    var diff = rent.total - buy.netTotal;
    if (diff > 0) {
      els.resultDiff.textContent = yen(diff) + "（購入が有利）";
      els.verdict.textContent = "この条件では購入の方が正味支出で " + yen(diff) + " 少なくなる見込みです";
    } else if (diff < 0) {
      els.resultDiff.textContent = yen(-diff) + "（賃貸が有利）";
      els.verdict.textContent = "この条件では賃貸の方が正味支出で " + yen(-diff) + " 少なくなる見込みです";
    } else {
      els.resultDiff.textContent = "差なし";
      els.verdict.textContent = "この条件では賃貸・購入の正味支出はほぼ同額です";
    }
    els.verdictSub.textContent = "購入の「正味支出」は、比較期間終了時点で売却したと仮定した想定売却額からローン残債を差し引いた金額をあらかじめ控除しています。売却額の想定次第で結果は大きく変わるため、複数の資産価値シナリオで試してみてください。";

    els.detailLoanTotal.textContent = yen(buy.totalLoanPaid);
    els.detailLoanRemain.textContent = buy.remainingBalance > 0 ? yen(buy.remainingBalance) : "完済済み";
    els.detailUpkeep.textContent = yen(buy.upkeepTotal);
    els.detailUpdateFee.textContent = yen(rent.totalUpdateFee);
    els.detailFinalRent.textContent = yen(rent.finalRent);

    var labels = [];
    for (var y = 0; y <= years; y++) labels.push(y + "年目");

    var data = {
      labels: labels,
      datasets: [
        {
          label: "賃貸：累計支出",
          data: rent.yearly.map(function (v) { return Math.round(v); }),
          borderColor: "#7a8899",
          backgroundColor: "#7a8899",
          fill: false,
          tension: 0.15,
        },
        {
          label: "購入：累計支出（資産価値差引前）",
          data: buy.yearly.map(function (v) { return Math.round(v); }),
          borderColor: "#0f5f4c",
          backgroundColor: "#0f5f4c",
          fill: false,
          tension: 0.15,
        },
      ],
    };
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: function (v) { return yen(v); } } },
      },
      plugins: {
        legend: { display: true, position: "bottom" },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ctx.dataset.label + "：" + yen(ctx.parsed.y);
            },
          },
        },
      },
    };

    var ctx = document.getElementById("chintai-costChart").getContext("2d");
    if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart(ctx, { type: "line", data: data, options: options });
    }
    if (window.renderChartDataTable) window.renderChartDataTable("chintai-costDataTable", chart);
  }

  [
    els.years, els.rent, els.rentInitialCost, els.rentUpdateFee, els.rentIncreaseRate,
    els.price, els.downPayment, els.loanRate, els.loanYears,
    els.maintenance, els.propertyTax, els.insurance, els.purchaseCost, els.resaleRate,
  ].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  render();
})();

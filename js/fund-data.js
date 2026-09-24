(function (global) {
  "use strict";

  // 新NISA（つみたて投資枠・成長投資枠）でよく選ばれる代表的なインデックス
  // ファンドの参考データ。信託報酬は各運用会社の公表資料に基づく実質年率
  // （税込）の目安。相場や商品改定により実際の値は変動するため、投資判断
  // の前には必ず最新の目論見書・運用会社の公式サイトでご確認ください。
  //
  // referenceReturnPct は、当該カテゴリー（資産クラス）のインデックスの
  // 長期平均としてよく参考にされる目安レンジの中央値であり、個別ファンド
  // の将来の運用成果を予想・保証するものではありません。
  var FUNDS = [
    {
      id: "emaxis-slim-all-country",
      name: "eMAXIS Slim 全世界株式（オール・カントリー）",
      category: "全世界株式",
      expenseRatio: 0.05775,
      referenceReturnPct: 6,
      referenceReturnRangeText: "年率5〜7%程度"
    },
    {
      id: "emaxis-slim-sp500",
      name: "eMAXIS Slim 米国株式（S&P500）",
      category: "米国株式（S&P500）",
      expenseRatio: 0.09372,
      referenceReturnPct: 7,
      referenceReturnRangeText: "年率6〜8%程度"
    },
    {
      id: "sbi-v-sp500",
      name: "SBI・V・S&P500インデックス・ファンド",
      category: "米国株式（S&P500）",
      expenseRatio: 0.0938,
      referenceReturnPct: 7,
      referenceReturnRangeText: "年率6〜8%程度"
    },
    {
      id: "rakuten-vti",
      name: "楽天・全米株式インデックス・ファンド（楽天・VTI）",
      category: "米国株式（全米）",
      expenseRatio: 0.162,
      referenceReturnPct: 7,
      referenceReturnRangeText: "年率6〜8%程度"
    },
    {
      id: "sbi-vti",
      name: "SBI・V・全米株式インデックス・ファンド（SBI・VTI）",
      category: "米国株式（全米）",
      expenseRatio: 0.0938,
      referenceReturnPct: 7,
      referenceReturnRangeText: "年率6〜8%程度"
    },
    {
      id: "emaxis-slim-developed",
      name: "eMAXIS Slim 先進国株式インデックス",
      category: "先進国株式",
      expenseRatio: 0.09889,
      referenceReturnPct: 6,
      referenceReturnRangeText: "年率5〜7%程度"
    },
    {
      id: "tawara-developed",
      name: "たわらノーロード先進国株式",
      category: "先進国株式",
      expenseRatio: 0.09889,
      referenceReturnPct: 6,
      referenceReturnRangeText: "年率5〜7%程度"
    },
    {
      id: "emaxis-slim-topix",
      name: "eMAXIS Slim 国内株式（TOPIX）",
      category: "国内株式",
      expenseRatio: 0.143,
      referenceReturnPct: 4,
      referenceReturnRangeText: "年率3〜5%程度"
    },
    {
      id: "nissay-topix",
      name: "＜ニッセイ>TOPIXインデックスファンド",
      category: "国内株式",
      expenseRatio: 0.176,
      referenceReturnPct: 4,
      referenceReturnRangeText: "年率3〜5%程度"
    },
    {
      id: "emaxis-slim-8assets",
      name: "eMAXIS Slim バランス（8資産均等型）",
      category: "バランス型（8資産均等）",
      expenseRatio: 0.143,
      referenceReturnPct: 4,
      referenceReturnRangeText: "年率3〜5%程度"
    }
  ];

  global.FUND_DATA = FUNDS;
  global.FUND_DATA_NOTE =
    "信託報酬は各運用会社の公表資料に基づく参考値、想定利回りは資産クラスの長期平均としてよく参考にされる目安レンジの中央値です。将来の運用成果を保証するものではありません。最新の数値は目論見書・運用会社の公式サイトでご確認ください。";
})(window);

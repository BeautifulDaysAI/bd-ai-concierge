/**
 * NG ワードフィルター v2
 *
 * Week 2強化版：
 * - 出力側：AI応答に法的グレー表現が含まれないかチェック
 * - 入力側：個別商品名・契約解約系の語を検出してLv.3強制
 * - 注意ワード：警告ログのみ（ブロックはしない）
 *
 * © Beautiful Days
 */

/**
 * 出力NGワード（AIが言ってはいけない言葉）
 */
export const ABSOLUTE_NG_WORDS = [
  // 断定表現
  "絶対に儲か",
  "絶対損しな",
  "必ず儲か",
  "必ず利益",
  "保証します",
  "100%安全",
  "リスクゼロ",
  "元本保証",
  "絶対安全",

  // 強い推奨（個別商品判断に該当）
  "買うべきです",
  "売るべきです",
  "解約すべきです",
  "乗り換えるべきです",
  "今すぐ契約",
  "今すぐ解約",

  // 個別商品の評価
  "おすすめの商品は",
  "最も良い保険は",
  "一番儲かる",
  "確実に増える",
];

/**
 * 注意ワード（警告ログのみ）
 */
export const CAUTION_WORDS = [
  "節税",
  "脱税",
  "確実",
  "間違いなく",
  "業界最安",
  "業界No.1",
  "他社より優れ",
  "誰でも",
];

/**
 * 個別商品名キーワード（入力側 / Lv.3強制）
 */
export const PRODUCT_KEYWORDS = [
  // 保険会社
  "日本生命",
  "第一生命",
  "明治安田",
  "住友生命",
  "プルデンシャル",
  "メットライフ",
  "アクサ",
  "オリックス生命",
  "ソニー生命",
  "東京海上",
  "アフラック",
  "かんぽ",

  // 証券会社
  "野村証券",
  "野村證券",
  "大和証券",
  "SBI証券",
  "楽天証券",
  "マネックス",
  "松井証券",
  "auカブコム",

  // 銀行系
  "三菱UFJ",
  "三井住友",
  "みずほ銀行",
  "ゆうちょ",

  // 不動産関連
  "RENOSY",
  "シノケン",
];

/**
 * 契約・解約系キーワード（Lv.3強制）
 */
export const CONTRACT_KEYWORDS = [
  "解約",
  "乗り換え",
  "見直し",
  "契約変更",
  "払済",
  "失効",
  "減額",
];

export type NgCheckResult =
  | { ok: true }
  | { ok: false; reason: string; matched: string[] };

/**
 * AI応答に出力NGワードが含まれていないかチェック
 */
export function checkNgWords(text: string): NgCheckResult {
  const matched = ABSOLUTE_NG_WORDS.filter((word) => text.includes(word));
  if (matched.length > 0) {
    return {
      ok: false,
      reason: "absolute_ng",
      matched,
    };
  }
  return { ok: true };
}

/**
 * ユーザー入力に個別商品名が含まれていないかチェック
 */
export function detectProductName(text: string): {
  detected: boolean;
  products: string[];
} {
  const products = PRODUCT_KEYWORDS.filter((kw) => text.includes(kw));
  return {
    detected: products.length > 0,
    products,
  };
}

/**
 * ユーザー入力に契約・解約系のキーワードがあるかチェック
 */
export function detectContractIntent(text: string): {
  detected: boolean;
  keywords: string[];
} {
  const keywords = CONTRACT_KEYWORDS.filter((kw) => text.includes(kw));
  return {
    detected: keywords.length > 0,
    keywords,
  };
}

/**
 * 注意ワード（警告ログのみ）
 */
export function checkCautionWords(text: string): string[] {
  return CAUTION_WORDS.filter((word) => text.includes(word));
}

/**
 * NG検出時の安全な定型応答
 */
export const SAFE_FALLBACK_RESPONSE = `ご質問ありがとうございます。

このご質問は、担当 FP がより適切にお答えできる内容です。
ぜひ FP 相談のご予約をお取りください。

▼ 相談予約はこちら
このチャットで「FP相談予約」とお送りください。

※ Beautiful Days では、お客様個別のご状況に応じた具体的なご提案は、必ず資格を持つ FP が直接お伝えしています。`;

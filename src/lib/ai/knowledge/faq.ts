/**
 * Beautiful Days 独自ナレッジ（FAQ）
 *
 * AI がユーザー応答時に参照する BD固有情報。
 *
 * 注意：
 * - 2026年6月時点の正式情報に基づく
 * - 個別商品の言及は絶対しない
 * - 数値変更時は真武さん確認のうえ更新すること
 *
 * 構造：
 *   id : 一意のID
 *   category : 'company' / 'service' / 'event' / 'plan' / 'fp' / 'general'
 *   question : 想定される質問パターン
 *   answer : 回答テンプレート
 *   keywords : 検索用キーワード
 *
 * © Beautiful Days
 */

export type FaqCategory =
  | "company"   // 会社について
  | "service"   // サービス全般
  | "event"     // イベント・パーティ
  | "plan"      // プラン・料金
  | "fp"        // FP相談について
  | "general";  // 金融用語・制度（一般論）

export type FaqItem = {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  keywords: string[];
};

export const FAQ_KNOWLEDGE: FaqItem[] = [
  // ============ 会社について ============
  {
    id: "company-001",
    category: "company",
    question: "Beautiful Days とはどんな会社ですか？",
    answer: `Beautiful Days は、2007年に創業した資産形成コンサルティング会社です。業歴18年を迎え、多数の会員様にご利用いただいています。

特定の金融商品を販売するのではなく、お客様一人ひとりの状況に寄り添った本質的なご提案を大切にしています。

担当 FP（ファイナンシャルプランナー）が継続的に伴走し、ご家族のような距離感でサポートいたします。`,
    keywords: ["会社", "Beautiful Days", "BD", "何", "どんな", "概要", "創業", "業歴"],
  },
  {
    id: "company-002",
    category: "company",
    question: "代表者は誰ですか？",
    answer: `Beautiful Days の代表は真武です。2007年の創業以来、18年にわたりお客様の資産形成に向き合ってきました。

業界の慣習にとらわれず、お客様目線でのコンサルティングを大切にしています。`,
    keywords: ["代表", "社長", "真武", "誰", "経営者", "創業"],
  },

  // ============ サービスについて ============
  {
    id: "service-001",
    category: "service",
    question: "どんなサービスを提供していますか？",
    answer: `Beautiful Days では、会員様の資産形成を多方面からサポートしています。

▼ 主なサービス
・FP による個別相談（初回30分無料）
・月1回の会員交流パーティ
・大人の修学旅行などの特別イベント
・AI コンシェルジュによる24時間対応（このチャットです）

現在、サービスはすべて無料でご利用いただけます。お気軽にご相談ください。`,
    keywords: ["サービス", "内容", "何ができる", "提供", "無料"],
  },

  // ============ プラン・料金 ============
  {
    id: "plan-001",
    category: "plan",
    question: "料金はかかりますか？",
    answer: `現在、Beautiful Days のサービスはすべて無料でご利用いただけます。

▼ 無料でご利用いただける内容
・FP による個別相談（初回30分無料）
・月1回の会員交流パーティへのご参加
・AI コンシェルジュによる24時間対応
・各種イベントへのご参加

費用についてご不明な点があれば、お気軽にお問い合わせください。`,
    keywords: ["プラン", "料金", "値段", "費用", "コース", "無料", "タダ", "お金"],
  },

  // ============ イベント・パーティ ============
  {
    id: "event-001",
    category: "event",
    question: "パーティはどのくらいの頻度で開催されますか？",
    answer: `Beautiful Days では月1回、会員交流パーティを開催しています。

会員様同士の交流はもちろん、ご家族やご友人をお連れいただくことも可能です。落ち着いた雰囲気のなかで、資産形成に関心のある方々と自然にお話しいただける場をご用意しています。

直近のパーティ情報は、こちらのチャットで「次のパーティ」と聞いていただければお知らせします。`,
    keywords: ["パーティ", "頻度", "いつ", "次", "イベント", "開催", "月1回"],
  },
  {
    id: "event-002",
    category: "event",
    question: "大人の修学旅行とは？",
    answer: `Beautiful Days オリジナルの特別イベントです。

国内外のさまざまな目的地で、学びと交流を組み合わせた旅行イベントを年に数回開催しています。少人数制のため、参加された方同士で深い関係を築けるのが特徴です。

過去の開催情報や次回の予定は、担当 FP までお問い合わせください。`,
    keywords: ["修学旅行", "旅行", "大人", "イベント", "特別"],
  },

  // ============ FP相談 ============
  {
    id: "fp-001",
    category: "fp",
    question: "FP相談ではどんなことを話せますか？",
    answer: `FP相談では、お客様の状況に合わせて幅広くご相談いただけます。

▼ 主なご相談テーマ
・ライフプランニング（教育費、老後資金、住宅購入）
・保険の見直し・新規加入の検討
・資産運用の方針（NISA、iDeCo、投資全般）
・不動産投資の検討
・税金・相続のご相談
・家計の見直し

初回は30分無料です。担当 FP がお客様の状況をしっかりお聞きした上で、ご提案いたします。

▼ ご予約
このチャットで「FP相談したい」とお送りいただくか、ご質問内容を教えてください。`,
    keywords: ["FP相談", "相談", "話す", "内容", "ファイナンシャルプランナー"],
  },
  {
    id: "fp-002",
    category: "fp",
    question: "FP相談の料金は？",
    answer: `FP相談は初回30分無料です。

お気軽にまずはお話しいただき、ご自身の状況を整理するところから始められます。具体的なご提案が必要な場合は、担当 FP が丁寧にご案内いたします。

ご予約はこのチャットで「FP相談したい」とお送りください。`,
    keywords: ["FP", "料金", "費用", "値段", "相談", "無料", "30分"],
  },

  // ============ 一般金融用語 ============
  {
    id: "general-001",
    category: "general",
    question: "NISA とは？",
    answer: `NISA（ニーサ）は、個人投資家のための少額投資非課税制度です。

▼ 一般的な特徴
・投資で得た利益（配当・売却益）が非課税
・2024年から「新NISA」がスタート
・つみたて投資枠（年120万円）と成長投資枠（年240万円）
・非課税保有限度額は1,800万円
・売却した枠は翌年以降に復活

▼ 注意点
個別の活用方法（どの商品を、いくら、いつまで）はお客様の状況により異なります。
具体的なご提案は担当 FP からお伝えしますので、ぜひご相談ください。

※ 一般的な情報のご案内です。お客様個別のご判断は、担当 FP にご相談ください。`,
    keywords: ["NISA", "ニーサ", "新NISA", "非課税"],
  },
];

/**
 * キーワードでFAQを検索
 *
 * 簡易実装：キーワードマッチでスコアリング
 * 本格化したらベクトル検索（pgvector）に置き換え
 */
export function searchFaq(query: string, topK: number = 3): FaqItem[] {
  const lowerQuery = query.toLowerCase();

  const scored = FAQ_KNOWLEDGE.map((faq) => {
    let score = 0;
    // キーワードマッチ
    for (const kw of faq.keywords) {
      if (lowerQuery.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    // 質問文の部分一致
    if (faq.question.toLowerCase().includes(lowerQuery)) {
      score += 3;
    }
    return { faq, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.faq);
}

/**
 * FAQ をプロンプト用の参考情報文字列に整形
 */
export function formatFaqForPrompt(faqs: FaqItem[]): string {
  if (faqs.length === 0) return "";

  const formatted = faqs
    .map(
      (f) => `Q: ${f.question}
A: ${f.answer}`,
    )
    .join("\n\n");

  return `## 参考情報（Beautiful Days 公式情報）

以下は、ユーザーの質問に関連する Beautiful Days の公式情報です。
回答する際の参考にしてください。

${formatted}

---
`;
}

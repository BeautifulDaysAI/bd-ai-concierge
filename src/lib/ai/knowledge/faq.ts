/**
 * Beautiful Days 独自ナレッジ（FAQ）
 *
 * AI がユーザー応答時に参照する BD固有情報。
 *
 * 注意：
 * - ここは「サンプル」です。本番運用時には真武さん監修のもとで内容を確定させてください
 * - 数値（料金、開催頻度等）は実態と合わせて要確認
 * - 個別商品の言及は絶対しない
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
    answer: `Beautiful Days は、お客様の資産形成を「等身大」でサポートする資産形成コンサルティング会社です。

特定の金融商品を販売することを目的とせず、お客様一人ひとりの状況に合わせた本質的なご提案を心がけています。

担当 FP（ファイナンシャルプランナー）が継続的に伴走し、ご家族のような距離感でサポートいたします。`,
    keywords: ["会社", "Beautiful Days", "BD", "何", "どんな", "概要"],
  },
  {
    id: "company-002",
    category: "company",
    question: "代表者は誰ですか？",
    answer: `Beautiful Days の代表は真武です。

お客様の資産形成における「本当のパートナー」となることを目指し、業界の慣習にとらわれず、お客様目線でのコンサルティングを大切にしています。`,
    keywords: ["代表", "社長", "真武", "誰", "経営者"],
  },

  // ============ サービスについて ============
  {
    id: "service-001",
    category: "service",
    question: "どんなサービスを提供していますか？",
    answer: `Beautiful Days では以下のサポートを提供しています：

▼ サービス内容
・FP による個別相談（資産形成、保険、不動産、税金など）
・月1回の会員交流パーティ
・大人の修学旅行などの特別イベント
・最新の金融情報の定期配信（Member 以上）
・AI コンシェルジュによる24時間対応（このチャットです）

詳しくは、お気軽にお問い合わせください。`,
    keywords: ["サービス", "内容", "何ができる", "提供"],
  },

  // ============ プラン・料金 ============
  {
    id: "plan-001",
    category: "plan",
    question: "プランと料金を教えてください",
    answer: `Beautiful Days には3つの会員区分があります：

▼ Free（0円）
・サービス案内、パーティ案内、出欠管理
・金融用語のご質問対応（1日3回まで）
・商品検討時の初回 FP 相談（1回）

▼ Member（月額 3,300円）★おすすめ
・Free のすべて
・毎朝の市況サマリ配信
・ライフプラン概算作成（無制限）
・月1回の FP 個別相談（30分）
・資料お預かり窓口
・パーティの優先案内

▼ 商品契約者プラン（詳細は別途）
・Member のすべて + FP 相談随時

ご質問あれば担当 FP よりご案内します。`,
    keywords: ["プラン", "料金", "値段", "費用", "コース", "Member", "Free"],
  },
  {
    id: "plan-002",
    category: "plan",
    question: "Member プランへのアップグレード方法は？",
    answer: `Member プラン（月額3,300円）へのご加入は、担当 FP 経由でご案内しています。

▼ お申し込みの流れ
1. このチャットで「Memberに興味あり」とお送りください
2. 担当 FP からご連絡いたします
3. プラン内容のご説明（オンライン10分程度）
4. ご加入・初回設定

ご検討中でもお気軽にご質問ください。`,
    keywords: ["アップグレード", "加入", "申し込み", "Member", "登録"],
  },

  // ============ イベント・パーティ ============
  {
    id: "event-001",
    category: "event",
    question: "パーティはどのくらいの頻度で開催されますか？",
    answer: `Beautiful Days では月1回の会員交流パーティを開催しています。

▼ 概要
・毎月1回（基本は週末）
・会員様とそのご家族・ご友人が参加可能
・場所：都内のホテル・レストラン等
・形式：立食または着席（テーマにより異なる）

直近のパーティ情報は、こちらのチャットで「次のパーティ」と聞いていただければお知らせします。`,
    keywords: ["パーティ", "頻度", "いつ", "次", "イベント", "開催"],
  },
  {
    id: "event-002",
    category: "event",
    question: "大人の修学旅行とは？",
    answer: `Beautiful Days オリジナルの特別イベントです。

▼ 概要
・年に数回開催される会員様向けの旅行イベント
・国内外のさまざまな目的地
・単なる観光ではなく、学びと交流を組み合わせた内容
・少人数制で深い人間関係を築ける

過去の開催情報や次回の予定は、担当 FP までお問い合わせください。`,
    keywords: ["修学旅行", "旅行", "大人", "イベント", "特別"],
  },

  // ============ FP相談 ============
  {
    id: "fp-001",
    category: "fp",
    question: "FP相談ではどんなことを話せますか？",
    answer: `FP相談では、お客様の状況に合わせて幅広くご相談いただけます：

▼ 主なご相談テーマ
・ライフプランニング（教育費、老後資金、住宅購入）
・保険の見直し・新規加入の検討
・資産運用の方針（NISA、iDeCo、投資全般）
・不動産投資の検討
・税金・相続のご相談
・家計の見直し

担当 FP が、お客様一人ひとりの状況をしっかりお聞きした上で、最適なご提案をします。

▼ ご予約
このチャットで「FP相談したい」とお送りいただくか、ご質問内容を教えてください。`,
    keywords: ["FP相談", "相談", "話す", "内容", "ファイナンシャルプランナー"],
  },
  {
    id: "fp-002",
    category: "fp",
    question: "FP相談の料金は？",
    answer: `FP相談の料金は会員プランによって異なります：

▼ Free プラン
・初回 FP 相談 1回（商品検討時のみ・無料）

▼ Member プラン（月額3,300円）
・月1回の FP 個別相談（30分）が含まれる
・追加相談は別途相談

▼ 商品契約者プラン
・FP 相談は随時可能

ご相談内容に応じて、担当 FP がご案内します。`,
    keywords: ["FP", "料金", "費用", "値段", "相談", "費用"],
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

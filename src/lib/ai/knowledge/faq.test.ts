/**
 * FAQ検索のテスト
 *
 * © Beautiful Days
 */

import { describe, it, expect } from "vitest";
import { searchFaq, formatFaqForPrompt } from "@/lib/ai/knowledge/faq";

describe("searchFaq", () => {
  it("料金キーワードでプラン情報を返す", () => {
    const result = searchFaq("料金を教えてください");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "plan")).toBe(true);
  });

  it("パーティキーワードでイベント情報を返す", () => {
    const result = searchFaq("次のパーティはいつ?");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "event")).toBe(true);
  });

  it("関係ない質問は空または低スコア", () => {
    const result = searchFaq("今日の天気");
    // キーワードマッチがないので0件
    expect(result.length).toBe(0);
  });

  it("topKで件数制限される", () => {
    const result = searchFaq("BD", 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe("formatFaqForPrompt", () => {
  it("FAQが0件なら空文字", () => {
    const result = formatFaqForPrompt([]);
    expect(result).toBe("");
  });

  it("FAQがあれば整形された文字列を返す", () => {
    const faqs = searchFaq("料金");
    const formatted = formatFaqForPrompt(faqs);
    expect(formatted).toContain("公式情報");
    expect(formatted).toContain("Q:");
    expect(formatted).toContain("A:");
  });
});

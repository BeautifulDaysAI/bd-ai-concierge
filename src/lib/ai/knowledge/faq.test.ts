/**
 * FAQ検索のテスト（アポ獲得特化版）
 *
 * © Beautiful Days
 */

import { describe, it, expect } from "vitest";
import { searchFaq, formatFaqForPrompt } from "@/lib/ai/knowledge/faq";

describe("searchFaq", () => {
  it("会社キーワードで会社情報を返す", () => {
    const result = searchFaq("会社について教えてください");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "company")).toBe(true);
  });

  it("サービスキーワードでサービス情報を返す", () => {
    const result = searchFaq("サービス内容を教えてください");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "service")).toBe(true);
  });

  it("診断キーワードで診断情報を返す", () => {
    const result = searchFaq("ライフプラン診断をしたい");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "diagnostic")).toBe(true);
  });

  it("お金診断キーワードでお金診断情報を返す", () => {
    const result = searchFaq("お金診断したい");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "money_diagnostic")).toBe(true);
  });

  it("ライフイベントキーワードでライフイベント情報を返す", () => {
    const result = searchFaq("ライフイベントについて教えて");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "life_event")).toBe(true);
  });

  it("iDeCoキーワードで一般金融用語を返す", () => {
    const result = searchFaq("iDeCoについて教えて");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "general")).toBe(true);
  });

  it("相談キーワードでFP情報を返す", () => {
    const result = searchFaq("相談予約したい");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "fp")).toBe(true);
  });

  it("関係ない質問は空", () => {
    const result = searchFaq("今日の天気");
    expect(result.length).toBe(0);
  });

  it("topKで件数制限される", () => {
    const result = searchFaq("BD", 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("全FAQに相談予約導線が含まれる（診断説明を除く）", () => {
    const result = searchFaq("会社", 10);
    const companyFaqs = result.filter((f) => f.category === "company");
    for (const faq of companyFaqs) {
      expect(faq.answer).toContain("相談予約");
    }
  });
});

describe("formatFaqForPrompt", () => {
  it("FAQが0件なら空文字", () => {
    const result = formatFaqForPrompt([]);
    expect(result).toBe("");
  });

  it("FAQがあれば公式情報として整形される", () => {
    const faqs = searchFaq("サービス");
    const formatted = formatFaqForPrompt(faqs);
    expect(formatted).toContain("公式情報");
    expect(formatted).toContain("Q:");
    expect(formatted).toContain("A:");
  });
});

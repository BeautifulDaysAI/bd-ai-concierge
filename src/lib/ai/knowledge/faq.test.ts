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

  it("診断キーワードで診断情報を返す", () => {
    const result = searchFaq("ライフプラン診断をしたい");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "diagnostic")).toBe(true);
  });

  it("iDeCoキーワードで一般金融用語を返す", () => {
    const result = searchFaq("iDeCoについて教えて");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.category === "general")).toBe(true);
  });

  it("関係ない質問は空", () => {
    const result = searchFaq("今日の天気");
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

  it("FAQがあれば公式情報として整形される", () => {
    const faqs = searchFaq("料金");
    const formatted = formatFaqForPrompt(faqs);
    expect(formatted).toContain("公式情報");
    expect(formatted).toContain("Q:");
    expect(formatted).toContain("A:");
  });
});

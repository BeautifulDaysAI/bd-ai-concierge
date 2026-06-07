/**
 * NGワードフィルターのテスト
 *
 * 実行: npm test
 *
 * © Beautiful Days
 */

import { describe, it, expect } from "vitest";
import {
  checkNgWords,
  detectProductName,
  detectContractIntent,
  checkCautionWords,
} from "@/lib/ai/guards/ng-words";

describe("checkNgWords (出力NGチェック)", () => {
  it("断定表現を検出する", () => {
    const result = checkNgWords("この投資は絶対に儲かります");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.matched).toContain("絶対に儲か");
    }
  });

  it("元本保証の表現を検出する", () => {
    const result = checkNgWords("元本保証の商品です");
    expect(result.ok).toBe(false);
  });

  it("「買うべき」を検出する", () => {
    const result = checkNgWords("これは今すぐ買うべきです");
    expect(result.ok).toBe(false);
  });

  it("通常の応答は通す", () => {
    const result = checkNgWords(
      "NISAは少額投資非課税制度です。一般論として、長期分散投資が推奨されています。",
    );
    expect(result.ok).toBe(true);
  });
});

describe("detectProductName (個別商品名検出)", () => {
  it("保険会社名を検出する", () => {
    const result = detectProductName("日本生命の終身保険について教えて");
    expect(result.detected).toBe(true);
    expect(result.products).toContain("日本生命");
  });

  it("証券会社名を検出する", () => {
    const result = detectProductName("SBI証券で NISA をやろうと思う");
    expect(result.detected).toBe(true);
    expect(result.products).toContain("SBI証券");
  });

  it("商品名がない通常の質問は検出しない", () => {
    const result = detectProductName("NISAって何ですか?");
    expect(result.detected).toBe(false);
    expect(result.products).toEqual([]);
  });
});

describe("detectContractIntent (契約・解約意図)", () => {
  it("解約という言葉を検出する", () => {
    const result = detectContractIntent("保険を解約すべきですか?");
    expect(result.detected).toBe(true);
    expect(result.keywords).toContain("解約");
  });

  it("乗り換えを検出する", () => {
    const result = detectContractIntent("別の保険に乗り換えたい");
    expect(result.detected).toBe(true);
    expect(result.keywords).toContain("乗り換え");
  });

  it("関係ない質問は検出しない", () => {
    const result = detectContractIntent("NISAの仕組みを教えてください");
    expect(result.detected).toBe(false);
  });
});

describe("checkCautionWords (注意ワード)", () => {
  it("「節税」を検出する", () => {
    const result = checkCautionWords("節税できる商品はありますか");
    expect(result).toContain("節税");
  });

  it("検出しない場合は空配列", () => {
    const result = checkCautionWords("こんにちは");
    expect(result).toEqual([]);
  });
});

/**
 * Anthropic Claude API クライアント
 *
 * 注意: Claude Code 環境では ANTHROPIC_API_KEY が空文字列で process.env に
 * 注入されるため、dotenv が .env.local の値で上書きしない。
 * そのため .env.local から直接読み込む。
 *
 * © Beautiful Days
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

let _client: Anthropic | null = null;
let _envVars: Record<string, string> | null = null;

function loadEnvLocal(): Record<string, string> {
  if (_envVars) return _envVars;
  _envVars = {};
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.replace(/\r$/, "");
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      _envVars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  } catch {
    // .env.local が無い場合（本番環境等）は何もしない
  }
  return _envVars;
}

function getApiKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.startsWith("sk-")) return fromEnv;
  const fromFile = loadEnvLocal()["ANTHROPIC_API_KEY"];
  if (fromFile && fromFile.startsWith("sk-")) return fromFile;
  throw new Error(
    "[Anthropic] ANTHROPIC_API_KEY が未設定です。.env.local を確認してください",
  );
}

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getApiKey() });
  }
  return _client;
}

export function getDefaultModel(): string {
  const fromEnv = process.env.ANTHROPIC_MODEL;
  if (fromEnv) return fromEnv;
  return loadEnvLocal()["ANTHROPIC_MODEL"] || "claude-sonnet-4-5";
}

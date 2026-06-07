/**
 * 市況配信の承認API
 *
 * © Beautiful Days
 */

import { NextRequest, NextResponse } from "next/server";
import { approveBrief } from "@/lib/db/queries/morning-briefs";

export async function POST(request: NextRequest) {
  // TODO: 管理者認証チェック（Week 3後半 or Week 4）
  try {
    const { briefId, humanReviewed, reviewerId } = await request.json();

    if (!briefId || !humanReviewed) {
      return NextResponse.json(
        { error: "briefId と humanReviewed は必須" },
        { status: 400 },
      );
    }

    await approveBrief(briefId, humanReviewed, reviewerId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API] 承認エラー", err);
    return NextResponse.json(
      { error: "Internal error", details: String(err) },
      { status: 500 },
    );
  }
}

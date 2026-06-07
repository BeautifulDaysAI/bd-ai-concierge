/**
 * 管理画面トップ
 *
 * FP が会話ログ・NG検出・市況配信をチェックするダッシュボード
 *
 * ※ Week 2では最小UI。Week 3で認証強化・本格的なUIを実装
 *
 * © Beautiful Days
 */

import Link from "next/link";
import { supabaseAdmin } from "@/lib/db/supabase";

async function getDashboardStats() {
  const [members, messages, ngDetections, documents] = await Promise.all([
    supabaseAdmin.from("members").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("messages").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("ng_detected", true),
    supabaseAdmin
      .from("documents")
      .select("*", { count: "exact", head: true })
      .is("reviewed_at", null),
  ]);

  return {
    totalMembers: members.count ?? 0,
    totalMessages: messages.count ?? 0,
    ngDetections: ngDetections.count ?? 0,
    unreviewedDocuments: documents.count ?? 0,
  };
}

export default async function AdminDashboard() {
  const stats = await getDashboardStats();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <p className="text-sm tracking-widest text-yellow-700 font-bold uppercase mb-2">
            Beautiful Days × AI
          </p>
          <h1 className="text-3xl font-bold text-gray-900">
            管理ダッシュボード
          </h1>
          <p className="text-gray-500 mt-2">
            会員・会話・配信を一元管理
          </p>
        </header>

        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="総会員数" value={stats.totalMembers} unit="人" />
          <StatCard label="累計メッセージ" value={stats.totalMessages} unit="件" />
          <StatCard
            label="NG検出"
            value={stats.ngDetections}
            unit="件"
            alert={stats.ngDetections > 0}
          />
          <StatCard
            label="未確認資料"
            value={stats.unreviewedDocuments}
            unit="件"
            alert={stats.unreviewedDocuments > 0}
          />
        </div>

        {/* メニュー */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MenuCard
            href="/admin/messages"
            title="会話ログ"
            description="会員様との全会話を確認"
          />
          <MenuCard
            href="/admin/members"
            title="会員管理"
            description="プラン変更・退会処理"
          />
          <MenuCard
            href="/admin/morning-brief"
            title="毎朝の市況配信"
            description="AI生成→チェック→配信"
            badge="要対応"
          />
          <MenuCard
            href="/admin/documents"
            title="お預かり資料"
            description="会員様からの書類"
          />
          <MenuCard
            href="/admin/appointments"
            title="FP相談予約"
            description="予約の確認・調整"
          />
          <MenuCard
            href="/admin/events"
            title="イベント管理"
            description="パーティ・出欠管理"
          />
        </div>

        <footer className="mt-12 text-center text-sm text-gray-400">
          © Beautiful Days
        </footer>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: number;
  unit: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-lg p-6 shadow-sm border-l-4 ${
        alert ? "border-red-500" : "border-yellow-600"
      }`}
    >
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">
        {value.toLocaleString()}
        <span className="text-sm font-normal text-gray-500 ml-2">{unit}</span>
      </p>
    </div>
  );
}

function MenuCard({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        {badge && (
          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500">{description}</p>
    </Link>
  );
}

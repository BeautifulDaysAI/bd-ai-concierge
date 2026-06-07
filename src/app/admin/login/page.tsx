/**
 * 管理画面ログイン
 *
 * メールアドレスにマジックリンクを送る方式（パスワードレス）
 *
 * © Beautiful Days
 */

"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });

    setSubmitting(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-bd-black text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <p className="text-sm tracking-widest text-bd-gold font-bold mb-4">
          BEAUTIFUL DAYS × AI
        </p>
        <h1 className="text-3xl font-serif font-bold mb-2">
          管理画面ログイン
        </h1>
        <p className="text-gray-400 mb-8 text-sm">
          登録済みのメールアドレスにマジックリンクをお送りします。
        </p>

        {sent ? (
          <div className="bg-green-900/30 border border-green-700 rounded p-6">
            <p className="font-bold text-green-300 mb-2">
              📧 メールを送信しました
            </p>
            <p className="text-sm text-gray-300">
              {email} 宛にログインリンクをお送りしました。
              メールを開いてリンクをクリックしてください。
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@beautifuldays.co.jp"
                className="w-full bg-bd-charcoal border border-gray-700 rounded px-4 py-3 focus:border-bd-gold focus:outline-none"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-bd-gold hover:opacity-90 disabled:opacity-50 text-bd-black font-bold py-3 rounded transition"
            >
              {submitting ? "送信中..." : "マジックリンクを送る"}
            </button>
          </form>
        )}

        <p className="mt-8 text-xs text-gray-500 text-center">
          ※ アクセスできない場合は管理者にお問い合わせください
        </p>
      </div>
    </div>
  );
}

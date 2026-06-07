/**
 * トップページ
 *
 * © Beautiful Days
 */

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-bd-black text-white flex items-center justify-center p-8">
      <div className="max-w-2xl">
        <p className="text-sm tracking-widest text-bd-gold font-bold mb-4">
          BEAUTIFUL DAYS × AI
        </p>
        <h1 className="text-4xl md:text-6xl font-serif font-bold mb-4">
          判断するのではなく、
          <br />
          <span className="text-bd-gold">準備するAI。</span>
        </h1>
        <p className="text-gray-400 mb-8">
          会員様向け LINE AI コンシェルジュ。
        </p>
        <Link
          href="/admin"
          className="inline-block bg-bd-gold text-bd-black px-6 py-3 rounded font-bold hover:opacity-90 transition"
        >
          管理画面へ
        </Link>
      </div>
    </div>
  );
}

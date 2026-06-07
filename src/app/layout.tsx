import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beautiful Days AI Concierge",
  description: "Beautiful Days 会員様向け AI コンシェルジュ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dental Consult CRM",
  description: "치과 상담일지, 리콜, 동의율 리포트 관리 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

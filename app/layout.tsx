import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "새뜸365 매니저",
  description: "약국 운영을 돕는 앱 - 가격표 만들기",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 모든 화면에 같은 상단 메뉴를 붙인다. 컴퓨터가 어두운 모드여도 글씨가 잘 보이게 흰 바탕을 쓴다. */}
        <div className="flex min-h-screen flex-col bg-white text-neutral-900">
          <NavBar />
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}

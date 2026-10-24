import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import SWRegister from "@/components/SWRegister";
import "./globals.css";

// 全局字体：阿里妈妈方圆体 VF 可变字体（免费商用，wght 轴 200-700）
// 注：厂商原始文件的 STAT 表损坏（AxisIndex 越界）导致浏览器 OTS 拒绝，
// 此为剔除 STAT + instancer 固定 BEVL 轴后的修复版
const fangyuan = localFont({
  src: "./fonts/FangYuanTi-wght.woff2",
  variable: "--font-fangyuan",
  weight: "200 700",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "模力笔记 · 碎片信息速查库",
  description: "记录地址、项目路径、运行环境、常用网站等零碎信息，随时快速查阅和复制",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "模力笔记", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#101116" },
  ],
};

// 首屏前恢复主题，避免闪烁
const themeInit = `try{var t=localStorage.getItem('mn-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${fangyuan.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SWRegister />
        {children}
      </body>
    </html>
  );
}

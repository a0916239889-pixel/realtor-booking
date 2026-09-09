/**
 * 房產顧問 CIS — 前台亮色版（/card 名片頁 / 預約表單 / 成功頁，給客戶看）
 * 2026-09-09：改為**台灣房屋色系**，與官網 css/style.css 的 --twh-* 同一組色票，
 *   客戶從官網點進名片、再點進預約，一路看起來是同一個品牌。
 *   橘 #FF7403（主色 / CTA）＋ 深橘棕 #C35B07（文字與深底）＋ 暖棕黑 #3B261B（主文字）。
 * ⚠️ 舊版是天藍 #4EC4DC ＋ 琥珀 #F5A91D，已全數換掉（Booking.module.css 也一起換）。
 * ⚠️ 跟後台深色 admin/_components/cis.ts 分開（那是給系統擁有者久盯的深色）。
 */
export const RCIS = {
  sky: "#FF7403", // 台灣房屋橘（主色）
  skyDeep: "#C35B07", // 深橘棕（文字、深底、hover）
  skySoft: "#FFF0E5", // 淺橘底
  orange: "#FF7403", // CTA（與主色同一支，靠實心填滿拉出層級）
  orangeDeep: "#C35B07",
  orangeSoft: "#FFF6EE",
  ink: "#3B261B", // 深字（主文字）
  inkSoft: "#5A4437", // 次深字
  muted: "#7D6857", // 弱字
  bg: "#FFFFFF",
  bgSoft: "#FAF7F4",
  border: "#EEE3DA",
  line: "#F4EBE4",
  green: "#2BB673", // 成功 / 確認
  font: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',-apple-system,BlinkMacSystemFont,sans-serif",
  radius: 16,
  radiusSm: 10,
  shadow: "0 4px 20px rgba(59,38,27,0.08)",
  shadowLg: "0 12px 44px rgba(59,38,27,0.14)",
} as const;

// 業績溫度色（後台 + 通知共用判讀）
export const HEAT_TONE: Record<string, { label: string; emoji: string; color: string }> = {
  high: { label: "高溫", emoji: "🔥", color: "#C35B07" },
  mid: { label: "中溫", emoji: "🟡", color: "#FF7403" },
  low: { label: "低溫", emoji: "⚪", color: "#7D6857" },
};

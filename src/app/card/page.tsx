/**
 * /card — 律廷房產顧問電子名片門面頁(房產顧問 CIS,專業版)
 * 2026-06-19 改版:真照片 + 官方品牌 icon + 去 emoji + 精緻排版(系統擁有者:要更專業)。
 * robots noindex(個人名片頁、隱私)。
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { RCIS } from "./_cis";
import { SOCIAL, ABIN } from "./_links";
import { SITE_URL, DISCLOSURE } from "@/config/owner";
import { FacebookIcon, YoutubeIcon, LineIcon, InstagramIcon, PhoneIcon, MailIcon, PinIcon, CalendarIcon } from "./_icons";

const OG_IMAGE = `${SITE_URL}${ABIN.photoUrl}`;

export const metadata: Metadata = {
  title: `${ABIN.name}（${ABIN.alias}）‧ ${ABIN.title} | 預約諮詢`,
  description: `${ABIN.slogan} 線上預約律廷:買房 / 賣房 / 租賃 / 法律諮詢,一對一為你服務。`,
  robots: { index: false, follow: false },
  // OG 鐵律:名片的預覽圖要是本人照片,不可 fallback 到品牌促銷圖
  openGraph: {
    title: `${ABIN.name}（${ABIN.alias}）‧ ${ABIN.title}`,
    description: `${ABIN.slogan} 線上預約${ABIN.alias}、加 LINE 諮詢買賣租賃。`,
    url: `${SITE_URL}/card`,
    siteName: `${ABIN.name} ${ABIN.title}`,
    type: "profile",
    locale: "zh_TW",
    images: [{ url: OG_IMAGE, width: 460, height: 460, alt: ABIN.name }],
  },
  twitter: {
    card: "summary",
    title: `${ABIN.name}（${ABIN.alias}）‧ ${ABIN.title}`,
    description: `${ABIN.slogan}`,
    images: [OG_IMAGE],
  },
};

function PhotoCircle() {
  const size = 150;
  const shared: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    border: "5px solid #fff",
    boxShadow: "0 8px 26px rgba(28,45,58,0.18)",
  };
  if (ABIN.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={ABIN.photoUrl} alt={ABIN.name} width={size} height={size} style={{ ...shared, objectFit: "cover", objectPosition: "center" }} />
    );
  }
  return (
    <div style={{ ...shared, background: `linear-gradient(135deg,${RCIS.sky},${RCIS.skyDeep})`, color: "#fff", fontSize: 46, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      濱
    </div>
  );
}

function ContactRow({ icon, label, href }: { icon: React.ReactNode; label: string; href?: string }) {
  const inner = (
    <span style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 15, color: RCIS.inkSoft }}>
      <span style={{ color: RCIS.sky, display: "inline-flex" }}>{icon}</span>
      {label}
    </span>
  );
  return href ? (
    <a href={href} style={{ textDecoration: "none" }}>
      {inner}
    </a>
  ) : (
    inner
  );
}

function SocialBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  // 沒填網址就不要留一顆按不動的按鈕
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      style={{
        width: 50,
        height: 50,
        borderRadius: 14,
        background: RCIS.bgSoft,
        border: `1px solid ${RCIS.border}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </a>
  );
}

export default function CardPage() {
  return (
    <main style={{ minHeight: "100vh", background: `linear-gradient(180deg,${RCIS.skySoft},${RCIS.bgSoft})`, fontFamily: RCIS.font, color: RCIS.ink, padding: "32px 16px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ background: RCIS.bg, borderRadius: 22, boxShadow: RCIS.shadowLg, overflow: "hidden" }}>
          {/* cover */}
          {/* 原本這裡有一行品牌字，但置中的大頭照會壓到它（手機更明顯），
              而名字與頭銜下面已經完整寫了一次，就不重複 */}
          <div style={{ height: 92, background: `linear-gradient(120deg,${RCIS.sky},${RCIS.skyDeep})`, position: "relative" }} />

          {/* 照片 */}
          <div style={{ marginTop: -78, textAlign: "center", position: "relative", zIndex: 2 }}>
            <PhotoCircle />
          </div>

          {/* 名字 */}
          <div style={{ textAlign: "center", padding: "14px 26px 6px" }}>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: 0.5 }}>
              {ABIN.name}
              <span style={{ color: RCIS.muted, fontSize: 17, fontWeight: 500, marginLeft: 10 }}>{ABIN.alias}</span>
            </div>
            <div style={{ fontSize: 15, color: RCIS.inkSoft, marginTop: 6, fontWeight: 500 }}>{ABIN.title}</div>
            <div style={{ fontSize: 14, color: RCIS.muted, marginTop: 12, lineHeight: 1.7 }}>{ABIN.slogan}</div>
          </div>

          {/* CTA */}
          <div style={{ padding: "18px 26px 6px", display: "grid", gap: 11 }}>
            <Link href="/card/booking" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: RCIS.orange, color: RCIS.ink, fontSize: 17, fontWeight: 800, padding: "15px", borderRadius: 13, textDecoration: "none", boxShadow: "0 8px 20px rgba(245,169,29,0.3)" }}>
              <CalendarIcon size={20} color={RCIS.ink} />
              線上預約諮詢
            </Link>
            <a href={SOCIAL.line} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: "#06C755", color: RCIS.ink, fontSize: 16, fontWeight: 800, padding: "14px", borderRadius: 13, textDecoration: "none" }}>
              <LineIcon size={22} />
              加律廷 LINE
            </a>
          </div>

          {/* 聯絡 */}
          <div style={{ padding: "18px 26px", display: "grid", gap: 13, borderTop: `1px solid ${RCIS.line}`, marginTop: 14 }}>
            <ContactRow icon={<PhoneIcon size={18} />} label={ABIN.phone} href={`tel:${ABIN.phoneRaw}`} />
            <ContactRow icon={<MailIcon size={18} />} label={ABIN.email} href={`mailto:${ABIN.email}`} />
            <ContactRow icon={<PinIcon size={18} />} label={ABIN.address} />
          </div>

          {/* 社群 */}
          <div style={{ padding: "6px 26px 30px", borderTop: `1px solid ${RCIS.line}` }}>
            <div style={{ fontSize: 12.5, color: RCIS.muted, margin: "16px 0 13px", textAlign: "center", letterSpacing: 1 }}>追蹤律廷</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
              <SocialBtn href={SOCIAL.fb} label="Facebook">
                <FacebookIcon size={26} />
              </SocialBtn>
              <SocialBtn href={SOCIAL.yt} label="YouTube">
                <YoutubeIcon size={26} />
              </SocialBtn>
              <SocialBtn href={SOCIAL.ig} label="Instagram">
                <InstagramIcon size={26} />
              </SocialBtn>
            </div>
          </div>
        </div>
        {/* 不動產經紀業管理條例 §21 經紀業名稱、§22 經紀人簽章 —— 廣告性質的頁面必須載明 */}
        <div style={{ textAlign: "center", fontSize: 11.5, color: RCIS.muted, marginTop: 18, lineHeight: 1.8 }}>
          <div>{DISCLOSURE.agency}（{DISCLOSURE.branch}）</div>
          <div>{DISCLOSURE.broker}</div>
          <div>{DISCLOSURE.agent}</div>
          <div style={{ marginTop: 6 }}>© {ABIN.name}</div>
        </div>
      </div>
    </main>
  );
}

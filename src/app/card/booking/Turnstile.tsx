"use client";

/**
 * Cloudflare Turnstile 防機器人元件。
 *
 * 🔴 為什麼會有這個檔：原始碼的後端本來就會驗 Turnstile，但**前台完全沒有元件**
 *    （送出時不帶 token）。所以只要設了 TURNSTILE_SECRET_KEY，後端 line 247 那條
 *    「有 secret 但沒 token → 直接擋掉」就會讓**每一筆真預約都失敗**。
 *    README 卻叫你上線前一定要設 —— 照做就等於關掉預約功能。
 *    2026-09-09 補上前台元件，讓那組金鑰設下去是真的有用的。
 *
 * 沒設 NEXT_PUBLIC_TURNSTILE_SITE_KEY 時這個元件什麼都不畫，行為跟以前一樣。
 */
import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      language?: string;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** 有沒有設站點金鑰。沒設的話送出流程不必等 token。 */
export const turnstileEnabled = Boolean(SITE_KEY);

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile script failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(script);
  });
}

export default function Turnstile({
  onToken,
  onError,
}: {
  /** 拿到 token（或失效時拿到空字串）就回報給表單 */
  onToken: (token: string) => void;
  /** 載不起來時通知表單，讓它顯示「請改用 LINE 預約」而不是靜靜卡住 */
  onError?: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  // onToken 每次 render 都是新的函式，用 ref 存著，避免重畫小工具
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!SITE_KEY || !holder.current) return;
    let widgetId = "";
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId = window.turnstile.render(holder.current, {
          sitekey: SITE_KEY,
          language: "zh-TW",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            onErrorRef.current?.();
          },
        });
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // 小工具已被移除就算了
        }
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={holder} style={{ marginTop: 14 }} />;
}

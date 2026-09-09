/**
 * 後台登入的入口 —— 原始碼漏了這個檔。
 *
 * 🔴 2026-09-09 上線後才發現：`src/auth.ts` 把 next-auth 的 handlers 做好了，
 *    但整包程式沒有任何地方把它掛到 /api/auth/* 這個路徑上。
 *    結果 /api/auth/signin 是 404，後台永遠登不進去，Google 日曆也就永遠授權不了
 *    （授權那一步要先確認你是管理員）。
 *
 * 這個檔只做一件事：把 next-auth 的 GET/POST 接到 /api/auth/[...nextauth]。
 * 登入頁、Google 回呼、登出、查 session 全部走這裡。
 */
import { handlers } from "@/auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = handlers;

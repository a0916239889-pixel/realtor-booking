/**
 * POST/GET /api/appointment/outbox/run —— 把通知佇列跑一輪。
 *
 * 2026-09-09 補的（原始碼沒有這支，任務排進去就沒人執行了，見 appointment-outbox-worker.ts）。
 *
 * 預約成立時系統會自己在背景跑一次，所以正常情況不需要外部排程。
 * 這支是給「那一次剛好失敗要重試」「提醒信」用的，建議每 10 分鐘打一次：
 *   - 上線在 Vercel：用 vercel.json 的 crons
 *   - 本機：Windows 工作排程器打這個網址
 *
 * 要帶密鑰（用 APPOINTMENT_TOKEN_SECRET），否則任何人都能叫你的系統狂寄信。
 */
import { NextRequest, NextResponse } from "next/server";
import { runAppointmentOutbox } from "@/lib/appointment-outbox-worker";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.APPOINTMENT_OUTBOX_SECRET || process.env.APPOINTMENT_TOKEN_SECRET || "";
  if (!secret) return false; // 沒設密鑰就一律不給跑，不要開後門
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = req.nextUrl.searchParams.get("key") || "";
  // Vercel Cron 會帶自己的 header，也放行
  const isVercelCron = Boolean(req.headers.get("x-vercel-cron"));
  return isVercelCron || bearer === secret || query === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runAppointmentOutbox(30);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[outbox/run] 失敗:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

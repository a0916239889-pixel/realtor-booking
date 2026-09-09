/**
 * POST /api/appointment/google/disconnect — 解除 Google 綁定。
 *
 * 什麼時候要用：**授權範圍變了的時候**。
 * Google 的授權是一次給定的，之後程式多要一項權限（例如 2026-09-09 多要了「聯絡人」），
 * 舊的授權不會自己長出新權限，只會一直被擋。解除再重新授權一次就好。
 *
 * 只是把存起來的授權碼刪掉，不會動到日曆上已經建立的事件，也不會動到任何預約。
 * 🚨 只 admin。
 */
import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/admin-check";
import { disconnectGoogle } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await disconnectGoogle();
  return NextResponse.redirect(
    new URL("/admin/appointments?google=unbound", process.env.APPOINTMENT_BASE_URL || "http://localhost:3000"),
    { status: 303 },
  );
}

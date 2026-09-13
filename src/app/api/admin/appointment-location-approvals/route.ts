/**
 * /api/admin/appointment-location-approvals — 指定地點核准的一次性連結。
 *
 * 🔴 2026-09-13 補上，原始碼缺這支（同 `appointments/[id]/route.ts` 的說明）。
 *    缺的期間，後台「指定地點核准管理」面板整個是死的：清單永遠空白、
 *    按「建立一次性核准連結」只會跳「建立核准失敗」。
 *
 * 做什麼：客戶想約在店外（例如物件現場、某家咖啡廳），你同意之後在這裡開一張連結給他。
 * 那張連結綁死**地點、可預約的時間範圍、時長**，客戶不能自己改；
 * 還可以再綁他的電話或 Email，轉傳給別人也用不了。用過一次就失效。
 *
 *   GET    列出最近的核准紀錄
 *   POST   建立一張新的核准連結
 *   DELETE 撤銷一張還沒被用掉的
 *
 * 🚨 只 admin（`ADMIN_EMAILS` 白名單）。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  createCustomLocationApproval,
  listCustomLocationApprovals,
  revokeCustomLocationApproval,
  type AppointmentLocationApprovalRow,
  type MeetLocation,
} from "@/lib/appointment";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.APPOINTMENT_BASE_URL || "http://localhost:3000";

/** 後台面板只讓選這幾種時長，這裡要擋住繞過畫面直接送別的值。 */
const DURATIONS = [30, 60, 90, 120, 180];

function parseLocation(raw: string | null): MeetLocation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MeetLocation>;
    if (!parsed?.name) return null;
    return {
      name: String(parsed.name),
      address: String(parsed.address || ""),
      lat: typeof parsed.lat === "number" ? parsed.lat : null,
      lng: typeof parsed.lng === "number" ? parsed.lng : null,
      placeId: typeof parsed.placeId === "string" ? parsed.placeId : null,
      source: parsed.source === "google" ? "google" : "manual",
    };
  } catch {
    return null;
  }
}

/**
 * 給前端看的樣子。
 * 🔒 電話與 Email 在資料庫裡只存雜湊（hash），這裡也**只回「有沒有綁」**，不回內容 ——
 *    後台畫面沒必要再把客戶的電話印一次。
 */
function toListItem(row: AppointmentLocationApprovalRow) {
  return {
    id: row.id,
    customerHint: row.customer_hint,
    location: parseLocation(row.location_json),
    boundPhone: Boolean(row.customer_phone_hash),
    boundEmail: Boolean(row.customer_email_hash),
    allowedStartAt: row.allowed_start_at?.toISOString() || null,
    allowedEndAt: row.allowed_end_at?.toISOString() || null,
    approvedDurationMin: row.approved_duration_min,
    expiresAt: row.expires_at.toISOString(),
    usedAt: row.used_at?.toISOString() || null,
    usedAppointmentId: row.used_appointment_id,
    revokedAt: row.revoked_at?.toISOString() || null,
    revokeReason: row.revoke_reason,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "沒有權限，請用後台帳號登入。" }, { status: 403 });
  }
  const rows = await listCustomLocationApprovals(100);
  return NextResponse.json({ ok: true, approvals: rows.map(toListItem) });
}

export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "沒有權限，請用後台帳號登入。" }, { status: 403 });
  }
  const { email: adminEmail } = await getAdminCheckArgs();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawLocation = (body.location || {}) as Record<string, unknown>;

  const name = String(rawLocation.name || "").trim();
  const address = String(rawLocation.address || "").trim();
  if (!name) return NextResponse.json({ error: "地點名稱必填。" }, { status: 400 });
  if (!address) return NextResponse.json({ error: "完整地址必填 —— 客戶要靠它導航，不能只有店名。" }, { status: 400 });

  const start = body.allowedStartAt ? new Date(String(body.allowedStartAt)) : null;
  const end = body.allowedEndAt ? new Date(String(body.allowedEndAt)) : null;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "可預約的起始與截止時間都必填。" }, { status: 400 });
  }
  if (end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: "截止時間必須晚於起始時間。" }, { status: 400 });
  }
  if (end.getTime() <= Date.now()) {
    return NextResponse.json({ error: "截止時間已經過了，客戶會拿到一張不能用的連結。" }, { status: 400 });
  }

  const approvedDurationMin = Number(body.approvedDurationMin);
  if (!DURATIONS.includes(approvedDurationMin)) {
    return NextResponse.json({ error: "核准時長不正確。" }, { status: 400 });
  }

  const lat = typeof rawLocation.lat === "number" && Number.isFinite(rawLocation.lat) ? rawLocation.lat : null;
  const lng = typeof rawLocation.lng === "number" && Number.isFinite(rawLocation.lng) ? rawLocation.lng : null;
  const placeId = rawLocation.placeId ? String(rawLocation.placeId).slice(0, 200) : null;

  const created = await createCustomLocationApproval({
    customerHint: typeof body.customerHint === "string" ? body.customerHint : null,
    createdBy: adminEmail,
    location: {
      name: name.slice(0, 120),
      address: address.slice(0, 200),
      lat,
      lng,
      placeId,
      // 有 Google Place ID 才算是從地圖挑的，其餘都是手打的地址
      source: placeId ? "google" : "manual",
    },
    customerPhone: typeof body.customerPhone === "string" ? body.customerPhone : null,
    customerEmail: typeof body.customerEmail === "string" ? body.customerEmail : null,
    allowedStartAt: start,
    allowedEndAt: end,
    approvedDurationMin,
  });

  console.log(`[admin/location-approvals] ${adminEmail} 建立核准 ${created.id} — ${name}`);
  return NextResponse.json({
    ok: true,
    id: created.id,
    // 連結長相要跟前台 BookingForm.tsx:360 讀的參數名一致（location_approval）
    url: `${BASE_URL}/card/booking?location_approval=${encodeURIComponent(created.token)}`,
    expiresAt: created.expiresAt.toISOString(),
  });
}

export async function DELETE(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "沒有權限，請用後台帳號登入。" }, { status: 403 });
  }
  const { email: adminEmail } = await getAdminCheckArgs();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "少了要撤銷的核准編號。" }, { status: 400 });

  const revoked = await revokeCustomLocationApproval(
    id,
    typeof body.reason === "string" ? body.reason : null,
  );
  if (!revoked) {
    return NextResponse.json({ error: "撤銷失敗 —— 這張可能已經被客戶用掉了，或先前就撤銷過。" }, { status: 409 });
  }
  console.log(`[admin/location-approvals] ${adminEmail} 撤銷核准 ${id}`);
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/appointments/[id] — 後台那一排動作按鈕的接收端。
 *
 * 🔴 2026-09-13 補上。原始碼裡**整個 `src/app/api/admin/` 目錄都不存在** ——
 *    前端 `AppointmentActions.tsx:95` 一直在打這個網址，每一次都回 404，
 *    而且前端拿不到 JSON 就顯示「操作失敗」或乾脆沒反應，所以後台等於唯讀：
 *    看得到資料，標記已聯絡／已到場／標記完成／改期／取消／存佣金全部按不動。
 *    跟 2026-09-09 發現「漏了 `/api/auth/[...nextauth]`」是同一個病：那包 zip 本來就缺檔。
 *
 * 🪤 走主網域要能通，`cc/netlify.toml` 必須有一條 `/api/admin/*` 的 status=200 代理，
 *    不然請求會掉進官網的靜態檔案裡。
 *
 * 設計上刻意跟客戶自助的 `/api/appointment/manage` 對齊：
 * 同樣先改資料庫、再把行事曆與通知丟進 `appointment_outbox` 背景佇列，
 * 不在請求裡直接寄信或打 Google（[[learning_雲端背景工作會被砍掉]]）。
 * 排完會用 runAppointmentOutboxInBackground() 立刻踢一下佇列，按下去幾秒內就寄出、
 * 不用等每 2 分鐘的排程；就算這一下沒跑完，排程也會接手（它只是保險，不是唯一路徑）。
 *
 * 回傳格式是前端定好的：
 *   成功         → 200 { ok: true, notice }
 *   存了但沒排進佇列 → 503 { saved: true, notice }   ← 前端顯示黃字警告，不會誤以為全失敗
 *   失敗         → 4xx/5xx { error }
 *
 * 🚨 只 admin（`ADMIN_EMAILS` 白名單）。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  AppointmentSlotConflictError,
  LEGACY_DEFAULT_DURATION_MIN,
  confirmPendingAppointment,
  createAppointmentFollowup,
  enqueueAppointmentOutbox,
  getAppointment,
  isSlotTaken,
  setAppointmentSlot,
  setAppointmentStatus,
  updateAppointmentOperations,
} from "@/lib/appointment";
import { formatSlotRangeTw } from "@/lib/appointment-notify";
import { runAppointmentOutboxInBackground } from "@/lib/appointment-outbox-worker";
import { getAdminCheckArgs, isCurrentUserAdmin } from "@/lib/admin-check";
import { isGoogleConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

type Appointment = NonNullable<Awaited<ReturnType<typeof getAppointment>>>;

/** 這些值必須跟 AppointmentActions.tsx 下拉選單裡的 value 一模一樣，多一個少一個都會存不進去。 */
const ATTENDANCE = ["pending", "confirmed", "arrived", "no_show"] as const;
const OUTCOME = ["none", "hot", "nurture", "unqualified", "closed_won", "closed_lost"] as const;
const CONTACT = ["uncontacted", "contacted", "waiting_customer", "followup_due", "closed"] as const;

function pickEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const text = typeof value === "string" ? value : "";
  return (allowed as readonly string[]).includes(text) ? (text as T[number]) : null;
}

/** 佣金：允許 null（清空），其餘必須是 0 以上的有限數字。上限擋明顯打錯的位數。 */
function pickMoney(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return { ok: false };
  return { ok: true, value: Math.round(n) };
}

function slotEnd(appt: Appointment): Date {
  const start = new Date(appt.slot_at);
  return appt.slot_end_at
    ? new Date(appt.slot_end_at)
    : new Date(start.getTime() + LEGACY_DEFAULT_DURATION_MIN * 60_000);
}

/** 「存好了，但背景任務沒排進去」—— 這種半成功一定要講清楚，不能混在成功裡。 */
function savedButNotQueued(notice: string) {
  return NextResponse.json({ saved: true, notice }, { status: 503 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: "沒有權限，請用後台帳號登入。" }, { status: 403 });
  }
  const { email: adminEmail } = await getAdminCheckArgs();
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  let appt = await getAppointment(id);
  if (!appt) return NextResponse.json({ error: "找不到這筆預約。" }, { status: 404 });

  const audit = (note: string) => console.log(`[admin/appointments] ${adminEmail} ${action} ${id} — ${note}`);

  // ── 後台確認預約 ───────────────────────────────────────────────
  if (action === "confirm") {
    if (appt.status !== "pending_confirmation") {
      return NextResponse.json({ error: "這筆預約目前不是「待客戶確認」，不用再確認。" }, { status: 409 });
    }
    let confirmed = await confirmPendingAppointment(appt.id);
    if (!confirmed) {
      // 保留期限已過。店東要不要硬確認，取決於那個時段有沒有被別人搶走 ——
      // 沒被搶走就讓他確認（他本來就是主人），被搶走就一定要擋，否則會變成雙約。
      if (await isSlotTaken(new Date(appt.slot_at), appt.id)) {
        return NextResponse.json(
          { error: "保留期限已過，而且這個時段已經被另一筆預約佔走了。請改期到別的時間，不要硬確認。" },
          { status: 409 },
        );
      }
      await setAppointmentStatus(appt.id, "confirmed");
      await updateAppointmentOperations({ id: appt.id, attendanceStatus: "confirmed" });
      confirmed = true;
      audit("保留期限已過但時段仍空著，由後台強制確認");
    }
    appt = (await getAppointment(appt.id)) || appt;
    try {
      await enqueueConfirmationTasks(appt);
    } catch (error) {
      console.error("[admin/appointments] confirm enqueue failed:", error);
      return savedButNotQueued("預約已確認，但行事曆與客戶通知沒排進佇列。請重新整理再試一次。");
    }
    runAppointmentOutboxInBackground();
    return NextResponse.json({ ok: true, status: "confirmed", notice: "已確認預約。行事曆與客戶通知已排入背景處理，幾秒內完成。" });
  }

  // ── 標記完成 ─────────────────────────────────────────────────
  if (action === "complete") {
    if (appt.status !== "confirmed") {
      return NextResponse.json({ error: "只有已確認的預約可以標記完成。" }, { status: 409 });
    }
    await setAppointmentStatus(appt.id, "completed");
    audit("標記完成");
    return NextResponse.json({ ok: true, status: "completed", notice: "已標記完成。跟進與成交欄位都還在，可以繼續填。" });
  }

  // ── 取消預約 ─────────────────────────────────────────────────
  if (action === "cancel") {
    if (appt.status === "cancelled") {
      return NextResponse.json({ error: "這筆已經是取消狀態了。" }, { status: 409 });
    }
    const notifyCustomer = body.notifyCustomer !== false;
    await setAppointmentStatus(appt.id, "cancelled");
    appt = (await getAppointment(appt.id)) || { ...appt, status: "cancelled" };
    audit(notifyCustomer ? "取消並通知客戶" : "取消，不通知客戶");
    try {
      await Promise.all([
        ...(isGoogleConfigured() || appt.google_event_id
          ? [
              enqueueAppointmentOutbox({
                appointmentId: appt.id,
                taskType: "calendar_cancel" as const,
                dedupeKey: `appointment:${appt.id}:calendar-cancel`,
              }),
            ]
          : []),
        enqueueAppointmentOutbox({
          appointmentId: appt.id,
          taskType: "notify_cancel",
          dedupeKey: `appointment:${appt.id}:cancel-notify`,
          payload: { notifyCustomer, notifyAdmin: true },
        }),
      ]);
    } catch (error) {
      console.error("[admin/appointments] cancel enqueue failed:", error);
      return savedButNotQueued("預約已取消、時段已釋出，但取消通知沒排進佇列。客戶可能還不知道，請直接聯絡他。");
    }
    runAppointmentOutboxInBackground();
    return NextResponse.json({
      ok: true,
      status: "cancelled",
      notice: notifyCustomer
        ? "已取消，時段已釋出。取消通知已排入佇列。"
        : "已取消，時段已釋出。依你的勾選，這次沒有通知客戶。",
    });
  }

  // ── 標記已聯絡 ───────────────────────────────────────────────
  if (action === "mark_contacted") {
    await updateAppointmentOperations({ id: appt.id, contactStatus: "contacted" });
    audit("標記已聯絡");
    return NextResponse.json({ ok: true, notice: "已標記為已聯絡。" });
  }

  // ── 已到場 / 未到場 ──────────────────────────────────────────
  if (action === "set_attendance") {
    const attendanceStatus = pickEnum(body.attendanceStatus, ATTENDANCE);
    if (!attendanceStatus) return NextResponse.json({ error: "出席狀態不正確。" }, { status: 400 });
    await updateAppointmentOperations({ id: appt.id, attendanceStatus });
    audit(`出席狀態改為 ${attendanceStatus}`);
    return NextResponse.json({
      ok: true,
      notice: attendanceStatus === "arrived" ? "已標記為已到場。" : attendanceStatus === "no_show" ? "已標記為未到場。" : "出席狀態已更新。",
    });
  }

  // ── 儲存案件進度（跟進狀態／佣金／備註）──────────────────────
  if (action === "save_operations") {
    const attendanceStatus = pickEnum(body.attendanceStatus, ATTENDANCE);
    const outcomeStatus = pickEnum(body.outcomeStatus, OUTCOME);
    const contactStatus = pickEnum(body.contactStatus, CONTACT);
    if (!attendanceStatus || !outcomeStatus || !contactStatus) {
      return NextResponse.json({ error: "下拉選單的值不正確，請重新整理頁面再試。" }, { status: 400 });
    }
    const estimated = pickMoney(body.estimatedCommission);
    const actual = pickMoney(body.actualCommission);
    if (!estimated.ok || !actual.ok) {
      return NextResponse.json({ error: "佣金必須是 0 以上的數字。" }, { status: 400 });
    }
    let nextFollowupAt: Date | null = null;
    if (body.nextFollowupAt) {
      const parsed = new Date(String(body.nextFollowupAt));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "跟進日期格式不正確。" }, { status: 400 });
      }
      nextFollowupAt = parsed;
    }
    await updateAppointmentOperations({
      id: appt.id,
      attendanceStatus,
      outcomeStatus,
      contactStatus,
      nextFollowupAt,
      outcomeNote: typeof body.outcomeNote === "string" ? body.outcomeNote : "",
      estimatedCommission: estimated.value,
      actualCommission: actual.value,
      caseReference: typeof body.caseReference === "string" ? body.caseReference : "",
    });
    audit(`儲存案件進度（結果 ${outcomeStatus}）`);
    return NextResponse.json({ ok: true, notice: "案件進度已儲存。" });
  }

  // ── 建立跟進任務 ─────────────────────────────────────────────
  if (action === "create_followup") {
    const followup = await createAppointmentFollowup(appt);
    audit("建立跟進任務");
    return NextResponse.json({ ok: true, followupId: followup?.id || "", notice: "跟進任務已建立。" });
  }

  // ── 重排客戶確認通知 ─────────────────────────────────────────
  if (action === "resend_customer_confirmation") {
    if (!appt.email) {
      return NextResponse.json({ error: "這筆預約沒有留 Email，寄不出去。" }, { status: 409 });
    }
    // 🪤 佇列裡「已完成」的任務不會再跑一次（enqueueAppointmentOutbox 的 ON DUPLICATE KEY 會保留 completed），
    //    所以 dedupe key 要帶時間。取到「分」就好：連點兩下只會排一封，真的要重寄等一分鐘再按。
    const bucket = new Date().toISOString().slice(0, 16);
    try {
      await enqueueAppointmentOutbox({
        appointmentId: appt.id,
        taskType: "notify_new",
        dedupeKey: `appointment:${appt.id}:resend-customer:${bucket}`,
        // force 讓背景工作跳過「這封已經寄成功過就不用再寄」的判斷 —— 這顆按鈕的用意就是「再寄一次」。
        // 只寄客戶那一封，不要再吵你自己一次。
        payload: {
          phase: appt.status === "pending_confirmation" ? "confirmation_request" : "confirmed",
          force: true,
          notifyAdmin: false,
          notifyCustomer: true,
        },
      });
    } catch (error) {
      console.error("[admin/appointments] resend enqueue failed:", error);
      return NextResponse.json({ error: "沒能排進發送佇列，請稍後再試。" }, { status: 503 });
    }
    audit("重排客戶確認通知");
    runAppointmentOutboxInBackground();
    return NextResponse.json({ ok: true, notice: `客戶確認通知已排入佇列，幾秒內寄到 ${appt.email}。` });
  }

  // ── 改期 ─────────────────────────────────────────────────────
  if (action === "reschedule") {
    if (appt.status !== "confirmed" && appt.status !== "pending_confirmation") {
      return NextResponse.json({ error: "只有進行中的預約可以改期。" }, { status: 409 });
    }
    const slotAt = new Date(String(body.slotIso || ""));
    if (Number.isNaN(slotAt.getTime())) {
      return NextResponse.json({ error: "改期時間格式不正確。" }, { status: 400 });
    }
    const oldStart = new Date(appt.slot_at);
    const oldEnd = slotEnd(appt);
    if (Math.abs(slotAt.getTime() - oldStart.getTime()) < 1000) {
      return NextResponse.json({ error: "新時間和原本一樣，沒有改到。" }, { status: 400 });
    }
    const rawDuration = body.durationMin;
    const durationMin =
      rawDuration === null || rawDuration === undefined
        ? Math.round((oldEnd.getTime() - oldStart.getTime()) / 60_000)
        : Number(rawDuration);
    if (!Number.isFinite(durationMin) || durationMin < 15 || durationMin > 480) {
      return NextResponse.json({ error: "預約時長不正確。" }, { status: 400 });
    }
    const slotEndAt = new Date(slotAt.getTime() + durationMin * 60_000);
    const notifyCustomer = body.notifyCustomer !== false;

    try {
      // 後台改期刻意**不檢查營業時段、也不檢查你自己的 Google 行事曆有沒有事** ——
      // 店東本來就有權把客戶排在任何時間，擋他等於幫倒忙。
      // 但「同一個時段被另一個客戶佔走」還是一定擋（setAppointmentSlot 會搶 slot lock，撞了丟 409）。
      await setAppointmentSlot(appt.id, slotAt, slotEndAt);
    } catch (error) {
      if (error instanceof AppointmentSlotConflictError) {
        return NextResponse.json({ error: "這個時段已經有另一筆預約了，換個時間。" }, { status: 409 });
      }
      throw error;
    }
    appt = (await getAppointment(appt.id)) || { ...appt, slot_at: slotAt, slot_end_at: slotEndAt };
    audit(`改期至 ${slotAt.toISOString()}`);

    try {
      await Promise.all([
        ...(isGoogleConfigured() || appt.google_event_id
          ? [
              enqueueAppointmentOutbox({
                appointmentId: appt.id,
                taskType: appt.google_event_id ? ("calendar_reschedule" as const) : ("calendar_create" as const),
                dedupeKey: `appointment:${appt.id}:calendar:${slotAt.toISOString()}`,
                payload: {
                  previousSlotTw: formatSlotRangeTw(oldStart, oldEnd),
                  previousSlotAt: oldStart.toISOString(),
                  previousSlotEndAt: oldEnd.toISOString(),
                },
              }),
            ]
          : []),
        enqueueAppointmentOutbox({
          appointmentId: appt.id,
          taskType: "notify_reschedule",
          dedupeKey: `appointment:${appt.id}:reschedule-notify:${slotAt.toISOString()}`,
          payload: {
            notifyCustomer,
            notifyAdmin: true,
            previousSlotTw: formatSlotRangeTw(oldStart, oldEnd),
            previousSlotAt: oldStart.toISOString(),
            previousSlotEndAt: oldEnd.toISOString(),
          },
        }),
      ]);
    } catch (error) {
      console.error("[admin/appointments] reschedule enqueue failed:", error);
      return savedButNotQueued(
        `時間已改成 ${formatSlotRangeTw(slotAt, slotEndAt)}，但行事曆與客戶通知沒排進佇列。客戶可能還不知道，請直接聯絡他。`,
      );
    }
    runAppointmentOutboxInBackground();
    return NextResponse.json({
      ok: true,
      notice: notifyCustomer
        ? `已改期到 ${formatSlotRangeTw(slotAt, slotEndAt)}。行事曆與客戶通知已排入背景處理。`
        : `已改期到 ${formatSlotRangeTw(slotAt, slotEndAt)}。依你的勾選，這次沒有通知客戶。`,
    });
  }

  return NextResponse.json({ error: `不支援的操作：${action || "（空白）"}` }, { status: 400 });
}

/** 確認預約後要補的兩件事，跟客戶自助確認走同一組 dedupe key，不會重複建事件或重複寄信。 */
async function enqueueConfirmationTasks(appt: Appointment): Promise<void> {
  await Promise.all([
    ...(isGoogleConfigured()
      ? [
          enqueueAppointmentOutbox({
            appointmentId: appt.id,
            taskType: "calendar_create" as const,
            dedupeKey: `appointment:${appt.id}:calendar-create`,
          }),
        ]
      : []),
    enqueueAppointmentOutbox({
      appointmentId: appt.id,
      taskType: "notify_new",
      dedupeKey: `appointment:${appt.id}:confirmed-notify`,
      payload: { phase: "confirmed" },
    }),
  ]);
}

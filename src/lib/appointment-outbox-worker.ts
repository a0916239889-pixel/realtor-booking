/**
 * 通知佇列的執行者 —— 原始碼缺的那一塊。
 *
 * 🔴 2026-09-09 補上。原版把「寄通知」「建日曆事件」排進 appointment_outbox，
 *    但整包程式裡**沒有任何地方**呼叫 listDueAppointmentOutbox / claimAppointmentOutbox，
 *    也沒人呼叫 notifyNewAppointment。結果就是：預約會成立、任務會排進去，
 *    然後永遠沒人執行 —— 系統擁有者收不到通知，客戶也收不到確認信。
 *    （原作者應該是另外自己跑排程打某個端點，那段沒放進這包開源檔。）
 *
 * 這個檔負責把佇列撈出來真的做掉，兩個地方會呼叫它：
 *   1. 預約成立後立刻在背景跑一次（客人按下送出 → 幾秒內就收到信）
 *   2. /api/appointment/outbox/run 給排程定時打，處理重試與提醒
 */
import { after } from "next/server";
import {
  claimAppointmentOutbox,
  finishAppointmentOutbox,
  getAppointment,
  intentLabel,
  listDueAppointmentOutbox,
  meetTypeLabel,
  setAppointmentGoogleEvent,
  LEGACY_DEFAULT_DURATION_MIN,
  type AppointmentOutboxRow,
  type MeetLocation,
} from "@/lib/appointment";
import {
  appointmentLocationText,
  formatSlotRangeTw,
  lineAddFriendUrl,
  notifyAppointmentChange,
  notifyNewAppointment,
  type NotifyInput,
} from "@/lib/appointment-notify";
import { createGoogleContact } from "@/lib/google-contacts";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarDisplaySettings,
  isGoogleBound,
} from "@/lib/google-calendar";
import { renderCalendarTitle } from "@/lib/appointment-calendar-display";

type AppointmentLike = Awaited<ReturnType<typeof getAppointment>>;

function parseIntent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseMeetLocation(raw: unknown): MeetLocation | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as MeetLocation;
    return parsed && typeof parsed.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function toNotifyInput(appt: NonNullable<AppointmentLike>): NotifyInput {
  const start = new Date(appt.slot_at);
  const end = appt.slot_end_at
    ? new Date(appt.slot_end_at)
    : new Date(start.getTime() + LEGACY_DEFAULT_DURATION_MIN * 60_000);
  return {
    id: appt.id,
    name: appt.name,
    gender: appt.gender,
    phone: appt.phone,
    email: appt.email,
    lineId: appt.line_id,
    meetType: appt.meet_type,
    meetLocation: parseMeetLocation(appt.meet_location),
    intent: parseIntent(appt.intent),
    urgency: appt.urgency,
    note: appt.note,
    slotAt: start,
    slotEndAt: end,
    aiHeat: appt.ai_heat,
    aiSuggestion: appt.ai_suggestion,
    meetUrl: appt.meet_url,
    status: appt.status,
  };
}

function readPhase(row: AppointmentOutboxRow): "confirmation_request" | "confirmed" | undefined {
  if (!row.payload_json) return undefined;
  try {
    const payload = JSON.parse(row.payload_json) as { phase?: string };
    return payload.phase === "confirmation_request" || payload.phase === "confirmed"
      ? payload.phase
      : undefined;
  } catch {
    return undefined;
  }
}

async function runTask(row: AppointmentOutboxRow): Promise<void> {
  const appt = await getAppointment(row.appointment_id);
  if (!appt) return; // 預約已被刪掉 → 這個任務沒意義，當作做完

  switch (row.task_type) {
    case "notify_new":
      await notifyNewAppointment(toNotifyInput(appt), {
        phase: readPhase(row),
        onlyPending: true,
        notifyAdmin: true,
        notifyCustomer: true,
      });
      return;

    case "notify_reschedule":
    case "notify_cancel":
      await notifyAppointmentChange(
        toNotifyInput(appt),
        { type: row.task_type === "notify_cancel" ? "cancel" : "reschedule" },
        { onlyPending: true, notifyAdmin: true, notifyCustomer: true },
      );
      return;

    case "calendar_create":
    case "calendar_reschedule": {
      // 沒綁 Google 日曆就當作不用做（之後綁定，新的預約自然會排新任務）
      if (!(await isGoogleBound())) return;
      const input = toNotifyInput(appt);
      const display = await getCalendarDisplaySettings();
      const intents = input.intent.map((key) => intentLabel(key)).join("、");
      const summary = renderCalendarTitle(display.titleTemplate, {
        name: appt.name,
        phone: appt.phone,
        meetTypeLabel: meetTypeLabel(appt.meet_type),
        intent: intents,
        purpose: intents,
      });
      // 舊事件先刪掉再建，避免改期後日曆上留兩筆
      if (appt.google_event_id) {
        await deleteCalendarEvent(appt.google_event_id).catch(() => {});
      }
      const created = await createCalendarEvent({
        summary,
        description: [
          `姓名：${appt.name}`,
          appt.phone ? `電話：${appt.phone}` : "",
          appt.email ? `Email：${appt.email}` : "",
          // 手機上點得到的加好友連結，會面前想先聯絡他不用再回頭翻信
          appt.line_id ? `LINE：${appt.line_id}` : "",
          appt.line_id && lineAddFriendUrl(appt.line_id)
            ? `加他 LINE：${lineAddFriendUrl(appt.line_id)}`
            : "",
          `見面方式：${meetTypeLabel(appt.meet_type)}`,
          intents ? `需求：${intents}` : "",
          appt.note ? `備註：${appt.note}` : "",
          `時間：${formatSlotRangeTw(input.slotAt, input.slotEndAt)}`,
        ]
          .filter(Boolean)
          .join("\n"),
        startIso: input.slotAt.toISOString(),
        endIso: (input.slotEndAt ?? input.slotAt).toISOString(),
        withMeet: appt.meet_type === "video",
        location: appointmentLocationText(appt.meet_type, input.meetLocation),
        attendeeEmail: process.env.APPOINTMENT_GOOGLE_INVITE_CUSTOMER === "1" ? appt.email : null,
        attendeeName: appt.name,
      });
      if (created) await setAppointmentGoogleEvent(appt.id, created.eventId, created.meetUrl);
      return;
    }

    case "calendar_cancel":
      if (!(await isGoogleBound()) || !appt.google_event_id) return;
      await deleteCalendarEvent(appt.google_event_id);
      await setAppointmentGoogleEvent(appt.id, null, null);
      return;

    // 把客戶寫進 Google 聯絡人 →（手機有登入 Google 的話）通訊錄自動就有，來電顯示名字
    case "contact_create": {
      if (!(await isGoogleBound())) return;
      const input = toNotifyInput(appt);
      const resourceName = await createGoogleContact({
        name: appt.name,
        phone: appt.phone,
        email: appt.email,
        lineId: appt.line_id,
        note: appt.note,
        slotText: formatSlotRangeTw(input.slotAt, input.slotEndAt),
        intentText: input.intent.map((key) => intentLabel(key)).join("、"),
      });
      // 加不成不算失敗（詳見 google-contacts.ts）：重試只會生出更多重複的聯絡人
      if (resourceName) console.log(`[outbox] 已加入 Google 聯絡人：${appt.name}`);
      return;
    }

    // AI 判讀與行銷追蹤都是選配，沒接就直接標記完成，不要卡在佇列裡重試
    case "ai_grade":
    case "analytics_ga4":
    case "analytics_meta":
      return;

    default:
      return;
  }
}

export type OutboxRunResult = { picked: number; done: number; failed: number };

/** 撈出到期的任務並執行。回傳這一輪處理了幾筆。 */
export async function runAppointmentOutbox(limit = 20): Promise<OutboxRunResult> {
  const rows = await listDueAppointmentOutbox(limit);
  const result: OutboxRunResult = { picked: rows.length, done: 0, failed: 0 };

  for (const row of rows) {
    // 搶不到代表別的執行緒正在做這筆，跳過
    if (!(await claimAppointmentOutbox(row.id))) continue;
    try {
      await runTask(row);
      await finishAppointmentOutbox(row.id);
      result.done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[outbox] ${row.task_type} 失敗（${row.appointment_id}）:`, message);
      // 交給 finishAppointmentOutbox 排指數退避重試，8 次後才放棄
      await finishAppointmentOutbox(row.id, message);
      result.failed += 1;
    }
  }
  return result;
}

/**
 * 給「預約剛成立」用：背景跑一輪，不擋住 API 回應，也不會讓寄信失敗害預約失敗。
 *
 * 🔴 2026-09-09 上線後才發現：本機開發時直接 `void runAppointmentOutbox()` 會跑完，
 *    但部署到 Netlify（雲端函式）上，回應一送出去，那個函式就被**凍結／回收**，
 *    還沒寄的信就永遠停在 pending。實測第一筆線上預約的 notify_new 就卡住沒動。
 *    改用 Next.js 的 after()：它會告訴平台「回應送出後還有事要做，先別關」。
 *    另外 netlify/functions/outbox-cron.mts 每 2 分鐘再掃一次當保險（重試也靠它）。
 */
export function runAppointmentOutboxInBackground(limit = 10): void {
  const run = () =>
    runAppointmentOutbox(limit).catch((error) => {
      console.error("[outbox] 背景執行失敗:", error);
    });

  try {
    // after() 只能在請求生命週期內呼叫；不在的話會丟錯，退回原本的做法。
    after(run);
  } catch {
    void run();
  }
}

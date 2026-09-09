/**
 * 每 2 分鐘去敲一次通知佇列 —— 這是「客戶約了你、你卻沒收到通知」的最後一道保險。
 *
 * 為什麼需要它：
 * 1. 寄信失敗（Resend 忙線、網路抖一下）要退避重試，總得有人來按下重試。
 * 2. 提醒信是排在未來時間的，沒有排程就永遠不會到期執行。
 * 3. 雲端函式回應送出後就被回收，預約當下那一輪背景任務不一定跑得完。
 *
 * 它只是帶著金鑰去打自己的 /api/appointment/outbox/run，真正的邏輯在那裡。
 * 打自己的 netlify 網址（process.env.URL），不繞官網的代理，少一層會壞的東西。
 */
export default async () => {
  const base = (process.env.URL || process.env.APPOINTMENT_BASE_URL || "").replace(/\/+$/, "");
  const secret = process.env.APPOINTMENT_OUTBOX_SECRET || process.env.APPOINTMENT_TOKEN_SECRET;

  if (!base || !secret) {
    console.error("[outbox-cron] 少了 URL 或金鑰，這一輪跳過");
    return;
  }

  try {
    const res = await fetch(`${base}/api/appointment/outbox/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const text = await res.text();
    // 沒東西可做是常態，只有真的做了事或出錯才留紀錄，免得日誌被洗版
    if (!res.ok) {
      console.error(`[outbox-cron] ${res.status} ${text.slice(0, 300)}`);
    } else if (!text.includes('"picked":0')) {
      console.log(`[outbox-cron] ${text.slice(0, 300)}`);
    }
  } catch (error) {
    console.error("[outbox-cron] 打不到佇列端點:", error);
  }
};

export const config = {
  schedule: "*/2 * * * *",
};

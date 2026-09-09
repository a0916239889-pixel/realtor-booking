/**
 * 把預約的客戶自動寫進 Google 聯絡人。
 *
 * 為什麼是 Google 聯絡人而不是「手機通訊錄」：
 * 沒有任何系統可以從網路上直接寫進你手機裡的通訊錄。
 * 但 Android／iPhone 只要登入了 Google 帳號，通訊錄本來就跟 Google 聯絡人同步 ——
 * 寫進 Google，手機那邊過幾分鐘自己就有了。這是唯一走得通的路。
 *
 * 所有新客戶都會被丟進「線上預約客戶」這個標籤，跟你原本的通訊錄分得開，
 * 哪天想整批清掉或匯出都是一鍵的事。
 *
 * 用的是跟日曆同一次的 Google 授權（scope 多要了 contacts），不需要另外登入。
 */
import { getAccessToken, isGoogleBound } from "@/lib/google-calendar";

const PEOPLE_API = "https://people.googleapis.com/v1";
const GROUP_NAME = "線上預約客戶";

/** 找不到就開一個「線上預約客戶」標籤，回傳它的 resourceName。失敗回 null（不影響建立聯絡人）。 */
let groupCache: { name: string; exp: number } | null = null;
async function ensureContactGroup(token: string): Promise<string | null> {
  if (groupCache && groupCache.exp > Date.now()) return groupCache.name;
  try {
    const listRes = await fetch(`${PEOPLE_API}/contactGroups?pageSize=200`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (listRes.ok) {
      const data = (await listRes.json()) as {
        contactGroups?: Array<{ resourceName?: string; name?: string; formattedName?: string }>;
      };
      const hit = data.contactGroups?.find(
        (g) => g.name === GROUP_NAME || g.formattedName === GROUP_NAME,
      );
      if (hit?.resourceName) {
        groupCache = { name: hit.resourceName, exp: Date.now() + 3600_000 };
        return hit.resourceName;
      }
    }

    const createRes = await fetch(`${PEOPLE_API}/contactGroups`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contactGroup: { name: GROUP_NAME } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!createRes.ok) {
      console.error("[google-contacts] 建立標籤失敗:", (await createRes.text()).slice(0, 200));
      return null;
    }
    const created = (await createRes.json()) as { resourceName?: string };
    if (!created.resourceName) return null;
    groupCache = { name: created.resourceName, exp: Date.now() + 3600_000 };
    return created.resourceName;
  } catch (error) {
    console.error("[google-contacts] ensureContactGroup 例外:", error);
    return null;
  }
}

/** 只留數字，用來比對「是不是同一支手機」（客戶這次填 0912-345-678、上次填 0912345678） */
function digits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

/**
 * 這支電話是不是已經在聯絡人裡了。
 * 查不到或查詢壞掉都回 false —— 寧可多一筆重複，也不要漏掉一個客戶。
 */
async function alreadyExists(token: string, phone: string): Promise<boolean> {
  const target = digits(phone);
  if (!target) return false;
  try {
    // People API 的搜尋要先「暖機」（送一次空查詢建索引），官方文件明講的，不做會查不到剛加的人
    await fetch(`${PEOPLE_API}/people:searchContacts?query=&readMask=phoneNumbers`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    const res = await fetch(
      `${PEOPLE_API}/people:searchContacts?query=${encodeURIComponent(phone)}&readMask=names,phoneNumbers&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as {
      results?: Array<{ person?: { phoneNumbers?: Array<{ value?: string }> } }>;
    };
    return Boolean(
      data.results?.some((r) =>
        r.person?.phoneNumbers?.some((p) => digits(p.value || "") === target),
      ),
    );
  } catch {
    return false;
  }
}

export type NewContactInput = {
  name: string;
  phone: string;
  email?: string | null;
  lineId?: string | null;
  note?: string | null;
  slotText?: string | null;
  intentText?: string | null;
};

/**
 * 建立聯絡人。回傳 Google 給的 resourceName；沒綁定 / 沒權限 / 已存在都回 null。
 *
 * 🔴 這裡刻意**不 throw**：預約已經成立了，聯絡人加不進去不該讓整筆任務算失敗
 *    而一直重試（重試只會生出更多重複的聯絡人）。加不進去就記 log，你信裡還有 .vcf 可以手動存。
 */
export async function createGoogleContact(input: NewContactInput): Promise<string | null> {
  if (!(await isGoogleBound())) return null;
  const token = await getAccessToken();
  if (!token) return null;

  if (await alreadyExists(token, input.phone)) {
    console.log(`[google-contacts] ${input.name} 的電話已在聯絡人裡，略過`);
    return null;
  }

  const groupResourceName = await ensureContactGroup(token);
  const noteLines = [
    input.slotText ? `預約時段：${input.slotText}` : "",
    input.intentText ? `需求：${input.intentText}` : "",
    input.lineId ? `LINE：${input.lineId}` : "",
    input.note ? `客戶備註：${input.note}` : "",
    `來源：線上預約系統（${new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}）`,
  ].filter(Boolean);

  const body: Record<string, unknown> = {
    names: [{ givenName: input.name, displayName: input.name }],
    phoneNumbers: [{ value: input.phone, type: "mobile" }],
    // 來電時多數手機會在名字底下顯示公司欄，拿來標「哪來的」最好認
    organizations: [{ name: GROUP_NAME }],
    biographies: [{ value: noteLines.join("\n"), contentType: "TEXT_PLAIN" }],
    ...(input.email ? { emailAddresses: [{ value: input.email }] } : {}),
    ...(input.lineId ? { userDefined: [{ key: "LINE", value: input.lineId }] } : {}),
    ...(groupResourceName
      ? { memberships: [{ contactGroupMembership: { contactGroupResourceName: groupResourceName } }] }
      : {}),
  };

  try {
    const res = await fetch(`${PEOPLE_API}/people:createContact`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // 403 幾乎都是「授權時還沒有 contacts 這個權限」——去後台重新授權一次就好
      console.error(`[google-contacts] 建立失敗 ${res.status}: ${text}`);
      return null;
    }
    const data = (await res.json()) as { resourceName?: string };
    return data.resourceName || null;
  } catch (error) {
    console.error("[google-contacts] createGoogleContact 例外:", error);
    return null;
  }
}

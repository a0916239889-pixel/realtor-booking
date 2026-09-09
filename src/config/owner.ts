/**
 * 👤 這個系統是誰的 —— 從這裡改，只改這一個檔
 *
 * 名片頁、預約表單、通知信、日曆邀請 全都讀這裡。
 * 把下面換成你自己的資料，整套系統就是你的了。
 *
 * ⚠️ 這個檔會進 Git。手機與 Email 填進去等於公開在網路上
 *    （名片本來就是要給人看的，但你如果不想被爬蟲收割，
 *      可以改成讀環境變數：process.env.OWNER_PHONE 之類）。
 */

export const OWNER = {
  /** 你的名字（正式全名，出現在通知信署名與日曆邀請） */
  name: "周律廷",
  /** 慣用稱呼（客戶怎麼叫你，出現在文案裡：「律廷會與您聯繫」） */
  alias: "律廷",
  /** 頭銜 */
  title: "台灣房屋三重國小捷運特許加盟店 房產顧問",
  /** 手機（顯示用，含分隔線） */
  phone: "0916-239-889",
  /** 手機（純數字，撥號連結與 LINE 加好友用） */
  phoneRaw: "0916239889",
  /** 聯絡信箱（客戶回信會到這裡） */
  email: "a0916239889@gmail.com",
  /** 公司地址（「公司面談」這個選項會顯示它） */
  address: "新北市三重區三和路三段30號",
  /** 公司／品牌名 */
  company: "榮閤開發有限公司",
  /** 大頭照放 public/card/ 底下 */
  photoUrl: "/card/owner.jpg",
  /** 一句話介紹自己 */
  slogan: "深耕三重、蘆洲、中山、大同．買賣稅務與資產配置一次談清楚。",
} as const;

/**
 * 不動產經紀業管理條例的法定揭露 —— 名片頁與預約頁的頁尾會載明。
 * §21：廣告及銷售內容應載明「經紀業名稱」（門市品牌名不算）。
 * §22：廣告稿應由經紀業指派的「經紀人」簽章（經紀人 ≠ 營業員，不可互換）。
 */
export const DISCLOSURE = {
  /** §21 經紀業名稱 */
  agency: "榮閤開發有限公司",
  /** 門市品牌名（非法定，僅供辨識） */
  branch: "台灣房屋三重國小捷運特許加盟店",
  /** §22 經紀人簽章 */
  broker: "經紀人梁皖斐(91)北縣字第000584號",
  /** 承辦營業員（資訊，非法定） */
  agent: "承辦營業員 周律廷　106登字第312843號",
} as const;

/** 社群連結 —— 用不到的留空字串，畫面會自動不顯示 */
export const SOCIAL = {
  line: "https://line.me/ti/p/~maxchou1023",
  fb: "https://www.facebook.com/1645716850897000",
  yt: "",
  ig: "",
} as const;

/** LINE 加好友 QR 圖（放 public/card/ 底下）。null = 不顯示 QR 區 */
export const LINE_QR: string | null = null;

/** 網站網址（通知信裡的連結、Open Graph 用） */
export const SITE_URL = process.env.APPOINTMENT_BASE_URL || "http://localhost:3000";

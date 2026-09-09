// Prisma client singleton
// 避免開發時 hot-reload 重複建立連線
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function serverlessDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  // Netlify 也是一個請求開一個函式，跟 Vercel 一樣會把資料庫連線數吃光，
  // 原版只認 VERCEL，實際部署在 Netlify 就完全沒套到上限。
  if (!raw || !(process.env.VERCEL || process.env.NETLIFY)) return undefined;

  try {
    const url = new URL(raw);
    const configuredLimit = Number.parseInt(process.env.PRISMA_CONNECTION_LIMIT || "3", 10);
    const connectionLimit = Number.isFinite(configuredLimit)
      ? Math.min(10, Math.max(1, configuredLimit))
      : 3;
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(connectionLimit));
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "5");
    }
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "5");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const datasourceUrl = serverlessDatasourceUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

globalForPrisma.prisma = db;

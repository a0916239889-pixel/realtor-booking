import type { Metadata } from "next";
import { OWNER } from "@/config/owner";
import BookingManageClient from "./BookingManageClient";

export const metadata: Metadata = {
  title: `確認與管理預約｜${OWNER.alias}（${OWNER.name}）`,
  description: `確認出席、查看時間，或管理與${OWNER.alias}的預約。`,
  robots: { index: false, follow: false },
};

export default async function BookingManagePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.token;
  const token = Array.isArray(raw) ? raw[0] || "" : raw || "";
  return <BookingManageClient token={token} />;
}

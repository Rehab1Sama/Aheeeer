// عند رفض النقل لعدم الصلاحية: عرض إرسال «طلب نقل» للقائدة بدل رسائل الواتساب.
import { getToken } from "@/lib/auth";

export async function offerTransferRequest(opts: { studentId: number; studentName: string; fromCircleId: number | null; toCircleId: number; reason?: string }): Promise<"sent" | "cancelled" | string> {
  const ok = window.confirm(`${opts.reason ? `${opts.reason}\n\n` : ""}هل تريدين إرسال طلب نقل «${opts.studentName}» إلى القائدة لتوافق عليه؟`);
  if (!ok) return "cancelled";
  const note = window.prompt("سبب النقل (اختياري):") ?? "";
  const r = await fetch("/api/transfer-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ studentId: opts.studentId, fromCircleId: opts.fromCircleId, toCircleId: opts.toCircleId, note: note.trim() || null }),
  });
  if (r.ok) return "sent";
  const data = await r.json().catch(() => ({}));
  return data.error ?? "تعذّر إرسال الطلب";
}

// بطاقة ربط تيليجرام لمسؤولة المسار: تصلها كل صباح خلاصة طالبات مسارها باسمها.
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { SoftCircles } from "@/components/Decor";

type Status = { linked: boolean; available: boolean };

async function api(path: string, method = "GET") {
  const r = await fetch(`/api${path}`, { method, headers: { Authorization: `Bearer ${getToken()}` } });
  return r.ok ? r.json() : null;
}

export default function TelegramLinkCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = () => api("/telegram/status").then((d) => d && setSt(d));
  useEffect(() => {
    load();
    const onFocus = () => load(); // بعد الرجوع من تيليجرام
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  if (!st?.available) return null;

  const link = async () => {
    setBusy(true);
    const d = await api("/telegram/link", "POST");
    setBusy(false);
    if (d?.url) window.location.href = d.url; // يفتح تطبيق تيليجرام مباشرة (النافذة المنبثقة تُحجب في الجوال)
  };
  const unlink = async () => { await api("/telegram/unlink", "POST"); setNote(null); load(); };
  const test = async () => {
    setBusy(true);
    const d = await api("/telegram/test", "POST");
    setBusy(false);
    setNote(d?.sent ? "أرسلنا لكِ نموذجًا على تيليجرام 🌸" : "لا يوجد يوم دوام سابق لإرسال نموذج منه الآن 🌿");
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-sm">
      <SoftCircles size={110} className="-left-8 -top-10" />
      <div className="relative flex items-stretch">
        <span className="w-1.5 flex-none bg-gradient-to-b from-[#1A2260] to-[#2B3784]" />
        <div className="flex-1 px-4 py-3">
          {st.linked ? (
            <>
              <p className="text-sm font-bold text-primary">تصلكِ خلاصة طالبات مساركِ على تيليجرام ✓</p>
              <p className="mt-0.5 text-xs text-muted-foreground">كل صباح: المتكاسلات ومن يحتجن متابعة، ومتميِّزات الأسبوع يوم الخميس.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy} onClick={test} className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50">أرسلي لي نموذجًا الآن</button>
                <button type="button" onClick={unlink} className="text-xs text-muted-foreground underline">إيقاف الرسائل</button>
              </div>
              {note && <p className="mt-1.5 text-xs text-primary">{note}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-primary">اربطي تيليجرام لتصلكِ خلاصة طالبات مساركِ 🌸</p>
              <p className="mt-0.5 text-xs text-muted-foreground">اضغطي الزر، ثم «Start» في البوت، وتصلكِ كل صباح باسمكِ.</p>
              <button type="button" disabled={busy} onClick={link} className="mt-2 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50">اربطي تيليجرام</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

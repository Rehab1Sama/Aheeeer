// زر «ثبّتي التطبيق»: يظهر فقط إذا كان المتصفح يسمح بتثبيت الموقع تطبيقًا ولم يُثبَّت بعد.
// يفيد من لا تجد خيار التثبيت في قائمة المتصفح.
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let saved: InstallEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); saved = e as InstallEvent; window.dispatchEvent(new Event("sana-installable")); });
}

export default function InstallAppBanner() {
  const [evt, setEvt] = useState<InstallEvent | null>(saved);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("sana_install_dismissed") === "1"; } catch { return false; } });
  useEffect(() => {
    const on = () => setEvt(saved);
    const done = () => { saved = null; setEvt(null); };
    window.addEventListener("sana-installable", on);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("sana-installable", on); window.removeEventListener("appinstalled", done); };
  }, []);
  if (!evt || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem("sana_install_dismissed", "1"); } catch { /* */ } };
  return (
    <div dir="rtl" className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-sm rounded-2xl bg-primary text-primary-foreground shadow-lg p-3 flex items-center gap-3">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="w-10 h-10 rounded-xl bg-white" />
      <div className="flex-1 text-sm font-bold">ثبّتي «سنا الآي» تطبيقًا على جوالك</div>
      <button
        className="rounded-xl bg-white text-primary px-3 py-1.5 text-sm font-bold"
        onClick={async () => { await evt.prompt(); const r = await evt.userChoice.catch(() => null); if (r?.outcome === "accepted") { saved = null; setEvt(null); } }}
      >تثبيت</button>
      <button aria-label="إغلاق" className="text-primary-foreground/80 px-1 text-lg" onClick={close}>×</button>
    </div>
  );
}

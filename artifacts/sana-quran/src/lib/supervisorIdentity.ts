// هوية مسؤولة المسار في الحساب المشترك (تُختار من «مين أنتِ؟» وتُحفظ بالجهاز):
// تُستخدم للترحيب والاسم في القائمة الجانبية وربط تيليجرام لكل مسؤولة باسمها.
import { useEffect, useState } from "react";

export type SupervisorIdentity = { trackId: number; id: number; name: string };
const KEY = "sana_supervisor_identity_current";
const EVT = "sana:identity";

export function getSupervisorIdentity(): SupervisorIdentity | null {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as SupervisorIdentity) : null; } catch { return null; }
}
export function setSupervisorIdentity(v: SupervisorIdentity | null): void {
  try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* */ }
  window.dispatchEvent(new Event(EVT));
}
export function useSupervisorIdentity(): SupervisorIdentity | null {
  const [v, setV] = useState<SupervisorIdentity | null>(() => getSupervisorIdentity());
  useEffect(() => {
    const on = () => setV(getSupervisorIdentity());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener("storage", on); };
  }, []);
  return v;
}

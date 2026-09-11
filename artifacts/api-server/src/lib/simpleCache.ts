// كاش بسيط بالذاكرة (مو بالقاعدة) — يقلل إعادة حساب نفس البيانات كل فتحة صفحة
// خلال فترة قصيرة (٣-٥ دقائق). يُمسح تلقائيًا بانتهاء صلاحيته، وما يحتاج أي
// migration أو مساحة تخزين دائمة — مجرد Map بالذاكرة يختفي عند إعادة تشغيل السيرفر.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export async function withCache<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const value = await compute();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** تفريغ الكاش (كامل، أو أي مفتاح يبدأ بـ prefix معيّن) — مفيدة لو حبينا لاحقًا زر "تحديث فوري". */
export function invalidateCache(prefix?: string): void {
  if (!prefix) { store.clear(); return; }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

export const CACHE_TTL_MS = 4 * 60 * 1000; // ٤ دقائق

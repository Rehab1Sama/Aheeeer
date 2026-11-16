// ذاكرة مؤقتة قصيرة للقراءات الثقيلة المتكررة (قوائم كاملة تُطلب آلاف المرات يوميًا)
// تخفِّف البيانات الخارجة من قاعدة البيانات دون أن تتأخر أي تعديلات:
// - كل طلب تعديل ناجح (POST/PUT/PATCH/DELETE) يُفرِغها فورًا (انظري middleware أدناه)
// - وتنتهي صلاحية كل قيمة بعد مدة قصيرة على أي حال
import type { Request, Response, NextFunction } from "express";

type Entry = { at: number; gen: number; p: Promise<unknown> };
const store = new Map<string, Entry>();
let generation = 0;

export function invalidateReadCache(): void {
  generation++;
  store.clear();
}

/** يعيد نتيجة fn من الذاكرة إن كانت حديثة، وإلا يجلبها مرة واحدة (حتى مع الطلبات المتزامنة) */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.gen === generation && now - hit.at < ttlMs) return hit.p as Promise<T>;
  const gen = generation;
  const p = fn();
  store.set(key, { at: now, gen, p });
  try {
    return await p;
  } catch (err) {
    if (store.get(key)?.p === p) store.delete(key);
    throw err;
  }
}

/** نسخة سطحية من القائمة حتى لا يؤثر ترشيح طلب في طلب آخر */
export async function cachedList<T>(key: string, ttlMs: number, fn: () => Promise<T[]>): Promise<T[]> {
  return [...(await cached(key, ttlMs, fn))];
}

// طلبات كتابة لا تغيِّر بيانات معروضة (نبض الجلسة، رسائل البوت، الدخول) فلا تُفرِغ الذاكرة
const NON_DATA_WRITES = [/heartbeat/, /\/telegram\//, /\/auth\/(login|logout|forgot|refresh)/, /\/session/];

export function readCacheInvalidator(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    res.on("finish", () => {
      if (res.statusCode < 400 && !NON_DATA_WRITES.some((r) => r.test(req.path))) invalidateReadCache();
    });
  }
  next();
}

// ذاكرة مؤقتة قصيرة للقراءات الثقيلة المتكررة (قوائم كاملة تُطلب آلاف المرات يوميًا)
// تخفِّف البيانات الخارجة من قاعدة البيانات دون أن تتأخر أي تعديلات:
// - كل طلب تعديل ناجح (POST/PUT/PATCH/DELETE) يُفرِغها فورًا (انظري middleware أدناه)
// - وتنتهي صلاحية كل قيمة بعد مدة قصيرة على أي حال
import type { Request, Response, NextFunction } from "express";
import { markMirrorsDirty } from "./tableMirror";

type Entry = { at: number; gen: number; p: Promise<unknown> };
const store = new Map<string, Entry>();
let generation = 0;

export function invalidateReadCache(): void {
  markMirrorsDirty();
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

// ماذا يُفرَّغ مع كل كتابة: الأكثر تكرارًا (حفظ سجلات اليوم) لا يمس قوائم الطالبات والحسابات،
// فيبقى أثر الذاكرة حقيقيًا وقت الإدخال. أي مسار غير معروف يفرِّغ الكل (الأمان أولًا).
const NON_DATA_WRITES = [/heartbeat/, /^\/telegram\//, /^\/auth\/(login|logout|forgot|refresh|switch)/, /\/session/,
  /^\/messages/, /^\/alerts/, /^\/badge-events/, /^\/live-badges/, /^\/custom-question-answers/, /^\/store-products/,
  /^\/daily-circle-tasks/, /^\/deputy/, /^\/export/];
const RECORD_WRITES = /^\/(records|data-entry)(\/|$)/;
const RECORD_KEYS = /^(records|records-ids|today-banner):/;

function invalidateKeys(match: RegExp): void {
  generation++; // يمنع حفظ نتيجة جلب بدأ قبل الكتابة
  for (const k of [...store.keys()]) if (match.test(k)) store.delete(k);
  // القيم الباقية جُلبت بجيل سابق: نرفعها للجيل الجديد لأنها لم تتأثر بهذه الكتابة
  for (const e of store.values()) e.gen = generation;
}

export function readCacheInvalidator(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const path = req.path;
      if (NON_DATA_WRITES.some((r) => r.test(path))) return;
      markMirrorsDirty();
      if (RECORD_WRITES.test(path)) invalidateKeys(RECORD_KEYS);
      else invalidateReadCache();
    });
  }
  next();
}

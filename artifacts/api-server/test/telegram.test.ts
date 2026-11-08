import { test } from "node:test";
import assert from "node:assert/strict";
import { splitForTelegram } from "../src/lib/telegramFormat";

test("الرسالة القصيرة لا تُقسم", () => {
  assert.deepEqual(splitForTelegram("سطر"), ["سطر"]);
});

test("الرسالة الطويلة تُقسم دون كسر الاقتباسات ودون تجاوز الحد", () => {
  const block = (i: number) => `<code>مسار ${i}</code>\n<blockquote>${Array.from({ length: 30 }, (_, j) => `الطالبة ${i}-${j} | حلقة\n<b>الغياب</b> ← ٣ أيام`).join("\n")}</blockquote>`;
  const text = Array.from({ length: 20 }, (_, i) => block(i)).join("\n\n");
  const parts = splitForTelegram(text, 3900);
  assert.ok(parts.length > 1);
  for (const p of parts) {
    assert.ok(p.length <= 3900, `طول ${p.length}`);
    assert.equal((p.match(/<blockquote/g) ?? []).length, (p.match(/<\/blockquote>/g) ?? []).length);
  }
});

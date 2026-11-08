// تنسيق رسائل تيليجرام — دوال نقية بلا قاعدة بيانات (قابلة للاختبار)

/** يقسم الرسالة الطويلة (حد تيليجرام ٤٠٩٦ حرفًا) دون كسر وسوم <blockquote> المفتوحة. */
export function splitForTelegram(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  // وحدات لا تُقسم: سطر عادي، أو اقتباس كامل (يُقسم اقتباسًا جديدًا إن طال وحده)
  const units: string[] = [];
  for (const piece of text.split(/(<blockquote[^>]*>[\s\S]*?<\/blockquote>)/)) {
    if (!piece) continue;
    if (piece.startsWith("<blockquote")) {
      if (piece.length <= limit) { units.push(piece); continue; }
      const open = piece.match(/^<blockquote[^>]*>/)![0];
      const inner = piece.slice(open.length, -"</blockquote>".length);
      let cur = "";
      for (const line of inner.split("\n")) {
        if (cur && (cur + "\n" + line).length > limit - 40) { units.push(`${open}${cur}</blockquote>`); cur = line; }
        else cur = cur ? `${cur}\n${line}` : line;
      }
      if (cur) units.push(`${open}${cur}</blockquote>`);
    } else {
      units.push(...piece.split("\n").filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1))));
    }
  }
  const parts: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && (cur + "\n" + u).length > limit) { parts.push(cur); cur = u; }
    else cur = cur ? `${cur}\n${u}` : u;
  }
  if (cur) parts.push(cur);
  return parts;
}

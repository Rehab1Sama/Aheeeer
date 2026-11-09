// الإجازات من تقويم المقرأة: حدث نوعه «holiday» من تاريخه إلى تاريخ نهايته،
// وإن لم تكن له نهاية فإلى اليوم السابق لأول «بداية الفصل…» بعده.
// في الإجازة لا تنبيهات إدخال ولا تذكير، ولا يُحسب اليوم على أحد في تقرير القائدة.
import { db, calendarEventsTable } from "@workspace/db";
import { addDaysStr } from "./date";

let cache: { at: number; rows: Array<{ title: string; date: string; endDate: string | null; eventType: string }> } | null = null;

async function events() {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.rows;
  const rows = await db.select({
    title: calendarEventsTable.title, date: calendarEventsTable.date,
    endDate: calendarEventsTable.endDate, eventType: calendarEventsTable.eventType,
  }).from(calendarEventsTable);
  cache = { at: Date.now(), rows };
  return rows;
}

/** اسم الإجازة التي يقع فيها اليوم، أو null */
export async function holidayOn(date: string): Promise<string | null> {
  try {
    const rows = await events();
    const starts = rows.filter((e) => /بداية/.test(e.title)).map((e) => e.date).sort();
    for (const e of rows) {
      if (e.eventType !== "holiday" || date < e.date) continue;
      const nextStart = starts.find((d) => d > e.date);
      const end = e.endDate ?? (nextStart ? addDaysStr(nextStart, -1) : addDaysStr(e.date, 60));
      if (date <= end) return e.title.trim();
    }
    return null;
  } catch {
    return null; // تعذُّر قراءة التقويم لا يوقف شيئًا
  }
}

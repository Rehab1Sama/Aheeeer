import { db, badgeAwardCountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * تسجّل استحقاق وسام لفترة معيّنة (أسبوع/شهر) وترجّع العدد التراكمي.
 * لو نفس الفترة سبق واتسجّلت (نفس lastPeriod)، ما تزيد العدد — يمنع التكرار
 * لو الدالة انادت أكثر من مرة لنفس الأسبوع (مثلًا لو صفحة فُتحت مرتين).
 */
export async function recordBadgeAward(
  entityType: string,
  entityId: number,
  badgeId: string,
  tier: number,
  period: string
): Promise<number> {
  const [existing] = await db.select().from(badgeAwardCountsTable).where(
    and(eq(badgeAwardCountsTable.entityType, entityType), eq(badgeAwardCountsTable.entityId, entityId), eq(badgeAwardCountsTable.badgeId, badgeId))
  );

  if (!existing) {
    await db.insert(badgeAwardCountsTable).values({ entityType, entityId, badgeId, tier, count: 1, lastPeriod: period });
    return 1;
  }
  if (existing.lastPeriod === period) return existing.count;

  const newCount = existing.count + 1;
  await db.update(badgeAwardCountsTable)
    .set({ count: newCount, tier, lastPeriod: period })
    .where(eq(badgeAwardCountsTable.id, existing.id));
  return newCount;
}

export async function getBadgeAwardCount(entityType: string, entityId: number, badgeId: string): Promise<number> {
  const [row] = await db.select({ count: badgeAwardCountsTable.count }).from(badgeAwardCountsTable).where(
    and(eq(badgeAwardCountsTable.entityType, entityType), eq(badgeAwardCountsTable.entityId, entityId), eq(badgeAwardCountsTable.badgeId, badgeId))
  );
  return row?.count ?? 0;
}

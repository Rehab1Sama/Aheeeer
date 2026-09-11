import { Router, type IRouter } from "express";
import { db, messagesTable, circlesTable, studentsTable, usersTable, tracksTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router: IRouter = Router();

function isExpired(m: typeof messagesTable.$inferSelect): boolean {
  return !!(m.expiresAt && m.expiresAt < new Date());
}

async function buildMessageWithLabel(m: typeof messagesTable.$inferSelect, senderName: string) {
  let targetLabel = m.targetId;
  if (m.targetType === "student") {
    const [s] = await db.select({ fullName: studentsTable.fullName }).from(studentsTable).where(eq(studentsTable.id, parseInt(m.targetId)));
    targetLabel = s?.fullName ?? m.targetId;
  } else if (m.targetType === "circle") {
    const [c] = await db.select({ name: circlesTable.name }).from(circlesTable).where(eq(circlesTable.id, parseInt(m.targetId)));
    targetLabel = c?.name ?? m.targetId;
  } else if (m.targetType === "track") {
    targetLabel = m.targetId;
  }
  return {
    id: m.id,
    senderId: m.senderId,
    senderName,
    targetType: m.targetType,
    targetId: m.targetId,
    targetLabel,
    content: m.content,
    expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}

// Verify a circle belongs to the track_supervisor's track
async function circleInTrack(circleId: number, trackName: string): Promise<boolean> {
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle?.trackId) return false;
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, circle.trackId));
  const strip = (s: string) => s.replace(/^مسار\s+/, "").trim();
  return strip(track?.name ?? "") === strip(trackName);
}

// POST — leader or track_supervisor can send
router.post("/messages", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (role !== "leader" && role !== "track_supervisor") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { targetType, targetId, content, expiresAt } = req.body as {
    targetType: string; targetId: string; content: string; expiresAt?: string | null;
  };
  if (!targetType || !targetId || !content?.trim()) {
    res.status(400).json({ error: "targetType, targetId and content are required" }); return;
  }

  // track_supervisor restrictions
  if (role === "track_supervisor") {
    const allowed = ["circle", "track"];
    if (!allowed.includes(targetType)) {
      res.status(403).json({ error: "مسؤولة المسار يمكنها الإرسال للحلقات والمسار فقط" }); return;
    }
    if (targetType === "track" && targetId !== req.userTrack) {
      res.status(403).json({ error: "يمكنك الإرسال لمسارك فقط" }); return;
    }
    if (targetType === "circle") {
      const ok = await circleInTrack(parseInt(targetId), req.userTrack ?? "");
      if (!ok) { res.status(403).json({ error: "هذه الحلقة لا تنتمي لمسارك" }); return; }
    }
  }

  const [msg] = await db.insert(messagesTable).values({
    senderId: req.userId!,
    targetType,
    targetId,
    content: content.trim(),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();

  const [sender] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!));
  const result = await buildMessageWithLabel(msg, sender?.name ?? "");
  res.status(201).json(result);
});

// GET all messages — leader sees all; track_supervisor sees their own
router.get("/messages", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (role !== "leader" && role !== "track_supervisor") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  let messages;
  if (role === "track_supervisor") {
    messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.senderId, req.userId!))
      .orderBy(desc(messagesTable.createdAt));
  } else {
    messages = await db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt));
  }

  const senderIds = [...new Set(messages.map(m => m.senderId))];
  const senders = senderIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(senderIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const senderMap: Record<number, string> = {};
  for (const s of senders) senderMap[s.id] = s.name;

  const results = await Promise.all(messages.map(m => buildMessageWithLabel(m, senderMap[m.senderId] ?? "")));
  res.json(results);
});

// Batch send — leader only
router.post("/messages/batch", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const { studentIds, content, expiresAt } = req.body as { studentIds: number[]; content: string; expiresAt?: string | null };
  if (!Array.isArray(studentIds) || studentIds.length === 0 || !content?.trim()) {
    res.status(400).json({ error: "studentIds array and content are required" }); return;
  }
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const rows = studentIds.map(sid => ({
    senderId: req.userId!,
    targetType: "student",
    targetId: String(sid),
    content: content.trim(),
    expiresAt: expiry,
  }));
  await db.insert(messagesTable).values(rows);
  res.status(201).json({ count: rows.length });
});

// My messages — any authenticated user
router.get("/messages/my", authenticate, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const userRole = req.userRole!;
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return; }

  const allMessages = await db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt));

  const myMessages = allMessages.filter(m => {
    if (isExpired(m)) return false;
    if (m.targetType === "student") return String(userId) === m.targetId;
    if (m.targetType === "circle") return currentUser.circleId && m.targetId === String(currentUser.circleId);
    if (m.targetType === "track") return currentUser.track && m.targetId === currentUser.track;
    if (m.targetType === "role") return m.targetId === userRole;
    return false;
  });

  const senderIds = [...new Set(myMessages.map(m => m.senderId))];
  const senders = senderIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(senderIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const senderMap: Record<number, string> = {};
  for (const s of senders) senderMap[s.id] = s.name;

  const results = await Promise.all(myMessages.map(m => buildMessageWithLabel(m, senderMap[m.senderId] ?? "")));
  res.json(results);
});

// Delete — leader can delete any; track_supervisor can delete their own
router.delete("/messages/:id", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (role !== "leader" && role !== "track_supervisor") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (role === "track_supervisor") {
    const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, id));
    if (!msg || msg.senderId !== req.userId!) {
      res.status(403).json({ error: "يمكنك حذف رسائلك فقط" }); return;
    }
  }

  await db.delete(messagesTable).where(eq(messagesTable.id, id));
  res.sendStatus(204);
});

export default router;

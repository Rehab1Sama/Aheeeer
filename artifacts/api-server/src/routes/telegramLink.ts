// ربط حساب مسؤولة المسار بتيليجرام لتصلها خلاصة طالبات مسارها:
//   POST /api/telegram/link    → رمز ربط مؤقت ورابط البوت (t.me/<bot>?start=<رمز>)
//   GET  /api/telegram/status  → هل حسابها مربوط
//   POST /api/telegram/unlink  → إيقاف الرسائل
//   POST /api/telegram/webhook → رسائل البوت (يضبطه الخادم عند الإقلاع، ويُتحقَّق بالرمز السري)
import { Router, type IRouter } from "express";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { db, usersTable, trackSupervisorNamesTable, tracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
import { sendTrackStudentReports } from "../lib/dailyReport";
import { addDaysStr, getMakkahDay } from "../lib/date";

const router: IRouter = Router();
const LINK_ROLES = ["track_supervisor"];

const botToken = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
/** الرمز السري للـ webhook: مشتق من مفتاح البوت، فلا يحتاج متغيرًا جديدًا */
export const webhookSecret = () => createHash("sha256").update(`sana-webhook:${botToken()}`).digest("hex").slice(0, 48);

let botUsername: string | null = null;
async function getBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername;
  if (!botToken()) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken()}/getMe`);
    const d = (await r.json()) as { ok: boolean; result?: { username?: string } };
    botUsername = d.result?.username ?? null;
  } catch { /* */ }
  return botUsername;
}

export async function telegramSend(chatId: string, text: string): Promise<boolean> {
  if (!botToken()) return false;
  const r = await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  return r.ok;
}

/** يضبط عنوان استقبال رسائل البوت (مرة عند الإقلاع) */
export async function ensureTelegramWebhook(): Promise<void> {
  const base = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
  if (!botToken() || !base) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken()}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${base.replace(/\/$/, "")}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message"] }),
    });
    logger.info({ ok: r.ok }, "telegram webhook set");
  } catch (err) {
    logger.warn({ err }, "telegram webhook failed");
  }
}

// الحساب مشترك بين مسؤولتي المسار: الربط لكل مسؤولة باسمها (track_supervisor_names) بحسب هويتها المختارة بالجهاز.
// بلا هوية مختارة يُربط الحساب نفسه (للحسابات غير المشتركة).
async function ownName(req: { userTrack?: string | null }, raw: unknown) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [n] = await db.select({ id: trackSupervisorNamesTable.id, name: trackSupervisorNamesTable.name, chat: trackSupervisorNamesTable.telegramChatId, track: tracksTable.name })
    .from(trackSupervisorNamesTable).innerJoin(tracksTable, eq(tracksTable.id, trackSupervisorNamesTable.trackId))
    .where(eq(trackSupervisorNamesTable.id, id));
  return n && n.track === req.userTrack ? n : null;
}

router.get("/telegram/status", authenticate, async (req, res): Promise<void> => {
  const available = !!botToken() && LINK_ROLES.includes(req.userRole ?? "");
  const n = await ownName(req, req.query.nameId);
  if (n) { res.json({ linked: !!n.chat, available, name: n.name }); return; }
  const [u] = await db.select({ chat: usersTable.telegramChatId }).from(usersTable).where(eq(usersTable.id, req.userId!));
  res.json({ linked: !!u?.chat, available });
});

router.post("/telegram/link", authenticate, async (req, res): Promise<void> => {
  if (!LINK_ROLES.includes(req.userRole ?? "")) { res.status(403).json({ error: "لمسؤولات المسارات" }); return; }
  const username = await getBotUsername();
  if (!username) { res.status(503).json({ error: "البوت غير مضبوط حاليًا" }); return; }
  const token = randomBytes(12).toString("hex");
  const n = await ownName(req, req.body?.nameId);
  if (n) await db.update(trackSupervisorNamesTable).set({ telegramLinkToken: token }).where(eq(trackSupervisorNamesTable.id, n.id));
  else await db.update(usersTable).set({ telegramLinkToken: token }).where(eq(usersTable.id, req.userId!));
  res.json({ url: `https://t.me/${username}?start=${token}` });
});

router.post("/telegram/unlink", authenticate, async (req, res): Promise<void> => {
  const n = await ownName(req, req.body?.nameId);
  if (n) await db.update(trackSupervisorNamesTable).set({ telegramChatId: null, telegramLinkToken: null }).where(eq(trackSupervisorNamesTable.id, n.id));
  else await db.update(usersTable).set({ telegramChatId: null, telegramLinkToken: null }).where(eq(usersTable.id, req.userId!));
  res.json({ ok: true });
});

// نموذج فوري لمسؤولة المسار المربوطة: خلاصة طالبات مسارها عن آخر يوم
router.post("/telegram/test", authenticate, async (req, res): Promise<void> => {
  if (!LINK_ROLES.includes(req.userRole ?? "")) { res.status(403).json({ error: "لمسؤولات المسارات" }); return; }
  const n = await ownName(req, req.body?.nameId);
  const sent = await sendTrackStudentReports(addDaysStr(getMakkahDay(), -1), n ? { nameId: n.id } : { userId: req.userId! }).catch(() => 0);
  res.json({ sent });
});

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const given = String(req.header("x-telegram-bot-api-secret-token") ?? "");
  const expected = webhookSecret();
  if (!botToken() || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    res.status(403).end(); return;
  }
  res.json({ ok: true }); // نرد فورًا، ونعالج بعدها
  try {
    const msg = req.body?.message;
    const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
    const text: string = typeof msg?.text === "string" ? msg.text.trim() : "";
    if (!chatId || msg?.chat?.type !== "private") return;
    const start = /^\/start(?:\s+([a-f0-9]{24}))?$/.exec(text);
    if (start) {
      const tok = start[1];
      if (!tok) {
        await telegramSend(chatId, "أهلًا بكِ 🌸\nلربط حسابكِ اضغطي زر «اربطي تيليجرام» في صفحتكِ بموقع المقرأة.");
        return;
      }
      const [nm] = await db.select({ id: trackSupervisorNamesTable.id, name: trackSupervisorNamesTable.name, track: tracksTable.name })
        .from(trackSupervisorNamesTable).innerJoin(tracksTable, eq(tracksTable.id, trackSupervisorNamesTable.trackId))
        .where(eq(trackSupervisorNamesTable.telegramLinkToken, tok));
      if (nm) {
        await db.update(trackSupervisorNamesTable).set({ telegramChatId: chatId, telegramLinkToken: null }).where(eq(trackSupervisorNamesTable.id, nm.id));
        const f = (nm.name ?? "").trim().split(/\s+/)[0] ?? "";
        await telegramSend(chatId, `تم ربطكِ يا قمرتنا ${f} 🌸\nستصلكِ كل صباح خلاصة طالبات مسار ${nm.track ?? ""}، أعانكِ الله ♥️\n\nلإيقافها اكتبي: إيقاف`);
        return;
      }
      const [u] = await db.select({ id: usersTable.id, name: usersTable.name, track: usersTable.track }).from(usersTable).where(eq(usersTable.telegramLinkToken, tok));
      if (!u) { await telegramSend(chatId, "انتهت صلاحية رابط الربط، اضغطي الزر في الموقع مرة أخرى 🌿"); return; }
      await db.update(usersTable).set({ telegramChatId: chatId, telegramLinkToken: null }).where(eq(usersTable.id, u.id));
      const first = (u.name ?? "").trim().split(/\s+/)[0] ?? "";
      await telegramSend(chatId, `تم ربطكِ يا قمرتنا ${first} 🌸\nستصلكِ كل صباح خلاصة طالبات مسار ${u.track ?? ""}، أعانكِ الله ♥️\n\nلإيقافها اكتبي: إيقاف`);
      return;
    }
    if (/^(\/stop|إيقاف|ايقاف)$/.test(text)) {
      await db.update(usersTable).set({ telegramChatId: null }).where(eq(usersTable.telegramChatId, chatId));
      await db.update(trackSupervisorNamesTable).set({ telegramChatId: null }).where(eq(trackSupervisorNamesTable.telegramChatId, chatId));
      await telegramSend(chatId, "أوقفنا الرسائل 🌿 ولإعادتها اضغطي «اربطي تيليجرام» في الموقع.");
    }
  } catch (err) {
    logger.warn({ err }, "telegram webhook handling failed");
  }
});

export default router;

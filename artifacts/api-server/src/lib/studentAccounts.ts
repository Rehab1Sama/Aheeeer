// حسابات دخول الطالبات (users بدور student) تتبع حلقاتها الفعلية فقط:
// - عند النقل يُنقل الحساب مع الطالبة، ولا يبقى حساب يشير إلى الحلقة القديمة.
// - إن كان لها حساب في الحلقة الهدف أصلًا، يُوقف حساب الحلقة القديمة بدل أن يتكرر.
// - قائمة «تبديل الحساب» واختيار الحساب عند الدخول لا تعرض إلا حسابات حلقاتها الحالية، بلا تكرار.
import { db, usersTable, studentsTable, studentEnrollmentsTable, circlesTable } from "@workspace/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { normalizeName } from "./nameMatch";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

/** نقل حسابات الطالبة من الحلقة المصدر إلى الهدف (أو إيقافها إن كان لها حساب في الهدف) */
export async function moveStudentAccounts(
  ex: Exec,
  opts: { studentId: number; fullName: string; fromCircleId: number | null; toCircleId: number },
): Promise<void> {
  const { studentId, fullName, fromCircleId, toCircleId } = opts;
  const nm = normalizeName(fullName);
  const candidates = await ex.select({
    id: usersTable.id, studentId: usersTable.studentId, circleId: usersTable.circleId, name: usersTable.name,
    email: usersTable.email, lastLoginAt: usersTable.lastLoginAt,
  }).from(usersTable).where(and(
    eq(usersTable.role, "student"), eq(usersTable.isArchived, false),
    or(eq(usersTable.studentId, studentId), isNull(usersTable.studentId)),
  ));
  const mine = candidates.filter((u) => u.studentId === studentId || (u.studentId == null && normalizeName(u.name ?? "") === nm));
  // المصدر: حساب الحلقة القديمة، وأي حساب بلا حلقة أو على قائمة التسجيل (حساب استمارة التسجيل)
  const regIds = (await ex.select({ id: circlesTable.id }).from(circlesTable).where(eq(circlesTable.trackType, "registration"))).map((c) => c.id);
  const inSource = mine.filter((u) => u.circleId !== toCircleId && (
    u.circleId == null || regIds.includes(u.circleId) || (fromCircleId != null && u.circleId === fromCircleId)
  ));
  if (inSource.length === 0) return;
  const inTarget = mine.filter((u) => u.circleId === toCircleId);

  // حساب واحد لكل بريد في الحلقة الهدف
  const targetEmails = new Set(inTarget.map((u) => u.email.toLowerCase()));
  const toArchive: number[] = [];
  const toMove: number[] = [];
  const movedEmails = new Set<string>();
  for (const u of [...inSource].sort((a, b) => (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0))) {
    const e = u.email.toLowerCase();
    if (targetEmails.has(e) || movedEmails.has(e)) toArchive.push(u.id);
    else { toMove.push(u.id); movedEmails.add(e); }
  }
  if (toMove.length) await ex.update(usersTable).set({ circleId: toCircleId, studentId }).where(inArray(usersTable.id, toMove));
  if (toArchive.length) await ex.update(usersTable).set({ isArchived: true }).where(inArray(usersTable.id, toArchive));
}

type AccountRow = { id: number; role: string; circleId: number | null; studentId: number | null; name: string | null; lastLoginAt?: Date | null };

/**
 * يُبقي من حسابات البريد الواحد ما يطابق الواقع: حساب الطالبة يظهر فقط إن كانت مسجَّلة فعلًا في حلقته،
 * وحساب واحد لكل (دور، حلقة). لا يُفرِغ القائمة أبدًا: إن لم يطابق أي حساب طالبة، تبقى كما هي.
 */
export async function currentAccountsOnly<T extends AccountRow>(accounts: T[], keepId?: number): Promise<T[]> {
  const students = accounts.filter((a) => a.role === "student");
  let valid = new Set<number>(accounts.filter((a) => a.role !== "student").map((a) => a.id));
  if (students.length) {
    const linkedIds = [...new Set(students.map((a) => a.studentId).filter((x): x is number => x != null))];
    const names = [...new Set(students.map((a) => normalizeName(a.name ?? "")))];
    const enrolls = await db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId, fullName: studentsTable.fullName })
      .from(studentEnrollmentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
      .where(and(eq(studentEnrollmentsTable.isArchived, false), eq(studentsTable.isArchived, false)));
    const byStudent = new Set(enrolls.filter((e) => linkedIds.includes(e.studentId)).map((e) => `${e.studentId}:${e.circleId}`));
    const byName = new Set(enrolls.filter((e) => names.includes(normalizeName(e.fullName))).map((e) => `${normalizeName(e.fullName)}:${e.circleId}`));
    const okStudents = students.filter((a) => a.circleId != null && (
      a.studentId != null ? byStudent.has(`${a.studentId}:${a.circleId}`) : byName.has(`${normalizeName(a.name ?? "")}:${a.circleId}`)
    ));
    // لا نُخفي كل حسابات الطالبة (حالة بيانات ناقصة): الدخول يبقى ممكنًا
    for (const a of okStudents.length ? okStudents : students) valid.add(a.id);
  }
  if (keepId != null) valid.add(keepId);
  // حساب واحد لكل (دور، حلقة): الحالي، ثم المربوط بسجل طالبة، ثم الأحدث دخولًا
  const best = new Map<string, T>();
  const score = (a: T) => (a.id === keepId ? 4 : 0) + (a.studentId != null ? 2 : 0) + (a.lastLoginAt ? 1 : 0);
  for (const a of accounts) {
    if (!valid.has(a.id)) continue;
    const k = `${a.role}:${a.circleId ?? ""}`;
    const prev = best.get(k);
    if (!prev || score(a) > score(prev) || (score(a) === score(prev) && (a.lastLoginAt?.getTime() ?? 0) > (prev.lastLoginAt?.getTime() ?? 0))) best.set(k, a);
  }
  return accounts.filter((a) => [...best.values()].includes(a));
}

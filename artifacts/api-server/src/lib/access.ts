// نطاق الوصول إلى بيانات الطالبات: من يحق له رؤية/تعديل بيانات طالبة معيّنة.
// الدور وحده لا يكفي: المعلمة والمشرفة لحلقاتهما، ومسؤولة المسار لمسارها، ومُدخلة البيانات
// لحلقاتها المسندة، والطالبة لنفسها فقط. القائدة والنائبة لكل شيء.
//
// الطالبة في أكثر من حلقة: لكل حلقة حساب، وتُعرف «نفسها» بالربط المحفوظ أولًا، ثم بالاسم
// ثم بالسجل (تسجيل في الحلقة) — نفس ترتيب الربط في authenticate، فلا يُكسر أي حساب يعمل الآن.
import { db, circlesTable, usersTable, studentsTable, studentEnrollmentsTable, dataEntryCircleAssignmentsTable } from "@workspace/db";
import { eq, and, inArray, or } from "drizzle-orm";

type Req = {
  userId?: number;
  userRole?: string;
  userTrack?: string | null;
  userCircleId?: number | null;
  userStudentId?: number | null;
};

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase());
}

/** الحلقات التي يحق للمستخدمة الوصول لطالباتها؛ "all" للقائدة والنائبة. */
export async function accessibleCircleIds(req: Req): Promise<"all" | number[]> {
  const role = req.userRole;
  if (role === "leader" || role === "deputy") return "all";
  if (role === "track_supervisor") {
    if (!req.userTrack) return [];
    const circles = await db.select({ id: circlesTable.id, track: circlesTable.track }).from(circlesTable);
    return circles.filter((c) => sameText(c.track, req.userTrack)).map((c) => c.id);
  }
  if (role === "teacher" || role === "supervisor") {
    const conds = [role === "teacher" ? eq(circlesTable.teacherId, req.userId!) : eq(circlesTable.supervisorId, req.userId!)];
    if (req.userCircleId != null) conds.push(eq(circlesTable.id, req.userCircleId));
    const circles = await db.select({ id: circlesTable.id }).from(circlesTable).where(or(...conds));
    return circles.map((c) => c.id);
  }
  if (role === "data_entry") {
    const rows = await db.select({ circleId: dataEntryCircleAssignmentsTable.circleId })
      .from(dataEntryCircleAssignmentsTable)
      .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!));
    return rows.map((r) => r.circleId);
  }
  return [];
}

/** هل هذه الطالبة (students.id) هي صاحبة حساب الطالبة الحالي؟ الربط المحفوظ ثم الاسم ثم السجل. */
export async function isOwnStudent(req: Req, studentId: number, circleId?: number | null): Promise<boolean> {
  if (req.userRole !== "student") return false;
  if (req.userStudentId != null && req.userStudentId === studentId) return true;
  const [me] = await db.select({ name: usersTable.name, circleId: usersTable.circleId }).from(usersTable).where(eq(usersTable.id, req.userId!));
  const [student] = await db.select({ fullName: studentsTable.fullName }).from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!me || !student || !sameText(me.name, student.fullName)) return false;
  // الاسم مطابق: نتأكد بالسجل أنها مسجّلة في حلقة الحساب (أو الحلقة المطلوبة)
  const circles = [circleId, me.circleId, req.userCircleId].filter((c): c is number => c != null);
  if (circles.length === 0) return true;
  const [enrollment] = await db.select({ id: studentEnrollmentsTable.id }).from(studentEnrollmentsTable)
    .where(and(eq(studentEnrollmentsTable.studentId, studentId), inArray(studentEnrollmentsTable.circleId, circles)))
    .limit(1);
  return Boolean(enrollment);
}

/**
 * هل يحق للمستخدمة الوصول لبيانات هذه الطالبة؟ circleId (اختياري) = الحلقة المقصودة تحديدًا؛
 * إن أُعطيت يجب أن تكون ضمن نطاق المستخدمة. التسجيلات المؤرشفة تُحسب أيضًا حتى تبقى
 * السجلات القديمة متاحة لمسؤولات حلقاتها كما كانت.
 */
export async function canAccessStudent(req: Req, studentId: number, circleId?: number | null): Promise<boolean> {
  if (!Number.isFinite(studentId)) return false;
  if (req.userRole === "student") return isOwnStudent(req, studentId, circleId);
  const scope = await accessibleCircleIds(req);
  if (scope === "all") return true;
  if (scope.length === 0) return false;
  if (circleId != null && !scope.includes(circleId)) return false;
  const targetCircles = circleId != null ? [circleId] : scope;
  const [enrollment] = await db.select({ id: studentEnrollmentsTable.id }).from(studentEnrollmentsTable)
    .where(and(eq(studentEnrollmentsTable.studentId, studentId), inArray(studentEnrollmentsTable.circleId, targetCircles)))
    .limit(1);
  if (enrollment) return true;
  // احتياط لطالبات النظام القديم (بلا سجل تسجيل): حلقتها في جدول الطالبات
  const [student] = await db.select({ circleId: studentsTable.circleId }).from(studentsTable).where(eq(studentsTable.id, studentId));
  return Boolean(student?.circleId != null && targetCircles.includes(student.circleId));
}

/** هل الحلقة ضمن نطاق المستخدمة؟ */
export async function canAccessCircle(req: Req, circleId: number): Promise<boolean> {
  const scope = await accessibleCircleIds(req);
  return scope === "all" || scope.includes(circleId);
}

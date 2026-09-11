import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { db, studentsTable, usersTable, circlesTable } from "@workspace/db";
import { logger } from "./logger";

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

const ROLE_LABELS: Record<string, string> = {
  leader: "قائدة",
  teacher: "معلمة",
  supervisor: "مشرفة",
  track_supervisor: "مسؤولة مسار",
  deputy: "نائبة",
  data_entry: "مدخلة بيانات",
  student: "طالبة",
  volunteer: "متطوعة",
  exam_supervisor: "مسؤولة اختبار",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B4A8A" } };
    cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB0B8D8" } } };
  });
  headerRow.height = 24;
}

function addSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  colWidths: number[],
  rows: Record<string, unknown>[],
) {
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  ws.columns = headers.map((h, i) => ({ header: h, key: h, width: colWidths[i] ?? 16 }));
  for (const row of rows) ws.addRow(row);
  styleHeader(ws);
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    row.eachCell(cell => {
      cell.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE0E0E0" } } };
    });
    row.height = 18;
    if (rn % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F2F9" } };
      });
    }
  });
}

export async function runWeeklyBackup(): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const [students, circles, users] = await Promise.all([
    db.select().from(studentsTable),
    db.select().from(circlesTable),
    db.select().from(usersTable),
  ]);

  const circleMap = new Map(circles.map(c => [c.id, c]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "مقرأة سنا الآي";
  wb.created = new Date();

  addSheet(wb, "الطالبات", [
    "الاسم الكامل", "رقم الجوال", "الدولة", "الفئة العمرية",
    "المستوى التعليمي", "المسار", "اسم الحلقة", "بداية الحفظ",
    "الحالة", "تاريخ التسجيل",
  ], [30, 18, 14, 14, 18, 14, 22, 18, 12, 18],
  students.map(s => {
    const circle = s.circleId ? circleMap.get(s.circleId) : null;
    return {
      "الاسم الكامل": s.fullName,
      "رقم الجوال": s.phone ?? "",
      "الدولة": s.country ?? "",
      "الفئة العمرية": s.ageRange ?? "",
      "المستوى التعليمي": s.educationLevel ?? "",
      "المسار": circle?.track ?? "",
      "اسم الحلقة": circle?.name ?? "",
      "بداية الحفظ": s.memorizeFrom ?? "",
      "الحالة": s.isArchived ? "مؤرشفة" : "نشطة",
      "تاريخ التسجيل": formatDate(s.createdAt),
    };
  }));

  const staff = users.filter(u => u.role !== "student" && !u.isArchived);
  addSheet(wb, "الكادر والمتطوعات", [
    "الاسم الكامل", "البريد الإلكتروني", "الدور", "المسار",
    "اسم الحلقة", "رقم الجوال", "الدولة", "تاريخ الانضمام",
  ], [28, 28, 16, 14, 22, 16, 14, 18],
  staff.map(u => {
    const circle = u.circleId ? circleMap.get(u.circleId) : null;
    return {
      "الاسم الكامل": u.name,
      "البريد الإلكتروني": u.email,
      "الدور": ROLE_LABELS[u.role] ?? u.role,
      "المسار": u.track ?? circle?.track ?? "",
      "اسم الحلقة": circle?.name ?? "",
      "رقم الجوال": u.phone ?? "",
      "الدولة": u.country ?? "",
      "تاريخ الانضمام": formatDate(u.createdAt),
    };
  }));

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `نسخة_احتياطية_${dateStr}.xlsx`;
  const filepath = path.join(BACKUP_DIR, filename);
  await wb.xlsx.writeFile(filepath);
  logger.info({ filepath }, "Weekly backup saved");
  return filepath;
}

export function listBackups(): Array<{ filename: string; createdAt: string; sizeKb: number }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith(".xlsx"))
    .map(filename => {
      const stat = fs.statSync(path.join(BACKUP_DIR, filename));
      return { filename, createdAt: stat.mtime.toISOString(), sizeKb: Math.round(stat.size / 1024) };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackupPath(filename: string): string | null {
  const safe = path.basename(filename);
  if (!safe.endsWith(".xlsx")) return null;
  const full = path.join(BACKUP_DIR, safe);
  return fs.existsSync(full) ? full : null;
}

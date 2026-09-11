import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getMeccaToday(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** يحوّل أي أرقام إنجليزية داخل نص أو رقم إلى أرقام عربية هندية للعرض. */
export function toArabicDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, d => ARABIC_DIGITS[Number(d)]);
}

export function makeWhatsAppLink(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("966")) return `https://wa.me/${cleaned}`;
  if (cleaned.startsWith("0")) return `https://wa.me/966${cleaned.slice(1)}`;
  return `https://wa.me/${cleaned}`;
}

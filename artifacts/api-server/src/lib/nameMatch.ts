// مطابقة الأسماء والجوالات — دوال نقية بلا قاعدة بيانات (قابلة للاختبار)

const DIACRITICS = /[ً-ٰٟـ]/g; // التشكيل والتطويل

/** اسم موحّد للمقارنة: أ/إ/آ←ا، ة←ه، ى←ي، بلا تشكيل ولا تطويل، ومسافة واحدة. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^ء-يa-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** آخر ٩ أرقام من الجوال (يتجاهل مفتاح الدولة والصفر والرموز)، أو "" */
export function phoneTail(phone: string | null | undefined): string {
  const digits = (phone ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-9) : "";
}

/** «ab***@gmail.com» — لتلميح البريد دون كشفه */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!user || !domain) return "";
  return `${user.slice(0, 2)}***@${domain}`;
}

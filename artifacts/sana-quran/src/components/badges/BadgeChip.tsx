// ============================================================================
// عرض موحّد لوسام واحد — نفس الشكل بالضبط بكل صفحات الأوسمة (حلقتي، نظرة
// الحلقة، تقدمي، مستحقات الأوسمة): صورة نظيفة 200×200px، بدون أي خلفية أو
// قص أو تشويه (object-contain يحافظ على نسبة 1:1)، وإلا إيموجي احتياطي لو
// ما فيه صورة. نفضّل thumb (240×240px) على الصورة الكاملة (1254×1254px) —
// نفس الصورة بالضبط بجودة عالية تكفي بهالحجم، بس أخف بكثير على التحميل.
// ============================================================================
import { useState } from "react";

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

export interface BadgeChipData {
  name: string;
  subtitle?: string | null;
  emoji?: string | null;
  image?: string | null;
  thumb?: string | null;
  color?: string | null;
}

export function BadgeChip({
  badge,
  trailing,
  meta,
  compact = false,
  size = 200,
}: {
  badge: BadgeChipData;
  /** نص إضافي يُلحق باسم الوسام (مثل "تكررت ٣ مرات") */
  trailing?: React.ReactNode;
  /** سياق إضافي بين قوسين (مثل اسم الحلقة) */
  meta?: string;
  /** true = صورة الوسام فقط، بدون اسمه أو وصفه تحتها */
  compact?: boolean;
  /** حجم الصورة بالبكسل (افتراضيًا 200) */
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = badge.thumb || badge.image;

  return (
    <div className="inline-flex flex-col items-center text-center gap-1" style={{ width: size + 16 }}>
      {src && !imgFailed ? (
        <img
          src={`${BASE}/${src.replace(/^\//, "")}`}
          alt={badge.name}
          width={size}
          height={size}
          className="object-contain shrink-0"
          style={{ width: size, height: size }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.45 }}>
          {badge.emoji}
        </span>
      )}
      {!compact && (
        <span className="text-xs font-semibold leading-tight" style={{ color: badge.color ?? undefined }}>
          {badge.name}
        </span>
      )}
      {!compact && badge.subtitle && (
        <span className="text-[10px] text-muted-foreground leading-tight">{badge.subtitle}</span>
      )}
      {(trailing || meta) && (
        <span className="text-[10px] text-muted-foreground leading-tight">
          {meta && <>({meta}) </>}
          {trailing}
        </span>
      )}
    </div>
  );
}

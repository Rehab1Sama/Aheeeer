// ============================================================================
// عرض موحّد لوسام واحد — نفس الشكل بالضبط بكل صفحات الأوسمة (حلقتي، نظرة
// الحلقة، تقدمي، مستحقات الأوسمة): صورة نظيفة 88×88px، بدون أي خلفية أو
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
}: {
  badge: BadgeChipData;
  /** نص إضافي يُلحق باسم الوسام (مثل "تكررت ٣ مرات") */
  trailing?: React.ReactNode;
  /** سياق إضافي بين قوسين (مثل اسم الحلقة) */
  meta?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = badge.thumb || badge.image;

  return (
    <div className="inline-flex flex-col items-center text-center gap-1 w-[104px]">
      {src && !imgFailed ? (
        <img
          src={`${BASE}/${src.replace(/^\//, "")}`}
          alt={badge.name}
          width={88}
          height={88}
          className="w-[88px] h-[88px] object-contain shrink-0"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="w-[88px] h-[88px] flex items-center justify-center text-4xl shrink-0">
          {badge.emoji}
        </span>
      )}
      <span className="text-xs font-semibold leading-tight" style={{ color: badge.color ?? undefined }}>
        {badge.name}
        {trailing}
        {meta && <span className="font-normal opacity-70"> ({meta})</span>}
      </span>
      {badge.subtitle && (
        <span className="text-[10px] text-muted-foreground leading-tight">{badge.subtitle}</span>
      )}
    </div>
  );
}

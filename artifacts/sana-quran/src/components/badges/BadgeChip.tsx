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
  size = 200,
  compact = false,
}: {
  badge: BadgeChipData;
  trailing?: React.ReactNode;
  meta?: string;
  compact?: boolean;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  // استخدام الصورة الأصلية أولًا وبنفس جودتها
  const src = badge.image || badge.thumb;

  // الحجم الفعلي للوسام:
  // في الوضع المضغوط نستخدم 160px بدل المساحة الكبيرة المرسلة من الصفحة.
  const displaySize = compact ? Math.min(size, 160) : size;

  return (
    <div
      className="inline-flex items-start justify-center overflow-hidden"
      style={{
        width: displaySize,
        height: displaySize,
      }}
    >
      {src && !imgFailed ? (
        <div
          className="flex items-start justify-center overflow-hidden"
          style={{
            width: displaySize,
            height: displaySize,
          }}
        >
          <img
            src={`${BASE}/${src.replace(/^\//, "")}`}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="block object-contain"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: "scale(2.2)",
              transformOrigin: "center center",
            }}
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <span
          className="flex items-center justify-center"
          style={{
            width: displaySize,
            height: displaySize,
            fontSize: displaySize * 0.45,
          }}
          aria-hidden="true"
        >
          {badge.emoji}
        </span>
      )}
    </div>
  );
}

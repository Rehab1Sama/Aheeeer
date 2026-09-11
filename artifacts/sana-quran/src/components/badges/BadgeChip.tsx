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

  return (
    <div
      className="inline-flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
      }}
    >
      {src && !imgFailed ? (
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{
            width: size,
            height: size,
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
            width: size,
            height: size,
            fontSize: size * 0.45,
          }}
          aria-hidden="true"
        >
          {badge.emoji}
        </span>
      )}
    </div>
  );
}

// إطار الوسام: دوائر المقرأة (دائرة ملوَّنة بلون الوسام، حلقة متقطعة، نقطة ذهبية وأخرى زرقاء)،
// ولمعة خفيفة وشارة «جديد» إذا مُنح خلال آخر ٧ أيام.
import type { ReactNode } from "react";

export function isNewBadge(at?: string | null): boolean {
  if (!at) return false;
  const t = new Date(at).getTime();
  return Number.isFinite(t) && Date.now() - t < 7 * 24 * 3600 * 1000;
}

export function BadgeFrame({
  children, name, subtitle, color, isNew = false, size = 132,
}: {
  children: ReactNode;
  name: string;
  subtitle?: string | null;
  color?: string | null;
  isNew?: boolean;
  size?: number;
}) {
  const c = color || "#2B3784";
  const ring = Math.round(size * 0.86);
  return (
    <div className="flex w-[9.5rem] flex-col items-center text-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <div
          className={`absolute rounded-full ${isNew ? "badge-shine" : ""}`}
          style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, hsl(var(--card)) 0%, color-mix(in oklab, ${c} 18%, hsl(var(--muted))) 72%)`, boxShadow: `0 6px 22px color-mix(in oklab, ${c} 22%, transparent)` }}
        />
        <div className="absolute rounded-full border-2 border-dashed" style={{ width: ring, height: ring, borderColor: `color-mix(in oklab, ${c} 45%, #C8CDE8)` }} />
        <span className="absolute h-2.5 w-2.5 rounded-full bg-[#C4A76A] ring-2 ring-card" style={{ left: size * 0.1, top: size * 0.12 }} />
        <span className="absolute h-1.5 w-1.5 rounded-full bg-[#9EA8CC]" style={{ right: size * 0.12, bottom: size * 0.14 }} />
        <div className="relative flex items-center justify-center overflow-hidden rounded-full" style={{ width: size * 0.72, height: size * 0.72 }}>
          {children}
        </div>
        {isNew && (
          <span className="absolute -top-1 right-1 rounded-full bg-[#C4A76A] px-2 py-0.5 text-[10px] font-bold text-white shadow">جديد</span>
        )}
      </div>
      <p className="mt-2 text-sm font-bold leading-5 text-foreground">{name}</p>
      {subtitle && <p className="text-[11px] leading-4 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

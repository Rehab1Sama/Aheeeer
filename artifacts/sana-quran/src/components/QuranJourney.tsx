// رحلة الحفظ: طريق متعرِّج فيه ٣٠ محطة (الأجزاء)، والمحطات المقطوعة ذهبية، ونقطة مضيئة عند موضع الطالبة.
const TOTAL_PAGES = 604;
const XS = [280, 232, 184, 136, 88, 40]; // من اليمين لليسار
const ROW_H = 58;
const TOP = 26;
const STRAIGHT = 48;
const ARC = Math.PI * (ROW_H / 2);

const toAr = (n: number) => n.toLocaleString("ar-EG");
const juzText = (n: number) => (n === 1 ? "جزءًا واحدًا" : n === 2 ? "جزأين" : `${toAr(n)} ${n <= 10 ? "أجزاء" : "جزءًا"}`);

function station(i: number): { x: number; y: number } {
  // i من ١ إلى ٣٠
  const row = Math.floor((i - 1) / 6);
  const col = (i - 1) % 6;
  const x = row % 2 === 0 ? XS[col]! : XS[5 - col]!;
  return { x, y: TOP + row * ROW_H };
}

function buildPath(): string {
  let d = "";
  for (let i = 1; i <= 30; i++) {
    const p = station(i);
    if (i === 1) { d += `M ${p.x} ${p.y}`; continue; }
    const prevRow = Math.floor((i - 2) / 6);
    const row = Math.floor((i - 1) / 6);
    if (row === prevRow) d += ` L ${p.x} ${p.y}`;
    else {
      // المنعطف: يسار عند نهاية الصفوف الزوجية، ويمين عند نهاية الفردية
      const sweep = prevRow % 2 === 0 ? 0 : 1;
      d += ` A ${ROW_H / 2} ${ROW_H / 2} 0 0 ${sweep} ${p.x} ${p.y}`;
    }
  }
  return d;
}

/** طول الطريق من المحطة الأولى حتى الموضع v (١ = المحطة الأولى) */
function lengthAt(v: number): number {
  if (v <= 1) return 0;
  let len = 0;
  const whole = Math.floor(v);
  for (let i = 2; i <= Math.min(whole, 30); i++) len += (i - 1) % 6 === 0 ? ARC : STRAIGHT;
  if (whole < 30) len += (v - whole) * (whole % 6 === 0 ? ARC : STRAIGHT);
  return len;
}

export default function QuranJourney({ pages }: { pages: number }) {
  const juz = Math.max(0, Math.min(30, (pages / TOTAL_PAGES) * 30));
  const total = lengthAt(30);
  const done = lengthAt(Math.max(1, juz));
  const path = buildPath();
  const current = Math.max(1, Math.min(30, Math.floor(juz) || 1));
  const here = station(juz >= 1 ? Math.min(30, Math.floor(juz)) : 1);
  const height = TOP * 2 + ROW_H * 4;

  return (
    <div className="relative">
      <svg viewBox={`0 0 320 ${height}`} className="w-full h-auto" role="img" aria-label={`رحلة الحفظ: ${toAr(Math.floor(juz))} من ٣٠ جزءًا`}>
        {/* الطريق كاملًا */}
        <path d={path} fill="none" stroke="#E4E7F4" strokeWidth={10} strokeLinecap="round" className="dark:stroke-[#2B3784]/50" />
        <path d={path} fill="none" stroke="#C8CDE8" strokeWidth={1.2} strokeDasharray="3 5" strokeLinecap="round" />
        {/* المقطوع منه */}
        {juz >= 1 && (
          <path d={path} fill="none" stroke="url(#journeyGrad)" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${done} ${total + 20}`} />
        )}
        <defs>
          <linearGradient id="journeyGrad" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A2260" />
            <stop offset="100%" stopColor="#2B3784" />
          </linearGradient>
        </defs>
        {/* المحطات */}
        {Array.from({ length: 30 }, (_, k) => {
          const i = k + 1;
          const p = station(i);
          const reached = juz >= i;
          const milestone = i % 5 === 0 || i === 1;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={milestone ? 7 : 5} fill={reached ? "#C4A76A" : "#fff"} stroke={reached ? "#fff" : "#C8CDE8"} strokeWidth={1.5} />
              {(milestone || i === current) && (
                <text x={p.x} y={p.y + 21} textAnchor="middle" fontSize={9} fontWeight={700} fill={reached ? "#2B3784" : "#9EA8CC"} className="dark:fill-[#E4E7F4]">
                  {toAr(i)}
                </text>
              )}
            </g>
          );
        })}
        {/* موضع الطالبة */}
        <circle cx={here.x} cy={here.y} r={11} fill="#C4A76A" opacity={0.35} className="journey-glow" />
        <circle cx={here.x} cy={here.y} r={4} fill="#1A2260" stroke="#fff" strokeWidth={1.5} />
      </svg>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>البداية</span>
        <span className="font-bold text-primary">
          {juz < 1 ? "في الطريق إلى الجزء الأول 🌸" : `قطعتِ ${juzText(Math.floor(juz))} من ٣٠ 🌿`}
        </span>
        <span>الختمة</span>
      </div>
    </div>
  );
}

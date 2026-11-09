// رسائل التحفيز بعد الإدخال — بأسلوب القائدة رِحاب: دافئة، فيها «حبيبة» و«الله يسعدكِ» و«بارك الله فيكِ»،
// وتختلف كل مرة. تُختار حسب الحال: اكتمل الإدخال في وقته، أو اكتمل متأخرًا، أو بقي جزء.

export type EntryState = { missing: number; late: boolean; name: string };

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

const COMPLETE_ON_TIME = [
  "الله يسعدكِ يا {name} 🌸 أدخلتِ بيانات حلقتكِ كاملة وبوقتها، جعله الله في ميزان حسناتكِ",
  "تم ❤️ بارك الله فيكِ يا {name}، إدخال كامل ومرتب، ما شاء الله تبارك الله",
  "يا {name} يا قمرة 🌷 كل طالباتكِ مسجّلات اليوم، الله يكتب أجركِ ويرفع قدركِ",
  "ما شاء الله يا {name} ✨ حلقتكِ اكتملت، وجهدكِ هذا يفرق مع البنات كثير",
  "جزاكِ الله خيرًا يا {name} 💐 إدخال كامل وفي وقته، ربي يسعد قلبكِ مثل ما تسعدينا",
  "يسعد عينكِ يا {name} 🤍 خلّصتِ إدخال اليوم كامل، الله يجعله نورًا لكِ",
  "حبيبة {name} 🌸 بياناتكِ كاملة، وكل صفحة سجلتِها شاهدة لكِ بإذن الله",
];
const COMPLETE_LATE = [
  "تم ❤️ الله يسعدكِ يا {name}، الإدخال اكتمل — وإن قدرتِ المرة الجاية قبل الواحدة يكون أجمل 🌷",
  "بارك الله فيكِ يا {name} 🌸 أهم شي إن حلقتكِ اكتملت، ونحاول بكرة نسبق الوقت شوي ✨",
  "جزاكِ الله خيرًا يا {name} 💐 تعبكِ واصل ولو متأخر، ربي يعينكِ ويبارك في وقتكِ",
  "يسعدكِ ربي يا {name} 🤍 اكتمل الإدخال، وأدري إن يومكِ مزحوم — الله يكتب أجركِ",
];
const PARTIAL = [
  "ما شاء الله يا {name} 🌷 باقي {n} — كمّليهن وتكتمل حلقتكِ اليوم",
  "بارك الله فيكِ يا {name} ✨ قربتِ! باقي {n} بس",
  "تم الحفظ ❤️ يا {name}، وباقي {n} — الله يعينكِ عليهن",
  "حبيبة {name} 🌸 خطوة حلوة، باقي {n} وتكملين",
];

function plural(n: number): string {
  if (n === 1) return "طالبة واحدة";
  if (n === 2) return "طالبتان";
  return `${n.toLocaleString("ar-EG")} ${n <= 10 ? "طالبات" : "طالبة"}`;
}

export function motivationMessage(s: EntryState): string {
  const first = (s.name || "").trim().split(/\s+/)[0] || "قمرة";
  const tpl = s.missing > 0 ? pick(PARTIAL) : s.late ? pick(COMPLETE_LATE) : pick(COMPLETE_ON_TIME);
  return tpl.replace("{name}", first).replace("{n}", plural(s.missing));
}

/** دقائق منذ بداية يوم الدوام (٥ صباحًا بتوقيت مكة) — الإدخال بعد الواحدة ليلًا متأخر */
export function isLateEntryNow(now = new Date()): boolean {
  const makkah = new Date(now.getTime() + 3 * 3600 * 1000);
  const h = makkah.getUTCHours();
  return h >= 1 && h < 5;
}

/** يُطلق بعد أي حفظ ناجح للإدخال، فتعرض الواجهة رسالة التحفيز */
export function notifyEntrySaved(): void {
  window.dispatchEvent(new CustomEvent("sana:entry-saved"));
}

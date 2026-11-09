// رسائل التحفيز بعد الإدخال — بأسلوب القائدة رِحاب: نداء محبّب ودعاء قصير،
// وتختلف كل مرة. تُختار حسب الحال: اكتمل الإدخال في وقته، أو اكتمل متأخرًا، أو بقي جزء.

export type EntryState = { missing: number; late: boolean; name: string };

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

// الرموز المسموحة فقط: 🌸 ♥️ 🌧️ 🌿
const COMPLETE_ON_TIME = [
  "حبيبتنا {name}! أحسن الله إليكِ وعظّم لكِ الأجر 🌧️",
  "يا مُبهجة! رفع المولى قدركِ ♥️",
  "قمرتنا {name}، شكر الله لكِ ♥️",
  "يا نوّارة الحلقة! بارك الله في وقتكِ وجهدكِ 🌸",
  "حبيبتنا {name}! جعل الله ما قدّمتِ نورًا لكِ يوم تلقينه 🌧️",
  "يا غالية! كتب الله أجركِ وأسعد قلبكِ كما تسعدين البنات 🌿",
  "قمرتنا {name}، جزاكِ الله عنّا وعن طالباتكِ خير الجزاء ♥️",
  "يا مُبهجة! زادكِ الله من فضله ورفع ذكركِ 🌸",
  "حبيبتنا {name}! ربي يجعلها في ميزان حسناتكِ 🌧️",
  "يا بركة الحلقة! حفظكِ الله وبارك فيكِ ♥️",
];
const COMPLETE_LATE = [
  "تعبتِ؟ احتسبي حبيبة، وتذكري جزاء جُهدكِ 🌧️",
  "حبيبتنا {name}! ربي يبارك في وقتكِ ويعينكِ على كل ما بين يديكِ 🌿",
  "قمرتنا {name}، أجركِ محفوظ ولو تأخر الوقت، شكر الله لكِ ♥️",
  "يا صابرة! جعل الله تعبكِ هذا شاهدًا لكِ لا عليكِ 🌧️",
  "حبيبتنا {name}! الله يريّح قلبكِ كما أرحتِ قلوبنا 🌸",
];
const PARTIAL = [
  "حبيبتنا {name}! باقي {n} وتكتمل حلقتكِ، الله يعينكِ 🌿",
  "يا مُبهجة! قربتِ، باقي {n} فقط 🌸",
  "قمرتنا {name}، بارك الله فيكِ، وباقي {n} ♥️",
  "تعبتِ؟ احتسبي حبيبة، باقي {n} وتختمين 🌧️",
];

function plural(n: number): string {
  if (n === 1) return "طالبة واحدة";
  if (n === 2) return "طالبتان";
  return `${n.toLocaleString("ar-EG")} ${n <= 10 ? "طالبات" : "طالبة"}`;
}

export function motivationMessage(s: EntryState): string {
  const first = (s.name || "").trim().split(/\s+/)[0] || "الغالية";
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

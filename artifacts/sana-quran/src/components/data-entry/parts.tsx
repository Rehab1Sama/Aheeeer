// أجزاء صفحة إدخال البيانات (نُقلت من pages/data-entry.tsx لتصغير الملف — بلا تغيير في السلوك):
// التواريخ، الإدخال الصوتي، اختيار السورة والآية، وحالة النموذج.
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { schoolConfig, resolveTrackType, getInputFields } from "@/lib/schoolConfig";
import {
  useGetMissingDataEntry,
  useCreateRecord,
  useUpdateRecord,
  useGetCurrentUser,
  useListCircles,
  useListTracks,
  useGetRepeatedAbsences,
  useListRecords,
  useCheckTeacherAbsence,
  useMarkTeacherAbsent,
  useDeleteTeacherAbsence,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MonthlyLeaderboardCard from "@/components/MonthlyLeaderboardCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SURAHS, calculatePages, formatPages, type Surah } from "@/lib/quran";
import {
  PenSquare,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Users,
  CalendarDays,
  Search,
  UserX,
  Undo2,
  XCircle,
  Mic,
  Archive,
  ArchiveRestore,
  ClipboardList,
  Zap,
} from "lucide-react";
import { getDayDates, getCurrentPlanDay } from "@/components/ReviewPlanSection";


export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const getToken = () => localStorage.getItem("sana_auth_token");

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getMeccaToday(): string {
  // توقيت مكة مع بدء اليوم 5 صباحاً
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getCurrentWeekWorkingDays(): { label: string; value: string }[] {
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const todayStr = getMeccaToday();
  const today = new Date(todayStr + "T12:00:00Z");
  const todayDow = today.getUTCDay();

  let daysBackToSunday: number;
  if (todayDow === 5) daysBackToSunday = 5;
  else if (todayDow === 6) daysBackToSunday = 6;
  else daysBackToSunday = todayDow;

  const weekSunday = new Date(today.getTime() - daysBackToSunday * 86400000);
  const result: { label: string; value: string }[] = [];

  for (let i = 0; i <= daysBackToSunday; i++) {
    const d = new Date(weekSunday.getTime() + i * 86400000);
    const dow = d.getUTCDay();
    if (dow <= 4) {
      const value = d.toISOString().slice(0, 10);
      const label =
        value === todayStr ? `اليوم (${dayNames[dow]})` : dayNames[dow];
      result.push({ label, value });
    }
  }
  return result.reverse();
}

export function isThursdayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr + "T12:00:00Z").getUTCDay() === 4;
}

// نافذة إدخال الأمهات الأسبوعي: تفتح الأربعاء وتبقى مفتوحة الخميس والجمعة
// (نفس أسبوع الأربعاء)، عشان تقدر المعلمة تتدارك لو ما قدرت تدخل بالضبط
// يوم الأربعاء. تُغلق بعدها لين الأربعاء الجاي.
export function getMothersWeeklyWindow(): { open: boolean; wednesdayDate: string } {
  const todayStr = getMeccaToday();
  const today = new Date(todayStr + "T12:00:00Z");
  const dow = today.getUTCDay(); // الأحد=0 ... الأربعاء=3 ... الجمعة=5
  if (dow < 3 || dow > 5) return { open: false, wednesdayDate: "" };
  const wed = new Date(today.getTime() - (dow - 3) * 86400000);
  return { open: true, wednesdayDate: wed.toISOString().slice(0, 10) };
}

export const THURSDAY_QUOTA_EXCLUDED_TYPES = ["recitation", "children", "mothers"];

export function nextPosition(surahName: string, ayah: number): { surah: string; ayah: string } {
  const idx = SURAHS.findIndex((s) => s.name === surahName);
  if (idx === -1) return { surah: surahName, ayah: String(ayah + 1) };
  const cur = SURAHS[idx];
  if (ayah >= cur.ayahs) {
    const next = SURAHS[idx + 1];
    return next ? { surah: next.name, ayah: "1" } : { surah: surahName, ayah: String(ayah) };
  }
  return { surah: surahName, ayah: String(ayah + 1) };
}

// ─── Voice Input ─────────────────────────────────────────────────────────────

export function normalizeAr(s: string): string {
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064E-\u0652]/g, "")
    .trim();
}

export function findSurahFuzzy(raw: string): { match: Surah | null; suggestions: Surah[] } {
  if (!raw.trim()) return { match: null, suggestions: [] };
  const norm = normalizeAr(raw.trim());
  const exact = SURAHS.find((s) => {
    const sn = normalizeAr(s.name);
    return sn === norm || norm.includes(sn) || sn.includes(norm);
  });
  if (exact) return { match: exact, suggestions: [] };
  const scores = SURAHS.map((s) => {
    const sn = normalizeAr(s.name);
    let score = 0;
    const chars = new Set(sn.split(""));
    for (const ch of norm) if (chars.has(ch)) score += 2;
    if (norm.length >= 2 && sn.startsWith(norm.slice(0, 2))) score += 8;
    if (sn.length >= 2 && norm.startsWith(sn.slice(0, 2))) score += 6;
    return { surah: s, score };
  }).sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (top.score <= 0) return { match: null, suggestions: [] };
  const second = scores[1];
  if (top.score >= second.score + 6) return { match: top.surah, suggestions: [] };
  return { match: null, suggestions: scores.slice(0, 5).map((x) => x.surah) };
}

export function extractAfterKeyword(text: string, keyword: string, stopKeywords: string[]): string {
  const idx = text.indexOf(keyword);
  if (idx === -1) return "";
  let seg = text.slice(idx + keyword.length).replace(/^\s*[,،و]\s*/, "").trim();
  for (const kw of stopKeywords) {
    const ni = seg.indexOf(kw);
    if (ni !== -1) seg = seg.slice(0, ni).trim();
  }
  return seg;
}

export function extractFirstNumber(s: string): string {
  const norm = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = norm.match(/\d+/);
  return m ? m[0] : "";
}

export type ParsedVoice = { startSurahRaw: string; startAyah: string; endSurahRaw: string; endAyah: string };

export function parseVoiceTranscript(text: string): ParsedVoice {
  const t = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/وآية/g, " وآية")
    .replace(/وسورة/g, " وسورة");
  const ALL_STOPS = [
    "سورة البداية", "آية البداية", "وآية البداية",
    "سورة النهاية", "آية النهاية", "وآية النهاية",
    "من سورة", "من آية", "إلى سورة", "إلى آية", "إلى", "سورة", "آية",
  ];
  const tryGet = (kws: string[]): string => {
    for (const kw of kws) {
      const seg = extractAfterKeyword(t, kw, ALL_STOPS.filter((k) => k !== kw));
      if (seg.trim()) return seg.trim();
    }
    return "";
  };
  const startSurahRaw =
    tryGet(["سورة البداية", "من سورة"]) ||
    extractAfterKeyword(t, "سورة", ALL_STOPS.filter((k) => k !== "سورة")).trim();
  const startAyahRaw = tryGet(["آية البداية", "وآية البداية", "من آية"]);
  const startAyah = extractFirstNumber(startAyahRaw) || extractFirstNumber(t) || "1";
  const endSurahRaw = tryGet(["سورة النهاية", "إلى سورة"]) || startSurahRaw;
  const endAyahRaw = tryGet(["آية النهاية", "وآية النهاية", "إلى آية"]);
  let endAyah = extractFirstNumber(endAyahRaw);
  if (!endAyah) {
    const allNums = t.match(/\d+/g);
    endAyah = allNums && allNums.length > 1 ? allNums[allNums.length - 1] : startAyah;
  }
  return { startSurahRaw, startAyah, endSurahRaw, endAyah };
}

export type SuggestState = { field: "start" | "end"; raw: string; suggestions: Surah[]; parsed: ParsedVoice };

export function VoiceInputButton({
  onResult,
}: {
  onResult: (ss: string, as: string, se: string, ae: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [suggest, setSuggest] = useState<SuggestState | null>(null);

  const resolve = (parsed: ParsedVoice, overrideStart?: string, overrideEnd?: string) => {
    const startName = overrideStart ?? findSurahFuzzy(parsed.startSurahRaw).match?.name;
    const endName = overrideEnd ?? (findSurahFuzzy(parsed.endSurahRaw).match?.name ?? startName);
    if (!startName) return;
    onResult(startName, parsed.startAyah || "1", endName || startName, parsed.endAyah || parsed.startAyah || "1");
  };

  const handleTranscript = (text: string) => {
    setShowText(false);
    setTextDraft("");
    const parsed = parseVoiceTranscript(text);
    const startResult = findSurahFuzzy(parsed.startSurahRaw);
    if (!startResult.match) {
      if (startResult.suggestions.length > 0) {
        setSuggest({ field: "start", raw: parsed.startSurahRaw, suggestions: startResult.suggestions, parsed });
        return;
      }
      setTextDraft(text);
      setMicError("لم أتعرف على السورة — يمكنك تعديل النص يدوياً");
      setShowText(true);
      return;
    }
    const endResult = findSurahFuzzy(parsed.endSurahRaw);
    if (!endResult.match && endResult.suggestions.length > 0 && parsed.endSurahRaw !== parsed.startSurahRaw) {
      setSuggest({ field: "end", raw: parsed.endSurahRaw, suggestions: endResult.suggestions, parsed });
      return;
    }
    resolve(parsed);
  };

  const pickSuggestion = (surah: Surah) => {
    if (!suggest) return;
    const { field, parsed } = suggest;
    setSuggest(null);
    if (field === "start") {
      const endResult = findSurahFuzzy(parsed.endSurahRaw);
      if (!endResult.match && endResult.suggestions.length > 0 && parsed.endSurahRaw !== parsed.startSurahRaw) {
        setSuggest({ field: "end", raw: parsed.endSurahRaw, suggestions: endResult.suggestions, parsed });
      }
      resolve(parsed, surah.name, endResult?.match?.name ?? surah.name);
    } else {
      resolve(parsed, undefined, surah.name);
    }
  };

  const startMic = () => {
    setMicError(null);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMicError("متصفحك لا يدعم الميكروفون");
      setShowText(true);
      return;
    }
    const r = new SR();
    r.lang = "ar-SA";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = (ev: any) => {
      setListening(false);
      const msg = ev?.error === "not-allowed"
        ? "لم تُمنح صلاحية الميكروفون — استخدمي الكتابة اليدوية"
        : ev?.error === "no-speech"
        ? "لم يُكشف صوت — حاولي مجدداً أو استخدمي الكتابة"
        : "خطأ في الميكروفون";
      setMicError(msg);
      setShowText(true);
    };
    r.onresult = (e: any) => handleTranscript(e.results[0][0].transcript);
    r.start();
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={startMic}
          title={listening ? "جاري الاستماع..." : "إدخال صوتي"}
          className={`p-1.5 rounded-lg border transition-colors ${
            listening
              ? "bg-rose-100 border-rose-300 text-rose-600 animate-pulse"
              : "bg-muted/40 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => { setMicError(null); setShowText(true); }}
          title="كتابة نصية يدوية"
          className="p-1.5 rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-xs font-bold"
        >
          ✏️
        </button>
      </div>

      {/* نافذة الكتابة اليدوية */}
      {showText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">✏️ كتابة يدوية</h3>
              {micError && (
                <p className="text-xs text-rose-600 mt-1 bg-rose-50 rounded-lg px-2 py-1">{micError}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                اكتبي النص بأي صيغة، مثال:<br />
                <span className="font-medium text-foreground">سورة البداية البقرة آية البداية ١ سورة النهاية البقرة آية النهاية ١٠</span>
              </p>
            </div>
            <textarea
              value={textDraft}
              onChange={e => setTextDraft(e.target.value)}
              placeholder="اكتبي هنا..."
              rows={3}
              className="w-full border border-input rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { if (textDraft.trim()) handleTranscript(textDraft.trim()); }}
                disabled={!textDraft.trim()}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                تحليل وتعبئة
              </button>
              <button
                onClick={() => { setShowText(false); setTextDraft(""); setMicError(null); }}
                className="flex-1 border border-border rounded-xl py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {suggest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h3 className="font-bold text-base">اختاري السورة</h3>
              <p className="text-sm text-muted-foreground mt-1">
                لم أتعرف على{" "}
                <span className="font-semibold text-foreground">«{suggest.raw}»</span>{" "}
                بدقة — اختاري من القائمة:
              </p>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {suggest.suggestions.map((s) => (
                <button
                  key={s.number}
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-right px-4 py-3 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm font-medium"
                >
                  {s.number}. {s.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSuggest(null)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Surah / Ayah selectors ───────────────────────────────────────────────────

export function SurahSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return SURAHS;
    const norm = (s: string) =>
      s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[\u064E-\u0652]/g, "").trim();
    const q = norm(query.trim());
    return SURAHS.filter((s) => {
      const n = norm(s.name);
      return n.includes(q) || String(s.number).startsWith(q);
    });
  }, [query]);

  return (
    <div className="space-y-1 w-full">
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن سورة..."
          className="w-full border border-input rounded-md pr-7 pl-2 py-1.5 text-sm bg-background text-right placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>
      <select
        className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={filtered.length > 0 && query.trim() ? Math.min(filtered.length + 1, 5) : undefined}
      >
        <option value="">اختر السورة</option>
        {filtered.map((s) => (
          <option key={s.number} value={s.name}>
            {s.number}. {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AyahSelect({
  surahName,
  value,
  onChange,
}: {
  surahName: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const surah = SURAHS.find((s) => s.name === surahName);
  const max = surah?.ayahs ?? 0;

  const filtered = useMemo(() => {
    if (!max) return [];
    const q = query.trim();
    if (!q) return Array.from({ length: max }, (_, i) => i + 1);
    return Array.from({ length: max }, (_, i) => i + 1).filter((n) =>
      String(n).startsWith(q)
    );
  }, [max, query]);

  return (
    <div className="space-y-1 w-full">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max || undefined}
        disabled={!surahName}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // if the typed value is a valid ayah, select it immediately
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= 1 && n <= max) onChange(String(n));
          else if (e.target.value === "") onChange("");
        }}
        placeholder={max ? `١ — ${max}` : "آية"}
        className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <select
        className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right disabled:opacity-50 disabled:cursor-not-allowed"
        value={value}
        disabled={!surahName}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
        }}
        size={filtered.length > 0 && query.trim() ? Math.min(filtered.length + 1, 5) : undefined}
      >
        <option value="">آية</option>
        {filtered.map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionState {
  surahStart: string;
  ayahStart: string;
  surahEnd: string;
  ayahEnd: string;
}

export interface FormState {
  isAbsent: boolean;
  memorize: SectionState;
  reviewNear: SectionState;
  reviewFar: SectionState;
  reviewFar2: SectionState;
  review: SectionState;
  recitation: SectionState;
  repetitions: string;
  listenedToReciter: boolean | null;
  noReviewNear: boolean;
  noReviewFar: boolean;
  noReviewFar2: boolean;
  noReview: boolean;
  memorizeMode: "range" | "manual";
  manualPages: string;
  reviewMode: "range" | "manual";
  manualReviewPages: string;
}

export const emptySection = (): SectionState => ({
  surahStart: "",
  ayahStart: "",
  surahEnd: "",
  ayahEnd: "",
});

export const emptyForm = (): FormState => ({
  isAbsent: false,
  memorize: emptySection(),
  reviewNear: emptySection(),
  reviewFar: emptySection(),
  reviewFar2: emptySection(),
  review: emptySection(),
  recitation: emptySection(),
  repetitions: "7",
  listenedToReciter: null,
  noReviewNear: false,
  noReviewFar: false,
  noReviewFar2: true,
  noReview: false,
  memorizeMode: "range",
  manualPages: "",
  reviewMode: "range",
  manualReviewPages: "",
});

export function calcPages(s: SectionState) {
  return calculatePages(s.surahStart, Number(s.ayahStart), s.surahEnd, Number(s.ayahEnd));
}

// ─── SurahSection Component ───────────────────────────────────────────────────

export function SurahSection({
  title,
  color,
  section,
  onChange,
  autoSuggested,
  locked,
  onToggleLock,
  onVoiceFill,
}: {
  title: string;
  color: string;
  section: SectionState;
  onChange: (field: keyof SectionState, val: string) => void;
  autoSuggested?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  onVoiceFill?: (ss: string, as: string, se: string, ae: string) => void;
}) {
  const pages = calcPages(section);
  return (
    <div className={`border rounded-xl p-4 space-y-3 ${locked ? "border-amber-300 bg-amber-50/60 opacity-80" : color}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          {title}
          {autoSuggested && !locked && (
            <span className="text-[11px] font-normal bg-white/60 text-muted-foreground px-1.5 py-0.5 rounded-full border border-border/40">
              مقترح ✦
            </span>
          )}
          {locked && (
            <span className="text-[11px] font-semibold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              <XCircle className="w-3 h-3" /> لم تراجع
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {pages > 0 && !locked && (
            <Badge className="bg-white/70 text-foreground border-0 text-xs font-bold">
              {formatPages(pages)} وجه
            </Badge>
          )}
          {onVoiceFill && !locked && <VoiceInputButton onResult={onVoiceFill} />}
          {onToggleLock && (
            <button
              type="button"
              onClick={onToggleLock}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                locked
                  ? "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"
                  : "bg-amber-100 border-amber-200 text-amber-800 hover:bg-amber-200"
              }`}
            >
              {locked ? "إلغاء" : "لم تراجع"}
            </button>
          )}
        </div>
      </div>
      {!locked && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">من سورة</Label>
            <SurahSelect value={section.surahStart} onChange={(v) => onChange("surahStart", v)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">آية البداية</Label>
            <AyahSelect surahName={section.surahStart} value={section.ayahStart} onChange={(v) => onChange("ayahStart", v)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">إلى سورة</Label>
            <SurahSelect value={section.surahEnd} onChange={(v) => onChange("surahEnd", v)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">آية النهاية</Label>
            <AyahSelect surahName={section.surahEnd} value={section.ayahEnd} onChange={(v) => onChange("ayahEnd", v)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Heartbeat hook ───────────────────────────────────────────────────────────

export function useHeartbeat(isDataEntry: boolean) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isDataEntry) return;
    const send = () => {
      const token = getToken();
      if (!token) return;
      fetch(`${BASE}/api/data-entry/session/heartbeat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    };
    send();
    timer.current = setInterval(send, 2 * 60 * 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [isDataEntry]);
}

// ─── Main Page ────────────────────────────────────────────────────────────────


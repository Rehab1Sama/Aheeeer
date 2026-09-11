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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMeccaToday(): string {
  // توقيت مكة مع بدء اليوم 5 صباحاً
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getCurrentWeekWorkingDays(): { label: string; value: string }[] {
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

function isThursdayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr + "T12:00:00Z").getUTCDay() === 4;
}

const THURSDAY_QUOTA_EXCLUDED_TYPES = ["recitation", "children", "mothers"];

function nextPosition(surahName: string, ayah: number): { surah: string; ayah: string } {
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

function normalizeAr(s: string): string {
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064E-\u0652]/g, "")
    .trim();
}

function findSurahFuzzy(raw: string): { match: Surah | null; suggestions: Surah[] } {
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

function extractAfterKeyword(text: string, keyword: string, stopKeywords: string[]): string {
  const idx = text.indexOf(keyword);
  if (idx === -1) return "";
  let seg = text.slice(idx + keyword.length).replace(/^\s*[,،و]\s*/, "").trim();
  for (const kw of stopKeywords) {
    const ni = seg.indexOf(kw);
    if (ni !== -1) seg = seg.slice(0, ni).trim();
  }
  return seg;
}

function extractFirstNumber(s: string): string {
  const norm = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = norm.match(/\d+/);
  return m ? m[0] : "";
}

type ParsedVoice = { startSurahRaw: string; startAyah: string; endSurahRaw: string; endAyah: string };

function parseVoiceTranscript(text: string): ParsedVoice {
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

type SuggestState = { field: "start" | "end"; raw: string; suggestions: Surah[]; parsed: ParsedVoice };

function VoiceInputButton({
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

function SurahSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

function AyahSelect({
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

interface SectionState {
  surahStart: string;
  ayahStart: string;
  surahEnd: string;
  ayahEnd: string;
}

interface FormState {
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

const emptySection = (): SectionState => ({
  surahStart: "",
  ayahStart: "",
  surahEnd: "",
  ayahEnd: "",
});

const emptyForm = (): FormState => ({
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

function calcPages(s: SectionState) {
  return calculatePages(s.surahStart, Number(s.ayahStart), s.surahEnd, Number(s.ayahEnd));
}

// ─── SurahSection Component ───────────────────────────────────────────────────

function SurahSection({
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
            <span className="text-[10px] font-normal bg-white/60 text-muted-foreground px-1.5 py-0.5 rounded-full border border-border/40">
              مقترح ✦
            </span>
          )}
          {locked && (
            <span className="text-[10px] font-semibold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
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

function useHeartbeat(isDataEntry: boolean) {
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

export default function DataEntryPage() {
  const [, navigate] = useLocation();
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const isDataEntry = (user as any)?.role === "data_entry";

  useHeartbeat(isDataEntry);

  const [activeTab, setActiveTab] = useState<"entry" | "archive">("entry");
  const [selectedDate, setSelectedDate] = useState(() => getCurrentWeekWorkingDays()[0].value);
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [autoFilled, setAutoFilled] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [confirmAbsenceOpen, setConfirmAbsenceOpen] = useState(false);
  const [submittedDays, setSubmittedDays] = useState<string[]>([]);
  const [submittedDaysVersion, setSubmittedDaysVersion] = useState(0);
  const [circlePlans, setCirclePlans] = useState<any[]>([]);

  // ── Bulk entry state ───────────────────────────────────────────────────────
  type BulkOverride = { isAbsent: boolean; memorize?: SectionState };
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<1 | 2>(1);
  const [bulkForm, setBulkForm] = useState<FormState>(emptyForm());
  const [bulkOverrides, setBulkOverrides] = useState<Record<number, BulkOverride>>({});
  const [bulkEditingStudent, setBulkEditingStudent] = useState<number | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Assigned circles for data_entry users
  const [assignedCircles, setAssignedCircles] = useState<any[]>([]);
  useEffect(() => {
    if (!isDataEntry) return;
    const token = getToken();
    if (!token) return;
    fetch(`${BASE}/api/data-entry/my-circles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setAssignedCircles)
      .catch(() => {});
  }, [isDataEntry]);

  // ── Archive tab state ────────────────────────────────────────────────────────
  const [archivedStudents, setArchivedStudents] = useState<any[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveVersion, setArchiveVersion] = useState(0);
  const [archiveActionLoading, setArchiveActionLoading] = useState<number | null>(null);
  // For enrolling archived student: which student to enroll and into which circle
  const [enrollDialogStudent, setEnrollDialogStudent] = useState<any | null>(null);
  const [enrollTargetCircleId, setEnrollTargetCircleId] = useState<number | null>(null);
  // Confirm archive dialog
  const [confirmArchiveStudent, setConfirmArchiveStudent] = useState<{ studentId: number; studentName: string; circleId: number } | null>(null);
  // Global search (archived + unassigned/registration)
  const [globalArchiveSearch, setGlobalArchiveSearch] = useState("");
  const [globalArchiveResults, setGlobalArchiveResults] = useState<any[]>([]);
  const [globalUnassignedResults, setGlobalUnassignedResults] = useState<any[]>([]);
  const [globalArchiveLoading, setGlobalArchiveLoading] = useState(false);

  useEffect(() => {
    if (!isDataEntry || activeTab !== "archive") return;
    const token = getToken();
    if (!token) return;
    setArchivedLoading(true);
    fetch(`${BASE}/api/students/enrollment-archived`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setArchivedStudents)
      .catch(() => setArchivedStudents([]))
      .finally(() => setArchivedLoading(false));
  }, [isDataEntry, activeTab, archiveVersion]);

  // Debounced global search (archived + unassigned)
  useEffect(() => {
    if (!isDataEntry || activeTab !== "archive") return;
    const q = globalArchiveSearch.trim();
    if (q.length < 2) {
      setGlobalArchiveResults([]);
      setGlobalUnassignedResults([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    setGlobalArchiveLoading(true);
    const timer = setTimeout(() => {
      const headers = { Authorization: `Bearer ${token}` };
      Promise.all([
        fetch(`${BASE}/api/students/archived-search?q=${encodeURIComponent(q)}`, { headers })
          .then((r) => (r.ok ? r.json() : [])),
        fetch(`${BASE}/api/students/unassigned-search?q=${encodeURIComponent(q)}`, { headers })
          .then((r) => (r.ok ? r.json() : [])),
      ])
        .then(([archived, unassigned]) => {
          setGlobalArchiveResults(archived);
          setGlobalUnassignedResults(unassigned);
        })
        .catch(() => { setGlobalArchiveResults([]); setGlobalUnassignedResults([]); })
        .finally(() => setGlobalArchiveLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [isDataEntry, activeTab, globalArchiveSearch, archiveVersion]);

  // Auto-select track from user profile
  useEffect(() => {
    if ((user as any)?.track && !selectedTrack) setSelectedTrack((user as any).track);
  }, [(user as any)?.track]);

  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const { data: tracks } = useListTracks({ query: { queryKey: ["tracks"] } });

  // المعلمة/المشرفة لديها حلقة واحدة فقط (السيرفر أصلًا يُرجع لها حلقتها فقط) —
  // نختارها تلقائيًا فور توفرها، بدون الحاجة لاختيار مسار ولا حلقة يدويًا.
  const isTeacherOrSupervisor = (user as any)?.role === "teacher" || (user as any)?.role === "supervisor";
  useEffect(() => {
    if (isTeacherOrSupervisor && circles && circles.length > 0 && !selectedCircleId) {
      setSelectedCircleId(circles[0].id);
    }
  }, [isTeacherOrSupervisor, circles, selectedCircleId]);

  // Fetch circle review plans for color comparison
  useEffect(() => {
    if (!selectedCircleId) { setCirclePlans([]); return; }
    const circle = (circles ?? [] as any[]).find((c: any) => c.id === selectedCircleId) as any;
    if (!circle || (circle.trackType !== "girls" && circle.trackType !== "fixation")) { setCirclePlans([]); return; }
    const token = getToken();
    fetch(`${BASE}/api/circles/${selectedCircleId}/review-plans`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    }).then(r => r.ok ? r.json() : []).then(setCirclePlans).catch(() => setCirclePlans([]));
  }, [selectedCircleId, circles]);

  // Submitted days for selected circle (to hide already-done days)
  useEffect(() => {
    if (!selectedCircleId) { setSubmittedDays([]); return; }
    const token = getToken();
    fetch(`${BASE}/api/data-entry/circle-submitted-days?circleId=${selectedCircleId}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((days: string[]) => {
        setSubmittedDays(days);
      })
      .catch(() => setSubmittedDays([]));
  }, [selectedCircleId, submittedDaysVersion]);

  const { data: missingData } = useGetMissingDataEntry(
    { date: selectedDate },
    { query: { queryKey: ["missingData", selectedDate], staleTime: 0, refetchOnWindowFocus: true } },
  );

  const { data: studentRecords } = useListRecords(
    selectedStudent ? { studentId: selectedStudent.studentId } : undefined,
    {
      query: {
        queryKey: ["studentRecords", selectedStudent?.studentId],
        enabled: !!selectedStudent && dialogOpen,
      },
    },
  );

  const { data: circleRecordsRaw } = useListRecords(
    selectedCircleId ? { circleId: selectedCircleId, date: selectedDate } : undefined,
    {
      query: {
        queryKey: ["circleRecords", selectedCircleId, selectedDate],
        enabled: !!selectedCircleId,
      },
    },
  );
  const circleRecords: any[] = (circleRecordsRaw as any) ?? [];

  const { data: repeatedAbsences } = useGetRepeatedAbsences(
    { minAbsences: 2 },
    { query: { queryKey: ["repeatedAbsences"] } },
  );

  const { data: teacherAbsenceStatus, refetch: refetchTeacherAbsence } = useCheckTeacherAbsence(
    selectedCircleId ?? 0,
    { date: selectedDate },
    {
      query: {
        queryKey: ["teacherAbsence", selectedCircleId, selectedDate],
        enabled: !!selectedCircleId,
      },
    },
  );
  const isTeacherAbsent = !!teacherAbsenceStatus?.absent;

  const markTeacherAbsent = useMarkTeacherAbsent();
  const deleteTeacherAbsence = useDeleteTeacherAbsence();
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-fill form from last record
  useEffect(() => {
    if (!dialogOpen || !studentRecords || autoFilled) return;
    const sorted = [...(studentRecords as any[])].sort((a, b) => b.date.localeCompare(a.date));
    const last = sorted.find((r) => !r.isAbsent);
    if (!last) return;
    const updates: Partial<FormState> = {};
    if (last.memorizeSurahEnd && last.memorizeAyahEnd) {
      const next = nextPosition(last.memorizeSurahEnd, last.memorizeAyahEnd);
      updates.memorize = { ...emptySection(), surahStart: next.surah, ayahStart: next.ayah };
    }
    if (last.reviewNearSurahStart && last.reviewNearSurahEnd) {
      updates.reviewNear = {
        surahStart: last.reviewNearSurahStart,
        ayahStart: last.reviewNearAyahStart?.toString() ?? "1",
        surahEnd: last.reviewNearSurahEnd,
        ayahEnd: last.reviewNearAyahEnd?.toString() ?? "1",
      };
    }
    if (last.reviewFarSurahStart && last.reviewFarSurahEnd) {
      updates.reviewFar = {
        surahStart: last.reviewFarSurahStart,
        ayahStart: last.reviewFarAyahStart?.toString() ?? "1",
        surahEnd: last.reviewFarSurahEnd,
        ayahEnd: last.reviewFarAyahEnd?.toString() ?? "1",
      };
    }
    if (last.reviewFar2SurahStart && last.reviewFar2SurahEnd) {
      updates.reviewFar2 = {
        surahStart: last.reviewFar2SurahStart,
        ayahStart: last.reviewFar2AyahStart?.toString() ?? "1",
        surahEnd: last.reviewFar2SurahEnd,
        ayahEnd: last.reviewFar2AyahEnd?.toString() ?? "1",
      };
      updates.noReviewFar2 = false;
    }
    if (last.reviewSurahStart && last.reviewSurahEnd) {
      updates.review = {
        surahStart: last.reviewSurahStart,
        ayahStart: last.reviewAyahStart?.toString() ?? "1",
        surahEnd: last.reviewSurahEnd,
        ayahEnd: last.reviewAyahEnd?.toString() ?? "1",
      };
    }
    if (last.recitationSurahEnd && last.recitationAyahEnd) {
      const next = nextPosition(last.recitationSurahEnd, last.recitationAyahEnd);
      updates.recitation = { ...emptySection(), surahStart: next.surah, ayahStart: next.ayah };
    }
    if (Object.keys(updates).length > 0) {
      setForm((f) => ({ ...f, ...updates }));
      setAutoFilled(true);
    }
  }, [studentRecords, dialogOpen, autoFilled]);

  // All working days — never hide days; mark submitted ones with ✓
  const availableDays = useMemo(() => {
    const all = getCurrentWeekWorkingDays();
    if (!selectedCircleId || submittedDays.length === 0) return all;
    return all.map((d) =>
      submittedDays.includes(d.value)
        ? { ...d, label: `${d.label} ✓` }
        : d,
    );
  }, [submittedDays, selectedCircleId]);

  // Circles shown in UI
  const visibleCircles = isDataEntry
    ? assignedCircles
    : (circles ?? []).filter((c: any) => !selectedTrack || c.track === selectedTrack);

  // All students in selected circle (including those with records)
  const studentsInCircle = useMemo(() => {
    if (!selectedCircleId || !missingData) return [];
    return ((missingData as unknown) as any[])
      .filter((s: any) => Number(s.circleId) === Number(selectedCircleId))
      .sort((a: any, b: any) =>
        String(a.studentName ?? "").localeCompare(String(b.studentName ?? ""), "ar", { sensitivity: "base" }),
      );
  }, [missingData, selectedCircleId]);

  const pendingStudents = useMemo(() => studentsInCircle.filter((s: any) => !s.hasRecord && !s.onLeave), [studentsInCircle]);
  const enteredStudents = useMemo(() => studentsInCircle.filter((s: any) => s.hasRecord), [studentsInCircle]);
  const onLeaveStudents = useMemo(() => studentsInCircle.filter((s: any) => s.onLeave && !s.hasRecord), [studentsInCircle]);

  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim();
    if (!search) return studentsInCircle;
    return studentsInCircle.filter((s: any) => s.studentName?.includes(search));
  }, [studentsInCircle, studentSearch]);

  const selectedCircle = (circles ?? []).find((c: any) => c.id === selectedCircleId) as any;
  const inputFields = getInputFields(selectedCircle?.dataEntryType);

  const isBulkEligible = !!selectedCircle && (
    selectedCircle.track?.startsWith("إشراق") ||
    selectedCircle.track?.startsWith("سُنى")
  );

  const isMothersEntry = selectedCircle?.dataEntryType === "mothers";
  const isThursdaySelected = isThursdayDate(selectedDate);
  const isThursdayQuotaCircle =
    isThursdaySelected && !!selectedCircle && !THURSDAY_QUOTA_EXCLUDED_TYPES.includes(selectedCircle.dataEntryType);

  // حلقات الأطفال والأمهات: الإدخال خاص بالمعلمة فقط، لا يظهر للمشرفة.
  const supervisorBlockedFromEntry =
    (user as any)?.role === "supervisor" &&
    ["children", "mothers"].includes(selectedCircle?.dataEntryType);

  // Plan day quotas for Thursday far review (reviewFarPages = خطة المراجعة)
  const [planDayQuotas, setPlanDayQuotas] = useState<Record<number, { pages: number; dayNumber: number }>>({});
  useEffect(() => {
    if (!isThursdayQuotaCircle || !selectedCircleId || !selectedDate) {
      setPlanDayQuotas({});
      return;
    }
    const token = getToken();
    fetch(`${BASE}/api/review-plans/circle-day-quota?circleId=${selectedCircleId}&date=${selectedDate}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : { quotas: {} })
      .then(d => setPlanDayQuotas(d.quotas ?? {}))
      .catch(() => setPlanDayQuotas({}));
  }, [isThursdayQuotaCircle, selectedCircleId, selectedDate]);

  // Last-10-days memorization records for Thursday quota review
  const quotaDateFrom = useMemo(() => {
    if (!selectedDate) return "";
    const d = new Date(selectedDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 10);
    return d.toISOString().slice(0, 10);
  }, [selectedDate]);
  const quotaDateTo = useMemo(() => {
    if (!selectedDate) return "";
    const d = new Date(selectedDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [selectedDate]);

  const { data: quotaRecordsRaw } = useListRecords(
    selectedCircleId && isThursdayQuotaCircle
      ? { circleId: selectedCircleId, dateFrom: quotaDateFrom, dateTo: quotaDateTo }
      : undefined,
    {
      query: {
        queryKey: ["thursdayQuotaRecords", selectedCircleId, quotaDateFrom, quotaDateTo],
        enabled: !!selectedCircleId && isThursdayQuotaCircle,
      },
    },
  );

  const quotaByStudent = useMemo(() => {
    const map: Record<number, { totalPages: number; firstRec: any; lastRec: any }> = {};
    const recs = (((quotaRecordsRaw as any[]) ?? []))
      .filter((r: any) => !r.isAbsent && r.memorizeSurahStart && (r.memorizePages ?? 0) > 0)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    for (const r of recs) {
      if (!map[r.studentId]) map[r.studentId] = { totalPages: 0, firstRec: r, lastRec: r };
      map[r.studentId].totalPages += r.memorizePages ?? 0;
      map[r.studentId].lastRec = r;
    }
    return map;
  }, [quotaRecordsRaw]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openEntry = (student: any) => {
    setSelectedStudent(student);
    setEditingRecordId(null);
    setForm(emptyForm());
    setAutoFilled(false);
    setDialogOpen(true);
  };

  const openEditRecord = (record: any) => {
    setSelectedStudent({
      studentId: record.studentId,
      studentName: record.studentName ?? `طالبة #${record.studentId}`,
      circleId: record.circleId,
      track: selectedCircle?.track ?? "",
    });
    setEditingRecordId(record.id);
    setForm({
      isAbsent: record.isAbsent ?? false,
      memorize: {
        surahStart: record.memorizeSurahStart ?? "",
        ayahStart: record.memorizeAyahStart?.toString() ?? "",
        surahEnd: record.memorizeSurahEnd ?? "",
        ayahEnd: record.memorizeAyahEnd?.toString() ?? "",
      },
      reviewNear: {
        surahStart: record.reviewNearSurahStart ?? "",
        ayahStart: record.reviewNearAyahStart?.toString() ?? "",
        surahEnd: record.reviewNearSurahEnd ?? "",
        ayahEnd: record.reviewNearAyahEnd?.toString() ?? "",
      },
      reviewFar: {
        surahStart: record.reviewFarSurahStart ?? "",
        ayahStart: record.reviewFarAyahStart?.toString() ?? "",
        surahEnd: record.reviewFarSurahEnd ?? "",
        ayahEnd: record.reviewFarAyahEnd?.toString() ?? "",
      },
      reviewFar2: {
        surahStart: record.reviewFar2SurahStart ?? "",
        ayahStart: record.reviewFar2AyahStart?.toString() ?? "",
        surahEnd: record.reviewFar2SurahEnd ?? "",
        ayahEnd: record.reviewFar2AyahEnd?.toString() ?? "",
      },
      review: {
        surahStart: record.reviewSurahStart ?? "",
        ayahStart: record.reviewAyahStart?.toString() ?? "",
        surahEnd: record.reviewSurahEnd ?? "",
        ayahEnd: record.reviewAyahEnd?.toString() ?? "",
      },
      recitation: {
        surahStart: record.recitationSurahStart ?? "",
        ayahStart: record.recitationAyahStart?.toString() ?? "",
        surahEnd: record.recitationSurahEnd ?? "",
        ayahEnd: record.recitationAyahEnd?.toString() ?? "",
      },
      repetitions: record.repetitions?.toString() ?? "7",
      listenedToReciter: record.listenedToReciter ?? null,
      noReviewNear: !record.reviewNearSurahStart,
      noReviewFar: !record.reviewFarSurahStart,
      noReviewFar2: !record.reviewFar2SurahStart,
      noReview: !record.reviewSurahStart,
      memorizeMode: !record.memorizeSurahStart && (record.memorizePages ?? 0) > 0 ? "manual" : "range",
      manualPages: !record.memorizeSurahStart && (record.memorizePages ?? 0) > 0 ? record.memorizePages.toString() : "",
      reviewMode: !record.reviewSurahStart && (record.reviewPages ?? 0) > 0 ? "manual" : "range",
      manualReviewPages: !record.reviewSurahStart && (record.reviewPages ?? 0) > 0 ? record.reviewPages.toString() : "",
    });
    setAutoFilled(true);
    setDialogOpen(true);
  };

  const updateSection = (section: keyof FormState, field: keyof SectionState, val: string) => {
    setForm((f) => ({ ...f, [section]: { ...(f[section] as SectionState), [field]: val } }));
  };

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["missingData", selectedDate] });
    queryClient.invalidateQueries({ queryKey: ["circleRecords", selectedCircleId, selectedDate] });
    setSubmittedDaysVersion((v) => v + 1);
  }, [queryClient, selectedDate, selectedCircleId]);

  // decision:
  //  - "correct"     → صح: راجعت واستوفت النصاب، حاضرة، بدون تقصير
  //  - "wrong"        → خطأ: غياب
  //  - "shortcoming"  → تقصير: تُحسب حاضرة ويُحسب لها النصاب بالضبط زي "صح"،
  //    لكن تُعلَّم تقصيرًا فعليًا (shortcomingOverride: true) — لأنها كانت
  //    مقصّرة على وريقة (مثلاً) رغم استيفاء نصاب هالأسبوع
  const handleThursdayDecision = (student: any, decision: "correct" | "wrong" | "shortcoming") => {
    const passed = decision !== "wrong";
    const summary = quotaByStudent[student.studentId];
    const planQuota = planDayQuotas[student.studentId];
    const payload: any = {
      studentId: student.studentId,
      circleId: student.circleId,
      date: selectedDate,
      isAbsent: !passed,
      memorizePages: 0,
      reviewNearPages: 0,
      reviewFarPages: 0,
      reviewPages: 0,
      recitationPages: 0,
      shortcomingOverride: decision === "shortcoming" ? true : false,
    };
    if (passed && summary) {
      payload.reviewSurahStart = summary.firstRec.memorizeSurahStart;
      payload.reviewAyahStart = summary.firstRec.memorizeAyahStart;
      payload.reviewSurahEnd = summary.lastRec.memorizeSurahEnd;
      payload.reviewAyahEnd = summary.lastRec.memorizeAyahEnd;
      payload.reviewPages = summary.totalPages;
    }
    // صح أو تقصير (الاثنين محسوبين حضورًا ونصابًا) + لها خطة → تُحسب المراجعة البعيدة تلقائياً بنصاب يوم الخطة
    if (passed && planQuota && planQuota.pages > 0) {
      payload.reviewFarPages = planQuota.pages;
    }
    const existing = (circleRecords as any[]).find((r: any) => r.studentId === student.studentId);
    const onDone = () => {
      toast({
        title:
          decision === "correct" ? "تم تسجيل نصاب المراجعة ✓" :
          decision === "shortcoming" ? "تم تسجيل النصاب مع تقصير" :
          "تم تسجيل الغياب",
      });
      invalidateQueries();
    };
    const onErr = (err: any) =>
      toast({ title: "خطأ", description: err?.data?.error ?? err?.message, variant: "destructive" });
    if (existing) {
      updateRecord.mutate({ id: existing.id, data: payload }, { onSuccess: onDone, onError: onErr });
    } else {
      createRecord.mutate({ data: payload }, { onSuccess: onDone, onError: onErr });
    }
  };

  const handleSave = () => {
    const payload: any = {
      studentId: selectedStudent.studentId,
      circleId: selectedStudent.circleId,
      date: selectedDate,
      isAbsent: form.isAbsent,
      memorizePages: 0,
      reviewNearPages: 0,
      reviewFarPages: 0,
      reviewPages: 0,
      recitationPages: 0,
    };

    if (!form.isAbsent) {
      if (inputFields.includes("memorize") && isMothersEntry && form.memorizeMode === "manual") {
        if (form.manualPages && Number(form.manualPages) > 0) {
          payload.memorizePages = Number(form.manualPages);
        }
      } else if (inputFields.includes("memorize") && form.memorize.surahStart && form.memorize.surahEnd) {
        payload.memorizeSurahStart = form.memorize.surahStart;
        payload.memorizeAyahStart = Number(form.memorize.ayahStart) || 1;
        payload.memorizeSurahEnd = form.memorize.surahEnd;
        payload.memorizeAyahEnd = Number(form.memorize.ayahEnd) || 1;
        payload.memorizePages = calcPages(form.memorize);
      }
      if (inputFields.includes("review_near") && !form.noReviewNear && form.reviewNear.surahStart && form.reviewNear.surahEnd) {
        payload.reviewNearSurahStart = form.reviewNear.surahStart;
        payload.reviewNearAyahStart = Number(form.reviewNear.ayahStart) || 1;
        payload.reviewNearSurahEnd = form.reviewNear.surahEnd;
        payload.reviewNearAyahEnd = Number(form.reviewNear.ayahEnd) || 1;
        payload.reviewNearPages = calcPages(form.reviewNear);
      }
      if (inputFields.includes("review_far") && !form.noReviewFar && form.reviewFar.surahStart && form.reviewFar.surahEnd) {
        payload.reviewFarSurahStart = form.reviewFar.surahStart;
        payload.reviewFarAyahStart = Number(form.reviewFar.ayahStart) || 1;
        payload.reviewFarSurahEnd = form.reviewFar.surahEnd;
        payload.reviewFarAyahEnd = Number(form.reviewFar.ayahEnd) || 1;
        payload.reviewFarPages = calcPages(form.reviewFar);
      }
      if (inputFields.includes("review_far") && !form.noReviewFar2 && form.reviewFar2.surahStart && form.reviewFar2.surahEnd) {
        payload.reviewFar2SurahStart = form.reviewFar2.surahStart;
        payload.reviewFar2AyahStart = Number(form.reviewFar2.ayahStart) || 1;
        payload.reviewFar2SurahEnd = form.reviewFar2.surahEnd;
        payload.reviewFar2AyahEnd = Number(form.reviewFar2.ayahEnd) || 1;
        payload.reviewFar2Pages = calcPages(form.reviewFar2);
      }
      if (inputFields.includes("review") && isMothersEntry && form.reviewMode === "manual") {
        if (form.manualReviewPages && Number(form.manualReviewPages) > 0) {
          payload.reviewPages = Number(form.manualReviewPages);
        }
      } else if (inputFields.includes("review") && !form.noReview && form.review.surahStart && form.review.surahEnd) {
        payload.reviewSurahStart = form.review.surahStart;
        payload.reviewAyahStart = Number(form.review.ayahStart) || 1;
        payload.reviewSurahEnd = form.review.surahEnd;
        payload.reviewAyahEnd = Number(form.review.ayahEnd) || 1;
        payload.reviewPages = calcPages(form.review);
      }
      if (inputFields.includes("recitation") && form.recitation.surahStart && form.recitation.surahEnd) {
        payload.recitationSurahStart = form.recitation.surahStart;
        payload.recitationAyahStart = Number(form.recitation.ayahStart) || 1;
        payload.recitationSurahEnd = form.recitation.surahEnd;
        payload.recitationAyahEnd = Number(form.recitation.ayahEnd) || 1;
        payload.recitationPages = calcPages(form.recitation);
      }
      if (inputFields.includes("repetitions")) payload.repetitions = Number(form.repetitions) || null;
      if (inputFields.includes("listen")) payload.listenedToReciter = form.listenedToReciter;
    }

    if (editingRecordId) {
      updateRecord.mutate(
        { id: editingRecordId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "تم تحديث البيانات ✓" });
            invalidateQueries();
            setDialogOpen(false);
            setEditingRecordId(null);
          },
          onError: (err: any) =>
            toast({ title: "خطأ في التحديث", description: err?.data?.error ?? err?.message, variant: "destructive" }),
        },
      );
    } else {
      createRecord.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "تم حفظ البيانات ✓" });
            invalidateQueries();
            setDialogOpen(false);
          },
          onError: (err: any) =>
            toast({ title: "خطأ في الحفظ", description: err?.data?.error ?? err?.message, variant: "destructive" }),
        },
      );
    }
  };

  const handleBulkSave = async () => {
    setBulkSubmitting(true);
    const token = getToken();
    if (!token || !selectedCircleId) { setBulkSubmitting(false); return; }

    const payloads = pendingStudents.map((student: any) => {
      const override = bulkOverrides[student.studentId] ?? { isAbsent: false };
      const effectiveMem = override.memorize ?? bulkForm.memorize;
      const payload: any = {
        studentId: student.studentId,
        circleId: student.circleId,
        date: selectedDate,
        isAbsent: override.isAbsent,
        memorizePages: 0,
        reviewNearPages: 0,
        reviewFarPages: 0,
        reviewPages: 0,
        recitationPages: 0,
      };
      if (!override.isAbsent) {
        if (inputFields.includes("memorize") && effectiveMem.surahStart && effectiveMem.surahEnd) {
          payload.memorizeSurahStart = effectiveMem.surahStart;
          payload.memorizeAyahStart = Number(effectiveMem.ayahStart) || 1;
          payload.memorizeSurahEnd = effectiveMem.surahEnd;
          payload.memorizeAyahEnd = Number(effectiveMem.ayahEnd) || 1;
          payload.memorizePages = calcPages(effectiveMem);
        }
        if (inputFields.includes("review_near") && !bulkForm.noReviewNear && bulkForm.reviewNear.surahStart && bulkForm.reviewNear.surahEnd) {
          payload.reviewNearSurahStart = bulkForm.reviewNear.surahStart;
          payload.reviewNearAyahStart = Number(bulkForm.reviewNear.ayahStart) || 1;
          payload.reviewNearSurahEnd = bulkForm.reviewNear.surahEnd;
          payload.reviewNearAyahEnd = Number(bulkForm.reviewNear.ayahEnd) || 1;
          payload.reviewNearPages = calcPages(bulkForm.reviewNear);
        }
        if (inputFields.includes("review_far") && !bulkForm.noReviewFar && bulkForm.reviewFar.surahStart && bulkForm.reviewFar.surahEnd) {
          payload.reviewFarSurahStart = bulkForm.reviewFar.surahStart;
          payload.reviewFarAyahStart = Number(bulkForm.reviewFar.ayahStart) || 1;
          payload.reviewFarSurahEnd = bulkForm.reviewFar.surahEnd;
          payload.reviewFarAyahEnd = Number(bulkForm.reviewFar.ayahEnd) || 1;
          payload.reviewFarPages = calcPages(bulkForm.reviewFar);
        }
        if (inputFields.includes("review") && !bulkForm.noReview && bulkForm.review.surahStart && bulkForm.review.surahEnd) {
          payload.reviewSurahStart = bulkForm.review.surahStart;
          payload.reviewAyahStart = Number(bulkForm.review.ayahStart) || 1;
          payload.reviewSurahEnd = bulkForm.review.surahEnd;
          payload.reviewAyahEnd = Number(bulkForm.review.ayahEnd) || 1;
          payload.reviewPages = calcPages(bulkForm.review);
        }
        if (inputFields.includes("listen")) payload.listenedToReciter = bulkForm.listenedToReciter;
      }
      return payload;
    });

    try {
      const res = await fetch(`${BASE}/api/records/bulk`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payloads),
      });
      if (!res.ok) throw new Error("فشل الحفظ");
      const data = await res.json();
      toast({ title: `تم حفظ ${data.created} سجل ✓` });
      invalidateQueries();
      setBulkDialogOpen(false);
      setBulkStep(1);
      setBulkForm(emptyForm());
      setBulkOverrides({});
      setBulkEditingStudent(null);
    } catch (e: any) {
      toast({ title: "خطأ في الحفظ الجماعي", description: e.message, variant: "destructive" });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleMarkTeacherAbsent = () => {
    if (!selectedCircleId) return;
    if (!confirm(`هل تريدين تسجيل غياب المعلمة لهذه الحلقة يوم ${selectedDate}؟`)) return;
    markTeacherAbsent.mutate(
      { id: selectedCircleId, data: { date: selectedDate } },
      {
        onSuccess: () => { toast({ title: "تم تسجيل غياب المعلمة" }); refetchTeacherAbsence(); },
        onError: () => toast({ title: "خطأ في التسجيل", variant: "destructive" }),
      },
    );
  };

  const handleUndoTeacherAbsence = () => {
    if (!selectedCircleId) return;
    deleteTeacherAbsence.mutate(
      { id: selectedCircleId, params: { date: selectedDate } },
      {
        onSuccess: () => { toast({ title: "تم إلغاء غياب المعلمة" }); refetchTeacherAbsence(); },
        onError: () => toast({ title: "خطأ في الإلغاء", variant: "destructive" }),
      },
    );
  };

  // ── Pages summary ────────────────────────────────────────────────────────────
  const memPages = isMothersEntry && form.memorizeMode === "manual" ? Number(form.manualPages) || 0 : calcPages(form.memorize);
  const revNearPages = calcPages(form.reviewNear);
  const revFarPages = calcPages(form.reviewFar);
  const revFar2Pages = form.noReviewFar2 ? 0 : calcPages(form.reviewFar2);
  const revPages = isMothersEntry && form.reviewMode === "manual" ? Number(form.manualReviewPages) || 0 : calcPages(form.review);
  const recPages = calcPages(form.recitation);
  const hasPages = memPages > 0 || revNearPages > 0 || revFarPages > 0 || revFar2Pages > 0 || revPages > 0 || recPages > 0;

  const isFixationEntry = resolveTrackType(selectedCircle?.dataEntryType) === "fixation";

  // Set of circle IDs fully done for the selected date
  const doneCircleIds = useMemo(() => {
    if (!missingData) return new Set<number>();
    const all = (missingData as unknown as any[]);
    const byCircle: Record<number, any[]> = {};
    for (const s of all) {
      const cid = Number(s.circleId);
      if (!byCircle[cid]) byCircle[cid] = [];
      byCircle[cid].push(s);
    }
    const done = new Set<number>();
    for (const [cid, students] of Object.entries(byCircle)) {
      if (students.length > 0 && students.every((s: any) => s.hasRecord || s.onLeave)) {
        done.add(Number(cid));
      }
    }
    return done;
  }, [missingData]);

  // Circles progress for selected date
  const circlesProgress = useMemo(() => {
    if (!missingData) return { done: 0, total: 0 };
    const all = (missingData as unknown as any[]);
    const byCircle: Record<number, any[]> = {};
    for (const s of all) {
      const cid = Number(s.circleId);
      if (!byCircle[cid]) byCircle[cid] = [];
      byCircle[cid].push(s);
    }
    const total = Object.keys(byCircle).length;
    let done = 0;
    for (const students of Object.values(byCircle)) {
      if (students.length > 0 && students.every((s: any) => s.hasRecord || s.onLeave)) done++;
    }
    return { done, total };
  }, [missingData]);

  // Students progress for selected circle
  const studentsProgress = useMemo(() => {
    const total = studentsInCircle.length;
    const done = enteredStudents.length + onLeaveStudents.length;
    return { done, remaining: pendingStudents.length, total };
  }, [studentsInCircle, enteredStudents, onLeaveStudents, pendingStudents]);

  // ── Archive handlers ─────────────────────────────────────────────────────────

  const handleArchiveStudent = useCallback(async (studentId: number, circleId: number) => {
    navigate(`/students/${studentId}?archive=1&circleId=${circleId}`);
  }, [toast, queryClient]);

  // enrollMode: "restore" for archived students, "enroll" for unassigned/registration students
  const handleEnrollFromArchive = useCallback(async (studentId: number, circleId: number, enrollMode: "restore" | "enroll" = "restore") => {
    const token = getToken();
    if (!token) return;
    setArchiveActionLoading(studentId);
    try {
      const url = enrollMode === "enroll"
        ? `${BASE}/api/students/${studentId}/enroll`
        : `${BASE}/api/students/${studentId}/restore`;
      const method = enrollMode === "enroll" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ circleId }),
      });
      if (!res.ok) throw new Error("فشل النقل");
      toast({ title: "تم إلحاق الطالبة", description: "تم نقل الطالبة إلى حلقتك بنجاح" });
      setEnrollDialogStudent(null);
      setEnrollTargetCircleId(null);
      setArchiveVersion(v => v + 1);
      setGlobalArchiveResults([]);
      setGlobalUnassignedResults([]);
      setGlobalArchiveSearch("");
      queryClient.invalidateQueries({ queryKey: ["missingData"] });
    } catch {
      toast({ title: "خطأ", description: "فشل نقل الطالبة", variant: "destructive" });
    } finally {
      setArchiveActionLoading(null);
    }
  }, [toast, queryClient]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">إدخال البيانات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          اختري الحلقة ثم الطالبة لإدخال بياناتها
        </p>
      </div>

      <MonthlyLeaderboardCard userRole={(user as any)?.role} />

      {/* Tab switcher — data_entry only */}
      {isDataEntry && (
        <div className="flex gap-2 bg-muted/40 rounded-xl p-1">
          <button
            onClick={() => setActiveTab("entry")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "entry"
                ? "bg-background shadow-sm text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            إدخال البيانات
          </button>
          <button
            onClick={() => setActiveTab("archive")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "archive"
                ? "bg-background shadow-sm text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="w-4 h-4" />
            الأرشيف
          </button>
        </div>
      )}

      {/* ── Entry tab content ── */}
      {activeTab === "entry" && (<>

      {/* Step 1 — Date */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            اليوم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full border border-input rounded-xl px-3 py-2.5 text-sm bg-background text-right font-medium"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setSelectedCircleId(null); }}
          >
            {availableDays.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Circles progress bar */}
      {circlesProgress.total > 0 && (
        <Card className="border-0 shadow-sm bg-gradient-to-l from-primary/5 to-transparent">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-foreground">
                تقدم الحلقات ليوم {availableDays.find((d) => d.value === selectedDate)?.label?.replace(" ✓", "") ?? selectedDate}
              </span>
              <span className="text-xs font-bold text-primary">
                {circlesProgress.done} / {circlesProgress.total}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${circlesProgress.total > 0 ? (circlesProgress.done / circlesProgress.total) * 100 : 0}%`,
                  backgroundColor: circlesProgress.done === circlesProgress.total ? "#22c55e" : "hsl(var(--primary))",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {circlesProgress.done === circlesProgress.total
                ? "✅ اكتمل إدخال جميع الحلقات"
                : `${circlesProgress.total - circlesProgress.done} حلقة لم يكتمل إدخالها`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Circle (مخفية للمعلمة/المشرفة: حلقتها الوحيدة تُختار تلقائيًا) */}
      {!isTeacherOrSupervisor && (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {isDataEntry ? "الحلقة المُسندة إليكِ" : "المسار والحلقة"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Track filter — for non-data_entry only */}
          {!isDataEntry && (
            <select
              className="w-full border border-input rounded-xl px-3 py-2.5 text-sm bg-background text-right font-medium"
              value={selectedTrack}
              onChange={(e) => { setSelectedTrack(e.target.value); setSelectedCircleId(null); }}
            >
              <option value="">كل المسارات</option>
              {(tracks ?? []).map((t: any) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          )}

          {/* Assigned circles as buttons (data_entry) */}
          {isDataEntry && assignedCircles.length === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
              <p className="text-sm text-amber-700 font-medium">لم تُسند لكِ حلقات بعد</p>
              <p className="text-xs text-amber-500 mt-1">تواصلي مع القائدة لإسناد حلقاتك</p>
            </div>
          ) : isDataEntry ? (
            <div className="space-y-2">
              {visibleCircles.map((c: any) => {
                const isSelected = selectedCircleId === c.id;
                const isDone = doneCircleIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCircleId(isSelected ? null : c.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-right ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : isDone
                        ? "border-green-200 bg-green-50 hover:border-green-300"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    <span className={`font-semibold text-sm ${isSelected ? "text-primary" : isDone ? "text-green-700" : ""}`}>
                      {c.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {isDone && (
                        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                          ✓ مكتملة
                        </span>
                      )}
                      {c.track && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {c.track}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <select
              className="w-full border border-input rounded-xl px-3 py-2.5 text-sm bg-background text-right font-medium"
              value={selectedCircleId?.toString() ?? ""}
              onChange={(e) => setSelectedCircleId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">{!selectedTrack ? "اختري المسار أولًا" : "اختري الحلقة"}</option>
              {visibleCircles.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>
      )}

      {/* Teacher Absent Banner */}
      {selectedCircleId && isTeacherAbsent && (
        <Card className="border-2 border-orange-300 bg-orange-50 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <UserX className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-bold text-orange-800 text-sm">المعلمة غائبة</p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    إدخال البيانات مغلق لهذه الحلقة ليوم {selectedDate}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-100 shrink-0"
                onClick={handleUndoTeacherAbsence}
                disabled={deleteTeacherAbsence.isPending}
              >
                <Undo2 className="w-3.5 h-3.5" />
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supervisor blocked from children/mothers entry */}
      {selectedCircleId && !isTeacherAbsent && supervisorBlockedFromEntry && (
        <Card className="border-2 border-amber-300 bg-amber-50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <UserX className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-amber-800 text-sm">الإدخال غير متاح لكِ</p>
              <p className="text-xs text-amber-600 mt-0.5">
                إدخال بيانات حلقات الأطفال والأمهات خاص بالمعلمة فقط
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Thursday quota review (صح/خطأ/تقصير) */}
      {selectedCircleId && !isTeacherAbsent && !supervisorBlockedFromEntry && isThursdayQuotaCircle && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              نصاب مراجعة آخر ١٠ أيام — الخميس
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              اختاري "صح" إذا سمّعت الطالبة نصاب آخر عشرة أيام بنجاح (تُحسب أوجه حفظها تلقائيًا وتُسجَّل حاضرة)، "خطأ" لتسجيل غياب، أو "تقصير" لو سمّعت واستوفت النصاب لكنها ما سردت على الرفيقة (تُحسب حاضرة بنصابها زي "صح" مع تعليمها تقصيرًا)
            </p>
          </CardHeader>
          <CardContent>
            {studentsInCircle.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا يوجد طالبات في هذه الحلقة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {studentsInCircle.map((student: any) => {
                  const hasRecord = !!student.hasRecord;
                  const isOnLeave = !!student.onLeave;
                  const recordForEdit = hasRecord
                    ? (circleRecords as any[]).find((r: any) => r.studentId === student.studentId)
                    : null;
                  const summary = quotaByStudent[student.studentId];
                  const isShortcomingRecord = hasRecord && !recordForEdit?.isAbsent && recordForEdit?.shortcomingOverride === true;
                  return (
                    <div
                      key={`${student.studentId}-${student.circleId}`}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                        hasRecord
                          ? recordForEdit?.isAbsent
                            ? "border-rose-200 bg-rose-50/40"
                            : isShortcomingRecord
                            ? "border-amber-200 bg-amber-50/40"
                            : "border-emerald-200 bg-emerald-50/40"
                          : isOnLeave
                          ? "border-slate-200 bg-slate-50/40 opacity-60"
                          : "border-border hover:bg-muted/20"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm">{student.studentName}</p>
                          {hasRecord && (
                            recordForEdit?.isAbsent ? (
                              <Badge className="bg-rose-100 text-rose-700 border-0 text-[10px] px-1.5 py-0">غائبة</Badge>
                            ) : isShortcomingRecord ? (
                              <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5 py-0">
                                ⚠ {formatPages(recordForEdit?.reviewPages ?? 0)} وجه · تقصير
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5 py-0">
                                ✓ {formatPages(recordForEdit?.reviewPages ?? 0)} وجه
                              </Badge>
                            )
                          )}
                          {isOnLeave && !hasRecord && (
                            <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] px-1.5 py-0">إجازة</Badge>
                          )}
                        </div>
                        {!hasRecord && !isOnLeave && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            محفوظ آخر ١٠ أيام: {summary ? `${formatPages(summary.totalPages)} وجه` : "لا يوجد"}
                            {planDayQuotas[student.studentId] && (
                              <span className="text-amber-600 font-medium"> · نصاب الخطة: {formatPages(planDayQuotas[student.studentId].pages)} وجه</span>
                            )}
                          </p>
                        )}
                      </div>
                      {!isOnLeave && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-1 h-8 px-3 ${
                              hasRecord && recordForEdit?.isAbsent
                                ? "border-rose-400 text-rose-700 bg-rose-50"
                                : "text-rose-600 border-rose-200 hover:bg-rose-50"
                            }`}
                            onClick={() => handleThursdayDecision(student, "wrong")}
                            disabled={createRecord.isPending || updateRecord.isPending}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            خطأ
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-1 h-8 px-3 ${
                              isShortcomingRecord
                                ? "border-amber-400 text-amber-700 bg-amber-50"
                                : "text-amber-600 border-amber-200 hover:bg-amber-50"
                            }`}
                            onClick={() => handleThursdayDecision(student, "shortcoming")}
                            disabled={createRecord.isPending || updateRecord.isPending}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            تقصير
                          </Button>
                          <Button
                            size="sm"
                            className={`gap-1 h-8 px-3 ${
                              hasRecord && !recordForEdit?.isAbsent && !isShortcomingRecord
                                ? "bg-emerald-700 hover:bg-emerald-800"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                            onClick={() => handleThursdayDecision(student, "correct")}
                            disabled={createRecord.isPending || updateRecord.isPending}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            صح
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Students list */}
      {selectedCircleId && !isTeacherAbsent && !supervisorBlockedFromEntry && !isThursdayQuotaCircle && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                طالبات الحلقة
              </CardTitle>
              <div className="flex gap-2">
                {isBulkEligible && pendingStudents.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 h-8 text-xs shrink-0"
                    onClick={() => { setBulkForm(emptyForm()); setBulkStep(1); setBulkDialogOpen(true); }}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    إدخال جماعي
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 h-8 text-xs shrink-0"
                  onClick={handleMarkTeacherAbsent}
                  disabled={markTeacherAbsent.isPending}
                >
                  <UserX className="w-3.5 h-3.5" />
                  المعلمة غائبة
                </Button>
              </div>
            </div>
            {studentsProgress.total > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600 font-semibold">✓ {studentsProgress.done} أُنجزت</span>
                    {studentsProgress.remaining > 0 && (
                      <span className="text-amber-600 font-semibold">⏳ {studentsProgress.remaining} متبقية</span>
                    )}
                    {studentsProgress.remaining === 0 && (
                      <span className="text-green-600 font-semibold">اكتملت الحلقة ✅</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{studentsProgress.done}/{studentsProgress.total}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${studentsProgress.total > 0 ? (studentsProgress.done / studentsProgress.total) * 100 : 0}%`,
                      backgroundColor: studentsProgress.remaining === 0 ? "#22c55e" : "#f59e0b",
                    }}
                  />
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {studentsInCircle.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا يوجد طالبات في هذه الحلقة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {studentsInCircle.length > 5 && (
                  <div className="relative mb-3">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="ابحثي باسم الطالبة..."
                      className="pr-9 text-right"
                      dir="rtl"
                    />
                  </div>
                )}
                {filteredStudents.map((student: any) => {
                  const hasRecord = !!student.hasRecord;
                  const isOnLeave = !!student.onLeave;
                  const recordForEdit = hasRecord
                    ? (circleRecords as any[]).find((r: any) => r.studentId === student.studentId)
                    : null;
                  const isThursdayRecord = recordForEdit ? isThursdayDate(recordForEdit.date) : false;
                  const editWindowMs = isThursdayRecord ? 48 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
                  const canEdit =
                    !hasRecord ||
                    ["leader", "track_supervisor"].includes((user as any)?.role) ||
                    (recordForEdit && new Date(recordForEdit.createdAt).getTime() > Date.now() - editWindowMs);

                  // Plan comparison badge
                  const studentPlan = circlePlans.find((p: any) => p.studentId === student.studentId);
                  let planBadge: React.ReactNode = null;
                  if (studentPlan && studentPlan.days?.length > 0) {
                    const pMode: "girls" | "fixation" = studentPlan.planType === "fixation" ? "fixation" : "girls";
                    const totalDays = studentPlan.planType === "fixation" ? 24 : 21;
                    const todayDay = getCurrentPlanDay(studentPlan.startDate, totalDays, pMode);
                    const dayEntry = studentPlan.days.find((d: any) => d.dayNumber === todayDay);
                    const planned = dayEntry?.pages ?? 0;
                    if (todayDay > 0 && todayDay <= totalDays && planned > 0) {
                      if (recordForEdit?.isAbsent) {
                        planBadge = <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px] px-1.5 py-0">غائبة</Badge>;
                      } else if (recordForEdit && !recordForEdit.isAbsent) {
                        const entered = studentPlan.planType === "fixation"
                          ? (recordForEdit.reviewPages ?? recordForEdit.reviewFarPages ?? 0)
                          : (recordForEdit.reviewFarPages ?? 0);
                        if (entered >= planned * 1.05) {
                          planBadge = <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] px-1.5 py-0">↑ تجاوزت</Badge>;
                        } else if (entered >= planned * 0.95) {
                          planBadge = <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5 py-0">✓ نصاب الخطة</Badge>;
                        } else if (entered > 0) {
                          planBadge = <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5 py-0">⚠ أقل من الخطة</Badge>;
                        }
                      }
                    }
                  }

                  return (
                    <div
                      key={`${student.studentId}-${student.circleId}`}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                        hasRecord
                          ? "border-emerald-200 bg-emerald-50/40"
                          : isOnLeave
                          ? "border-slate-200 bg-slate-50/40 opacity-60"
                          : "border-border hover:bg-muted/20"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm">{student.studentName}</p>
                          {hasRecord && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5 py-0">
                              ✓ تم الإدخال
                            </Badge>
                          )}
                          {isOnLeave && (
                            <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px] px-1.5 py-0">
                              إجازة
                            </Badge>
                          )}
                          {planBadge}
                        </div>
                        {student.track && (
                          <p className="text-xs text-muted-foreground mt-0.5">{student.track}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {hasRecord ? (
                          canEdit && recordForEdit ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => openEditRecord(recordForEdit)}
                            >
                              <PenSquare className="w-3.5 h-3.5" />
                              تعديل
                            </Button>
                          ) : null
                        ) : isOnLeave ? null : (
                          <>
                            {isDataEntry && selectedCircleId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-amber-600 border-amber-200 hover:bg-amber-50 h-8 px-2"
                                title="أرشفة الطالبة من هذه الحلقة"
                                onClick={() => setConfirmArchiveStudent({ studentId: student.studentId, studentName: student.studentName, circleId: selectedCircleId })}
                                disabled={archiveActionLoading === student.studentId}
                              >
                                <Archive className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-rose-600 border-rose-200 hover:bg-rose-50 h-8 px-2.5"
                              onClick={() => {
                                setSelectedStudent(student);
                                setForm({ ...emptyForm(), isAbsent: true });
                                setAutoFilled(false);
                                setDialogOpen(true);
                              }}
                            >
                              غائبة
                            </Button>
                            <Button
                              size="sm"
                              className="gap-1.5 h-8"
                              onClick={() => openEntry(student)}
                            >
                              <PenSquare className="w-3.5 h-3.5" />
                              إدخال
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entry Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingRecordId(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <span>{selectedStudent?.studentName}</span>
              {selectedStudent?.track && (
                <Badge variant="outline" className="text-xs">{selectedStudent.track}</Badge>
              )}
              {editingRecordId && (
                <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">تعديل</Badge>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground text-right">{selectedDate}</p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Absent toggle */}
            {(() => {
              const repeatedInfo = (repeatedAbsences as any[])?.find(
                (r: any) => r.studentId === selectedStudent?.studentId,
              );
              return (
                <>
                  <label className="flex items-center gap-3 p-3 border border-rose-200 rounded-xl bg-rose-50/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isAbsent}
                      onChange={(e) => {
                        if (e.target.checked && repeatedInfo) setConfirmAbsenceOpen(true);
                        else setForm((f) => ({ ...f, isAbsent: e.target.checked }));
                      }}
                      className="w-4 h-4 accent-rose-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-rose-600">تسجيل غياب</span>
                      {repeatedInfo && (
                        <span className="mr-2 text-xs text-rose-400">
                          (غابت {repeatedInfo.absenceCount} مرة مؤخرًا)
                        </span>
                      )}
                    </div>
                  </label>

                  <Dialog open={confirmAbsenceOpen} onOpenChange={setConfirmAbsenceOpen}>
                    <DialogContent className="max-w-sm" dir="rtl">
                      <DialogHeader>
                        <DialogTitle className="text-rose-600 flex items-center gap-2">
                          <AlertCircle className="w-5 h-5" />
                          تأكيد الغياب
                        </DialogTitle>
                      </DialogHeader>
                      <div className="py-2 text-sm text-muted-foreground">
                        <p>
                          <strong className="text-foreground">{selectedStudent?.studentName}</strong>{" "}
                          غابت{" "}
                          <strong className="text-rose-600">
                            {repeatedAbsences &&
                              (repeatedAbsences as any[]).find(
                                (r: any) => r.studentId === selectedStudent?.studentId,
                              )?.absenceCount}{" "}
                            مرة
                          </strong>{" "}
                          في الفترة الأخيرة.
                        </p>
                        <p className="mt-2">هل أنتِ متأكدة من تسجيل غيابها مجددًا؟</p>
                      </div>
                      <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setConfirmAbsenceOpen(false)}>
                          إلغاء
                        </Button>
                        <Button
                          className="bg-rose-600 hover:bg-rose-700 text-white"
                          onClick={() => {
                            setForm((f) => ({ ...f, isAbsent: true }));
                            setConfirmAbsenceOpen(false);
                          }}
                        >
                          نعم، تسجيل الغياب
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}

            {/* Entry fields (hidden when absent) */}
            {!form.isAbsent && (
              <>
                {inputFields.includes("memorize") && (
                  <div className="space-y-1.5">
                    {isMothersEntry && (
                      <div className="flex gap-2 p-1 bg-muted rounded-lg">
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, memorizeMode: "range" }))}
                          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            form.memorizeMode !== "manual" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"
                          }`}
                        >
                          بالنطاق (من - إلى)
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, memorizeMode: "manual" }))}
                          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            form.memorizeMode === "manual" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"
                          }`}
                        >
                          عدد الأوجه مباشرة
                        </button>
                      </div>
                    )}
                    {isMothersEntry && form.memorizeMode === "manual" ? (
                      <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-4 space-y-2">
                        <Label className="text-xs text-muted-foreground">عدد الأوجه المحفوظة هذا الأسبوع</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={form.manualPages}
                          onChange={(e) => setForm((f) => ({ ...f, manualPages: e.target.value }))}
                          placeholder="مثال: 4"
                          className="text-right"
                          dir="rtl"
                        />
                      </div>
                    ) : (
                      <SurahSection
                        title={isFixationEntry ? "التثبيت الجديد" : "الحفظ"}
                        color="border-teal-200 bg-teal-50/40"
                        section={form.memorize}
                        onChange={(f, v) => updateSection("memorize", f, v)}
                        autoSuggested={autoFilled && !!form.memorize.surahStart}
                        onVoiceFill={(ss, as, se, ae) =>
                          setForm((f) => ({ ...f, memorize: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae } }))
                        }
                      />
                    )}
                  </div>
                )}

                {inputFields.includes("listen") && (
                  <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-4">
                    <p className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <span>🎧</span>
                      هل استمعت للقارئ؟
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, listenedToReciter: true }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                          form.listenedToReciter === true
                            ? "border-teal-500 bg-teal-100 text-teal-700"
                            : "border-border/50 text-muted-foreground hover:border-teal-300"
                        }`}
                      >
                        ✓ نعم
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, listenedToReciter: false }))}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                          form.listenedToReciter === false
                            ? "border-rose-400 bg-rose-50 text-rose-600"
                            : "border-border/50 text-muted-foreground hover:border-rose-300"
                        }`}
                      >
                        ✗ لا
                      </button>
                    </div>
                  </div>
                )}

                {inputFields.includes("review_near") && (
                  <SurahSection
                    title="المراجعة القريبة"
                    color="border-blue-200 bg-blue-50/40"
                    section={form.reviewNear}
                    onChange={(f, v) => updateSection("reviewNear", f, v)}
                    autoSuggested={autoFilled && !!form.reviewNear.surahStart}
                    locked={form.noReviewNear}
                    onToggleLock={() =>
                      setForm((f) => ({
                        ...f,
                        noReviewNear: !f.noReviewNear,
                        reviewNear: !f.noReviewNear ? emptySection() : f.reviewNear,
                      }))
                    }
                    onVoiceFill={(ss, as, se, ae) =>
                      setForm((f) => ({
                        ...f,
                        reviewNear: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae },
                        noReviewNear: false,
                      }))
                    }
                  />
                )}

                {inputFields.includes("review_far") && (
                  <div className="space-y-1.5">
                    {false && null /* review plan banner removed */}
                    <SurahSection
                      title="المراجعة البعيدة"
                      color="border-teal-200 bg-teal-100/40"
                      section={form.reviewFar}
                      onChange={(f, v) => updateSection("reviewFar", f, v)}
                      autoSuggested={autoFilled && !!form.reviewFar.surahStart}
                      locked={form.noReviewFar}
                      onToggleLock={() =>
                        setForm((f) => ({
                          ...f,
                          noReviewFar: !f.noReviewFar,
                          reviewFar: !f.noReviewFar ? emptySection() : f.reviewFar,
                          // إذا قُفل النطاق الأول، أخفِ الثاني تلقائيًا
                          noReviewFar2: !f.noReviewFar ? true : f.noReviewFar2,
                          reviewFar2: !f.noReviewFar ? emptySection() : f.reviewFar2,
                        }))
                      }
                      onVoiceFill={(ss, as, se, ae) =>
                        setForm((f) => ({
                          ...f,
                          reviewFar: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae },
                          noReviewFar: false,
                        }))
                      }
                    />
                    {/* النطاق الثاني للمراجعة البعيدة */}
                    {!form.noReviewFar && (
                      form.noReviewFar2 ? (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, noReviewFar2: false }))}
                          className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 py-0.5 pr-1"
                        >
                          <span className="text-base leading-none">+</span>
                          إضافة نطاق ثانٍ للمراجعة البعيدة
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <SurahSection
                            title="المراجعة البعيدة — نطاق ثانٍ"
                            color="border-teal-200 bg-teal-100/40"
                            section={form.reviewFar2}
                            onChange={(f, v) => updateSection("reviewFar2", f, v)}
                            autoSuggested={autoFilled && !!form.reviewFar2.surahStart}
                            onVoiceFill={(ss, as, se, ae) =>
                              setForm((f) => ({
                                ...f,
                                reviewFar2: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae },
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, noReviewFar2: true, reviewFar2: emptySection() }))}
                            className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 py-0.5 pr-1"
                          >
                            <span className="text-base leading-none">−</span>
                            حذف النطاق الثاني
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}

                {inputFields.includes("review") && isMothersEntry && (
                  <div className="space-y-1.5">
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, reviewMode: "range" }))}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          form.reviewMode !== "manual" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"
                        }`}
                      >
                        بالنطاق (من - إلى)
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, reviewMode: "manual" }))}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          form.reviewMode === "manual" ? "bg-white shadow-sm text-primary" : "text-muted-foreground"
                        }`}
                      >
                        عدد الأوجه مباشرة
                      </button>
                    </div>
                    {form.reviewMode === "manual" ? (
                      <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-2">
                        <Label className="text-xs text-muted-foreground">عدد أوجه المراجعة هذا الأسبوع</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={form.manualReviewPages}
                          onChange={(e) => setForm((f) => ({ ...f, manualReviewPages: e.target.value }))}
                          placeholder="مثال: 4"
                          className="text-right"
                          dir="rtl"
                        />
                      </div>
                    ) : (
                      <SurahSection
                        title="المراجعة"
                        color="border-blue-200 bg-blue-50/40"
                        section={form.review}
                        onChange={(f, v) => updateSection("review", f, v)}
                        autoSuggested={autoFilled && !!form.review.surahStart}
                        onVoiceFill={(ss, as, se, ae) =>
                          setForm((f) => ({
                            ...f,
                            review: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae },
                          }))
                        }
                      />
                    )}
                  </div>
                )}

                {inputFields.includes("review") && !isMothersEntry && (
                  <SurahSection
                    title="المراجعة"
                    color="border-blue-200 bg-blue-50/40"
                    section={form.review}
                    onChange={(f, v) => updateSection("review", f, v)}
                    autoSuggested={autoFilled && !!form.review.surahStart}
                    locked={form.noReview}
                    onToggleLock={() =>
                      setForm((f) => ({
                        ...f,
                        noReview: !f.noReview,
                        review: !f.noReview ? emptySection() : f.review,
                      }))
                    }
                    onVoiceFill={(ss, as, se, ae) =>
                      setForm((f) => ({
                        ...f,
                        review: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae },
                        noReview: false,
                      }))
                    }
                  />
                )}

                {inputFields.includes("recitation") && (
                  <SurahSection
                    title="التلاوة"
                    color="border-emerald-200 bg-emerald-50/40"
                    section={form.recitation}
                    onChange={(f, v) => updateSection("recitation", f, v)}
                    autoSuggested={autoFilled && !!form.recitation.surahStart}
                    onVoiceFill={(ss, as, se, ae) =>
                      setForm((f) => ({ ...f, recitation: { surahStart: ss, ayahStart: as, surahEnd: se, ayahEnd: ae } }))
                    }
                  />
                )}

                {inputFields.includes("repetitions") && (
                  <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-4">
                    <p className="font-semibold text-sm flex items-center gap-2 mb-3">
                      <BookOpen className="w-4 h-4" />
                      عدد مرات التكرار
                    </p>
                    <select
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-right"
                      value={form.repetitions}
                      onChange={(e) => setForm((f) => ({ ...f, repetitions: e.target.value }))}
                    >
                      {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n.toString()}>
                          {n} {n === 7 ? "(افتراضي)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Pages summary */}
                {hasPages && (
                  <div className="border border-border rounded-xl p-3 bg-muted/30">
                    <p className="text-xs font-bold text-muted-foreground mb-2">ملخص الأوجه</p>
                    <div className="flex flex-wrap gap-2">
                      {memPages > 0 && (
                        <Badge className="bg-teal-100 text-teal-700 border-0">
                          حفظ: {formatPages(memPages)} وجه
                        </Badge>
                      )}
                      {revNearPages > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 border-0">
                          م. قريبة: {formatPages(revNearPages)} وجه
                        </Badge>
                      )}
                      {revFarPages > 0 && (
                        <Badge className="bg-teal-100 text-teal-600 border-0">
                          م. بعيدة: {formatPages(revFarPages)} وجه
                        </Badge>
                      )}
                      {revFar2Pages > 0 && (
                        <Badge className="bg-teal-100 text-teal-600 border-0">
                          م. بعيدة ٢: {formatPages(revFar2Pages)} وجه
                        </Badge>
                      )}
                      {revPages > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 border-0">
                          مراجعة: {formatPages(revPages)} وجه
                        </Badge>
                      )}
                      {recPages > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0">
                          تلاوة: {formatPages(recPages)} وجه
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              disabled={createRecord.isPending || updateRecord.isPending}
            >
              {createRecord.isPending || updateRecord.isPending
                ? "جاري الحفظ..."
                : "حفظ البيانات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </>)} {/* end entry tab */}

      {/* ── Archive tab content ── */}
      {activeTab === "archive" && isDataEntry && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pr-9 text-right"
              placeholder="ابحثي عن طالبة بالاسم..."
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
            />
          </div>

          {/* Archived students list */}
          {archivedLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="w-10 h-10 mx-auto mb-2 opacity-30 animate-pulse" />
              <p className="text-sm">جاري التحميل...</p>
            </div>
          ) : archivedStudents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">لا يوجد طالبات في الأرشيف</p>
              <p className="text-xs mt-1">الطالبات المؤرشفات من حلقاتك ستظهر هنا</p>
            </div>
          ) : (
            (() => {
              const filtered = archivedStudents.filter((s: any) =>
                !archiveSearch.trim() || s.fullName?.includes(archiveSearch.trim()),
              );
              if (filtered.length === 0) return (
                <div className="text-center py-8 text-muted-foreground text-sm">لا توجد نتائج</div>
              );
              return (
                <div className="space-y-2">
                  {filtered.map((s: any) => (
                    <Card key={`${s.studentId}-${s.circleId}`} className="border-0 shadow-sm">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{s.fullName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              أُرشفت من: <span className="font-medium">{s.circleName}</span>
                              {s.archivedAt && (
                                <span className="mr-2">
                                  · {new Date(s.archivedAt).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}
                                </span>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 shrink-0 text-xs"
                            onClick={() => {
                              setEnrollDialogStudent(s);
                              setEnrollTargetCircleId(assignedCircles[0]?.id ?? null);
                            }}
                            disabled={archiveActionLoading === s.studentId}
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            انقليها لحلقتك
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()
          )}

          {/* Global search — archived + unassigned/registration */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              بحث عام
            </p>
            <p className="text-xs text-muted-foreground -mt-1">
              دوّري بالاسم على أي طالبة — مؤرشفة، في حلقة التسجيل، أو غير مرتبطة بحلقة
            </p>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pr-9 text-right"
                placeholder="اكتبي اسم الطالبة (حرفين على الأقل)..."
                value={globalArchiveSearch}
                onChange={(e) => setGlobalArchiveSearch(e.target.value)}
              />
            </div>

            {globalArchiveLoading && (
              <p className="text-xs text-muted-foreground text-center py-2">جاري البحث...</p>
            )}

            {!globalArchiveLoading && globalArchiveSearch.trim().length >= 2
              && globalArchiveResults.length === 0 && globalUnassignedResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">لا توجد نتائج</p>
            )}

            {/* Archived results */}
            {globalArchiveResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground px-1">مؤرشفات</p>
                {globalArchiveResults.map((s: any) => (
                  <Card key={`arch-${s.studentId}-${s.circleId ?? "none"}`} className="border-0 shadow-sm border-r-2 border-r-rose-300">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{s.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.isGlobalArchive
                              ? <span className="text-rose-500 font-medium">أرشيف عام</span>
                              : <>أُرشفت من: <span className="font-medium">{s.circleName}</span></>}
                            {s.archivedAt && (
                              <span className="mr-2">
                                · {new Date(s.archivedAt).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 shrink-0 text-xs"
                          onClick={() => {
                            setEnrollDialogStudent({ ...s, enrollMode: "restore" });
                            setEnrollTargetCircleId(assignedCircles[0]?.id ?? null);
                          }}
                          disabled={archiveActionLoading === s.studentId}
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                          انقليها
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Unassigned / registration results */}
            {globalUnassignedResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground px-1">في التسجيل أو بدون حلقة</p>
                {globalUnassignedResults.map((s: any) => (
                  <Card key={`unassigned-${s.studentId}`} className="border-0 shadow-sm border-r-2 border-r-amber-300">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{s.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.source === "registration"
                              ? <span className="font-medium text-amber-600">حلقة التسجيل · {s.circleName}</span>
                              : <span className="text-muted-foreground">بدون حلقة</span>}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0 text-xs"
                          onClick={() => {
                            setEnrollDialogStudent({ ...s, enrollMode: "enroll" });
                            setEnrollTargetCircleId(assignedCircles[0]?.id ?? null);
                          }}
                          disabled={archiveActionLoading === s.studentId}
                        >
                          <Users className="w-3.5 h-3.5" />
                          أضيفيها
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Info note */}
          <Card className="border-0 bg-amber-50/60 shadow-none">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-amber-700">
                <span className="font-bold">ملاحظة:</span> يمكنك أرشفة طالبة من حلقتك بالضغط على زر الأرشيف 📦 بجانب اسمها في قائمة إدخال البيانات.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirm archive dialog */}
      <Dialog open={!!confirmArchiveStudent} onOpenChange={(o) => { if (!o) setConfirmArchiveStudent(null); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-amber-600" />
              تأكيد الأرشفة
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
            <p className="text-sm">
              هل أنتِ متأكدة من أرشفة{" "}
              <span className="font-bold">{confirmArchiveStudent?.studentName}</span>{" "}
              من هذه الحلقة؟
            </p>
            <p className="text-xs text-amber-600 mt-1.5">ستُنقل إلى قسم الأرشيف ويمكن استعادتها لاحقاً.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmArchiveStudent(null)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={archiveActionLoading === confirmArchiveStudent?.studentId}
              onClick={() => {
                if (confirmArchiveStudent) {
                  handleArchiveStudent(confirmArchiveStudent.studentId, confirmArchiveStudent.circleId);
                  setConfirmArchiveStudent(null);
                }
              }}
            >
              {archiveActionLoading === confirmArchiveStudent?.studentId ? "جاري..." : "تأكيد الأرشفة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll / restore dialog */}
      <Dialog open={!!enrollDialogStudent} onOpenChange={(o) => { if (!o) { setEnrollDialogStudent(null); setEnrollTargetCircleId(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {enrollDialogStudent?.enrollMode === "enroll"
                ? <><Users className="w-5 h-5 text-amber-600" /> إلحاق طالبة بحلقتك</>
                : <><ArchiveRestore className="w-5 h-5 text-primary" /> نقل طالبة من الأرشيف</>}
            </DialogTitle>
          </DialogHeader>
          {enrollDialogStudent && (
            <div className="space-y-4">
              <div className={`rounded-xl p-3 ${enrollDialogStudent.enrollMode === "enroll" ? "bg-amber-50 border border-amber-100" : "bg-muted/40"}`}>
                <p className="font-bold text-sm">{enrollDialogStudent.fullName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {enrollDialogStudent.enrollMode === "enroll"
                    ? (enrollDialogStudent.source === "registration"
                        ? `في حلقة التسجيل · ${enrollDialogStudent.circleName}`
                        : "بدون حلقة")
                    : (enrollDialogStudent.isGlobalArchive
                        ? "أرشيف عام"
                        : `أُرشفت من: ${enrollDialogStudent.circleName ?? "—"}`)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  {enrollDialogStudent.enrollMode === "enroll" ? "أضيفيها إلى حلقة:" : "انقليها إلى حلقة:"}
                </Label>
                <select
                  className="w-full border border-input rounded-xl px-3 py-2.5 text-sm bg-background text-right"
                  value={enrollTargetCircleId ?? ""}
                  onChange={(e) => setEnrollTargetCircleId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">اختري الحلقة</option>
                  {assignedCircles.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEnrollDialogStudent(null); setEnrollTargetCircleId(null); }}>
              إلغاء
            </Button>
            <Button
              disabled={!enrollTargetCircleId || archiveActionLoading === enrollDialogStudent?.studentId}
              onClick={() => {
                if (enrollDialogStudent && enrollTargetCircleId) {
                  handleEnrollFromArchive(
                    enrollDialogStudent.studentId,
                    enrollTargetCircleId,
                    enrollDialogStudent.enrollMode ?? "restore",
                  );
                }
              }}
            >
              {archiveActionLoading === enrollDialogStudent?.studentId
                ? "جاري..."
                : enrollDialogStudent?.enrollMode === "enroll" ? "إلحاق الطالبة" : "نقل الطالبة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Entry Dialog ── */}
      {isBulkEligible && (
        <Dialog open={bulkDialogOpen} onOpenChange={(open) => {
          setBulkDialogOpen(open);
          if (!open) { setBulkStep(1); setBulkForm(emptyForm()); setBulkOverrides({}); setBulkEditingStudent(null); }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-right flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                إدخال جماعي — {selectedCircle?.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground text-right">
                {bulkStep === 1
                  ? "أدخلي البيانات الموحدة للحلقة"
                  : `راجعي بيانات ${pendingStudents.length} طالبة — عدّلي أي استثناء قبل الحفظ`}
              </p>
            </DialogHeader>

            {/* الخطوة ١: البيانات الموحدة */}
            {bulkStep === 1 && (
              <div className="space-y-4 py-2">
                {inputFields.includes("memorize") && (
                  <SurahSection
                    title="الحفظ"
                    color="border-indigo-200 bg-indigo-100/40"
                    section={bulkForm.memorize}
                    onChange={(f, v) => setBulkForm(prev => ({ ...prev, memorize: { ...prev.memorize, [f]: v } }))}
                  />
                )}
                {inputFields.includes("review_near") && (
                  <SurahSection
                    title="المراجعة القريبة"
                    color="border-purple-200 bg-purple-100/40"
                    section={bulkForm.reviewNear}
                    onChange={(f, v) => setBulkForm(prev => ({ ...prev, reviewNear: { ...prev.reviewNear, [f]: v } }))}
                    locked={bulkForm.noReviewNear}
                    onToggleLock={() => setBulkForm(prev => ({ ...prev, noReviewNear: !prev.noReviewNear, reviewNear: !prev.noReviewNear ? emptySection() : prev.reviewNear }))}
                  />
                )}
                {inputFields.includes("review_far") && (
                  <SurahSection
                    title="المراجعة البعيدة"
                    color="border-teal-200 bg-teal-100/40"
                    section={bulkForm.reviewFar}
                    onChange={(f, v) => setBulkForm(prev => ({ ...prev, reviewFar: { ...prev.reviewFar, [f]: v } }))}
                    locked={bulkForm.noReviewFar}
                    onToggleLock={() => setBulkForm(prev => ({ ...prev, noReviewFar: !prev.noReviewFar, reviewFar: !prev.noReviewFar ? emptySection() : prev.reviewFar }))}
                  />
                )}
                {inputFields.includes("review") && (
                  <SurahSection
                    title="المراجعة"
                    color="border-blue-200 bg-blue-100/40"
                    section={bulkForm.review}
                    onChange={(f, v) => setBulkForm(prev => ({ ...prev, review: { ...prev.review, [f]: v } }))}
                    locked={bulkForm.noReview}
                    onToggleLock={() => setBulkForm(prev => ({ ...prev, noReview: !prev.noReview, review: !prev.noReview ? emptySection() : prev.review }))}
                  />
                )}
                {inputFields.includes("listen") && (
                  <div className="border rounded-xl p-4 border-amber-200 bg-amber-50/40 space-y-3">
                    <p className="font-semibold text-sm flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      سماع القارئ
                    </p>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => setBulkForm(prev => ({ ...prev, listenedToReciter: true }))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${bulkForm.listenedToReciter === true ? "bg-green-500 text-white border-green-500" : "border-input hover:bg-muted"}`}
                      >نعم</button>
                      <button type="button"
                        onClick={() => setBulkForm(prev => ({ ...prev, listenedToReciter: false }))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${bulkForm.listenedToReciter === false ? "bg-rose-500 text-white border-rose-500" : "border-input hover:bg-muted"}`}
                      >لا</button>
                    </div>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={inputFields.includes("memorize") && !bulkForm.memorize.surahStart}
                  onClick={() => {
                    const overrides: Record<number, BulkOverride> = {};
                    for (const s of pendingStudents as any[]) {
                      overrides[s.studentId] = { isAbsent: false };
                    }
                    setBulkOverrides(overrides);
                    setBulkStep(2);
                  }}
                >
                  التالي — مراجعة الطالبات ({pendingStudents.length})
                </Button>
              </div>
            )}

            {/* الخطوة ٢: مراجعة الطالبات */}
            {bulkStep === 2 && (
              <div className="space-y-3 py-2">
                {/* ملخص البيانات الموحدة */}
                <div className="flex flex-wrap gap-1.5 bg-muted/40 rounded-xl p-3">
                  <span className="text-xs text-muted-foreground font-medium ml-1">الموحد:</span>
                  {calcPages(bulkForm.memorize) > 0 && (
                    <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs">حفظ {formatPages(calcPages(bulkForm.memorize))} وجه</Badge>
                  )}
                  {!bulkForm.noReviewNear && calcPages(bulkForm.reviewNear) > 0 && (
                    <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">قريبة {formatPages(calcPages(bulkForm.reviewNear))} وجه</Badge>
                  )}
                  {!bulkForm.noReviewFar && calcPages(bulkForm.reviewFar) > 0 && (
                    <Badge className="bg-teal-100 text-teal-700 border-0 text-xs">بعيدة {formatPages(calcPages(bulkForm.reviewFar))} وجه</Badge>
                  )}
                  {!bulkForm.noReview && calcPages(bulkForm.review) > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">مراجعة {formatPages(calcPages(bulkForm.review))} وجه</Badge>
                  )}
                  {bulkForm.listenedToReciter !== null && (
                    <Badge className={`border-0 text-xs ${bulkForm.listenedToReciter ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-600"}`}>
                      سماع: {bulkForm.listenedToReciter ? "نعم" : "لا"}
                    </Badge>
                  )}
                </div>

                {/* قائمة الطالبات */}
                <div className="space-y-2">
                  {(pendingStudents as any[]).map((student: any) => {
                    const override = bulkOverrides[student.studentId] ?? { isAbsent: false };
                    const effectiveMem = override.memorize ?? bulkForm.memorize;
                    const memPgs = calcPages(effectiveMem);
                    const isExpanded = bulkEditingStudent === student.studentId;
                    const hasMemOverride = !!override.memorize;

                    return (
                      <div key={student.studentId} className={`border rounded-xl p-3 space-y-2 transition-colors ${override.isAbsent ? "border-rose-200 bg-rose-50/40" : "border-input bg-background"}`}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setBulkOverrides(prev => ({
                              ...prev,
                              [student.studentId]: { ...prev[student.studentId], isAbsent: !override.isAbsent },
                            }))}
                            className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${override.isAbsent ? "bg-rose-500 text-white border-rose-500" : "bg-green-50 border-green-300 text-green-700 hover:bg-green-100"}`}
                            title={override.isAbsent ? "اضغطي لتسجيل حضور" : "اضغطي لتسجيل غياب"}
                          >
                            {override.isAbsent ? "✗" : "✓"}
                          </button>
                          <span className="flex-1 text-sm font-medium truncate">{student.studentName}</span>
                          {override.isAbsent
                            ? <Badge className="bg-rose-100 text-rose-600 border-0 text-xs shrink-0">غائبة</Badge>
                            : memPgs > 0 && (
                              <Badge className={`border-0 text-xs shrink-0 ${hasMemOverride ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                                {formatPages(memPgs)} وجه{hasMemOverride ? " ✏" : ""}
                              </Badge>
                            )
                          }
                          {!override.isAbsent && inputFields.includes("memorize") && (
                            <button
                              type="button"
                              onClick={() => setBulkEditingStudent(isExpanded ? null : student.studentId)}
                              className="text-xs text-muted-foreground hover:text-foreground border border-input rounded-lg px-2 py-1 shrink-0"
                            >
                              {isExpanded ? "إغلاق" : "تعديل"}
                            </button>
                          )}
                        </div>

                        {isExpanded && !override.isAbsent && (
                          <div className="pt-2 border-t border-dashed space-y-2">
                            <p className="text-xs text-muted-foreground">تعديل الحفظ لهذه الطالبة فقط:</p>
                            <SurahSection
                              title="الحفظ"
                              color="border-indigo-200 bg-indigo-100/40"
                              section={override.memorize ?? bulkForm.memorize}
                              onChange={(f, v) => setBulkOverrides(prev => ({
                                ...prev,
                                [student.studentId]: {
                                  ...prev[student.studentId],
                                  memorize: { ...(prev[student.studentId].memorize ?? bulkForm.memorize), [f]: v },
                                },
                              }))}
                            />
                            {hasMemOverride && (
                              <button
                                type="button"
                                onClick={() => setBulkOverrides(prev => ({
                                  ...prev,
                                  [student.studentId]: { ...prev[student.studentId], memorize: undefined },
                                }))}
                                className="text-xs text-muted-foreground hover:text-rose-500"
                              >
                                ↩ إعادة للبيانات الموحدة
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ملخص + أزرار */}
                <div className="flex flex-col gap-2 pt-2 border-t">
                  <div className="flex gap-3 text-xs justify-center">
                    <span className="text-green-600 font-semibold">
                      ✓ {Object.values(bulkOverrides).filter(o => !o.isAbsent).length} حاضرة
                    </span>
                    {Object.values(bulkOverrides).filter(o => o.isAbsent).length > 0 && (
                      <span className="text-rose-500 font-semibold">
                        ✗ {Object.values(bulkOverrides).filter(o => o.isAbsent).length} غائبة
                      </span>
                    )}
                    {Object.values(bulkOverrides).filter(o => o.memorize).length > 0 && (
                      <span className="text-amber-600 font-semibold">
                        ✏ {Object.values(bulkOverrides).filter(o => o.memorize).length} معدّلة
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setBulkStep(1)}>
                      رجوع
                    </Button>
                    <Button className="flex-1" disabled={bulkSubmitting} onClick={handleBulkSave}>
                      {bulkSubmitting ? "جاري الحفظ..." : `حفظ الكل (${pendingStudents.length} طالبة)`}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}

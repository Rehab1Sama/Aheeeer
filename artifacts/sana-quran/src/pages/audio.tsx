import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Volume2, Download, Play, Pause, ChevronRight, ChevronLeft, SkipForward, SkipBack } from "lucide-react";
import { getAyahsForWajh } from "@/lib/mushaf-pages";

const RECITERS = [
  { id: "ibrahim_akhdar",  name: "إبراهيم الأخضر",        folder: "Ibrahim_Akhdar_32kbps" },
  { id: "hussary",         name: "محمود خليل الحصري",      folder: "Husary_128kbps_Mujawwad" },
  { id: "hudhaifi",        name: "علي الحذيفي",            folder: "Hudhaify_128kbps" },
  { id: "ayub",            name: "محمد أيوب",              folder: "Muhammad_Ayyoub_128kbps" },
  { id: "tunaiji",         name: "خليفة الطنيجي",          folder: "khalefa_al_tunaiji_64kbps" },
  { id: "suwaid",          name: "أيمن سويد",              folder: "Ayman_Sowaid_64kbps" },
  { id: "minshawi",        name: "محمد صديق المنشاوي",    folder: "Minshawy_Mujawwad_192kbps" },
  { id: "abdulbaset",      name: "عبدالباسط عبدالصمد",    folder: "Abdul_Basit_Mujawwad_128kbps" },
];

const REPEAT_OPTIONS = [1, 2, 3, 5, 10];

const SURAH_NAMES: Record<number, string> = {
  1:"الفاتحة",2:"البقرة",3:"آل عمران",4:"النساء",5:"المائدة",6:"الأنعام",7:"الأعراف",
  8:"الأنفال",9:"التوبة",10:"يونس",11:"هود",12:"يوسف",13:"الرعد",14:"إبراهيم",
  15:"الحجر",16:"النحل",17:"الإسراء",18:"الكهف",19:"مريم",20:"طه",
  21:"الأنبياء",22:"الحج",23:"المؤمنون",24:"النور",25:"الفرقان",26:"الشعراء",
  27:"النمل",28:"القصص",29:"العنكبوت",30:"الروم",31:"لقمان",32:"السجدة",
  33:"الأحزاب",34:"سبأ",35:"فاطر",36:"يس",37:"الصافات",38:"ص",39:"الزمر",
  40:"غافر",41:"فصلت",42:"الشورى",43:"الزخرف",44:"الدخان",45:"الجاثية",
  46:"الأحقاف",47:"محمد",48:"الفتح",49:"الحجرات",50:"ق",51:"الذاريات",
  52:"الطور",53:"النجم",54:"القمر",55:"الرحمن",56:"الواقعة",57:"الحديد",
  58:"المجادلة",59:"الحشر",60:"الممتحنة",61:"الصف",62:"الجمعة",63:"المنافقون",
  64:"التغابن",65:"الطلاق",66:"التحريم",67:"الملك",68:"القلم",69:"الحاقة",
  70:"المعارج",71:"نوح",72:"الجن",73:"المزمل",74:"المدثر",75:"القيامة",
  76:"الإنسان",77:"المرسلات",78:"النبأ",79:"النازعات",80:"عبس",81:"التكوير",
  82:"الانفطار",83:"المطففين",84:"الانشقاق",85:"البروج",86:"الطارق",87:"الأعلى",
  88:"الغاشية",89:"الفجر",90:"البلد",91:"الشمس",92:"الليل",93:"الضحى",
  94:"الشرح",95:"التين",96:"العلق",97:"القدر",98:"البينة",99:"الزلزلة",
  100:"العاديات",101:"القارعة",102:"التكاثر",103:"العصر",104:"الهمزة",
  105:"الفيل",106:"قريش",107:"الماعون",108:"الكوثر",109:"الكافرون",
  110:"النصر",111:"المسد",112:"الإخلاص",113:"الفلق",114:"الناس",
};

function getAudioUrl(folder: string, surah: number, ayah: number): string {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  return `https://everyayah.com/data/${folder}/${s}${a}.mp3`;
}

function wajhLabel(page: number, isLeft: boolean): string {
  const wajh = page + (isLeft ? 0.5 : 0);
  const ayahs = getAyahsForWajh(wajh);
  if (!ayahs.length) return `الوجه ${wajh}`;
  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  if (first.surah === last.surah) {
    return `${SURAH_NAMES[first.surah]} ${first.ayah}—${last.ayah}`;
  }
  return `${SURAH_NAMES[first.surah]} ${first.ayah} — ${SURAH_NAMES[last.surah]} ${last.ayah}`;
}

export default function AudioPage() {
  const [page, setPage] = useState(1);
  const [isLeft, setIsLeft] = useState(false);
  const [selectedReciter, setSelectedReciter] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [currentAyahIdx, setCurrentAyahIdx] = useState(0);
  const [currentRepeatIdx, setCurrentRepeatIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef({ playing: false, currentAyahIdx: 0, currentRepeatIdx: 0, repeat: 1 });

  const wajh = page + (isLeft ? 0.5 : 0);
  const ayahs = getAyahsForWajh(wajh);
  const reciter = RECITERS.find(r => r.id === selectedReciter);

  stateRef.current = { playing, currentAyahIdx, currentRepeatIdx, repeat };

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setPlaying(false);
    setCurrentAyahIdx(0);
    setCurrentRepeatIdx(0);
    setLoading(false);
  }, []);

  const playAyah = useCallback((ayahIdx: number, repeatIdx: number) => {
    if (!reciter || !ayahs.length) return;
    const ayah = ayahs[ayahIdx];
    if (!ayah) { setPlaying(false); setCurrentAyahIdx(0); setCurrentRepeatIdx(0); return; }

    const url = getAudioUrl(reciter.folder, ayah.surah, ayah.ayah);
    setLoading(true);
    setCurrentAyahIdx(ayahIdx);
    setCurrentRepeatIdx(repeatIdx);

    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;

    audio.onended = () => {
      const { repeat } = stateRef.current;
      if (repeatIdx + 1 < repeat) {
        playAyah(ayahIdx, repeatIdx + 1);
      } else if (ayahIdx + 1 < ayahs.length) {
        playAyah(ayahIdx + 1, 0);
      } else {
        setPlaying(false);
        setCurrentAyahIdx(0);
        setCurrentRepeatIdx(0);
        setLoading(false);
      }
    };
    audio.onerror = () => { setLoading(false); };

    audio.src = url;
    audio.load();

    const playAttempt = audio.play();
    if (playAttempt !== undefined) {
      playAttempt
        .then(() => { setLoading(false); })
        .catch(() => {
          audio.oncanplaythrough = () => {
            setLoading(false);
            audio.play().catch(() => {});
            audio.oncanplaythrough = null;
          };
        });
    }
  }, [reciter, ayahs]);

  const handlePlay = useCallback(() => {
    if (playing) {
      stopAudio();
    } else {
      if (!reciter || !ayahs.length) return;
      setPlaying(true);
      playAyah(0, 0);
    }
  }, [playing, reciter, ayahs, stopAudio, playAyah]);

  useEffect(() => {
    stopAudio();
  }, [page, isLeft, selectedReciter]);

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; } };
  }, []);

  const handlePrevPage = () => {
    stopAudio();
    if (isLeft) { setIsLeft(false); }
    else if (page > 1) { setPage(p => p - 1); setIsLeft(true); }
  };

  const handleNextPage = () => {
    stopAudio();
    if (!isLeft) { setIsLeft(true); }
    else if (page < 604) { setPage(p => p + 1); setIsLeft(false); }
  };

  const currentAyah = ayahs[currentAyahIdx];
  const label = wajhLabel(page, isLeft);

  const handleDownload = async () => {
    if (!reciter || !ayahs.length) return;
    for (let i = 0; i < ayahs.length; i++) {
      const a = ayahs[i];
      const url = getAudioUrl(reciter.folder, a.surah, a.ayah);
      const filename = `${String(a.surah).padStart(3,"0")}${String(a.ayah).padStart(3,"0")}.mp3`;
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      } catch {
        window.open(url, "_blank");
      }
      if (i < ayahs.length - 1) await new Promise(r => setTimeout(r, 400));
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">صوتيات المصحف</h1>
        <p className="text-muted-foreground text-sm mt-1">استمعي للمقاطع الصوتية أو حمّليها</p>
      </div>

      {/* Page selector */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <p className="text-sm font-bold text-teal-700 mb-4">اختاري الوجه</p>
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handlePrevPage}
              disabled={page === 1 && !isLeft}
              data-testid="button-prev-page"
              aria-label="الوجه السابق"
              className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 hover:bg-teal-100 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={page}
                  data-testid="input-page-number"
                  aria-label="رقم الصفحة"
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (v >= 1 && v <= 604) { stopAudio(); setPage(v); setIsLeft(false); }
                  }}
                  className="w-20 text-4xl font-black text-teal-700 text-center bg-transparent border-b-2 border-teal-200 focus:border-teal-500 outline-none"
                />
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  onClick={() => { stopAudio(); setIsLeft(false); }}
                  data-testid="button-side-right"
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors ${
                    !isLeft ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-500 hover:bg-teal-100"
                  }`}
                >الوجه الأيمن</button>
                <button
                  onClick={() => { stopAudio(); setIsLeft(true); }}
                  data-testid="button-side-left"
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors ${
                    isLeft ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-500 hover:bg-teal-100"
                  }`}
                >الوجه الأيسر</button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">من ٦٠٤ صفحة</div>
            </div>

            <button
              onClick={handleNextPage}
              disabled={page === 604 && isLeft}
              data-testid="button-next-page"
              aria-label="الوجه التالي"
              className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 hover:bg-teal-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <span className="text-sm font-bold text-teal-700">{label}</span>
            <span className="text-xs text-teal-400 mr-2">({ayahs.length} آية)</span>
          </div>
        </CardContent>
      </Card>

      {/* Repeat */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <p className="text-sm font-bold text-teal-700 mb-3">عدد مرات التكرار</p>
          <div className="flex gap-2">
            {REPEAT_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setRepeat(n)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  repeat === n
                    ? "text-white shadow-md"
                    : "bg-white text-teal-600 shadow-sm hover:bg-teal-50"
                }`}
                style={repeat === n ? { background: "linear-gradient(135deg, #7c3aed, #3b82f6)" } : {}}
              >
                {n}×
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reciter selection */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <p className="text-sm font-bold text-teal-700 mb-3">اختاري القارئ</p>
          <div className="grid grid-cols-2 gap-3">
            {RECITERS.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelectedReciter(r.id); stopAudio(); }}
                className={`rounded-2xl p-3 text-right transition-all ${
                  selectedReciter === r.id
                    ? "text-white shadow-lg"
                    : "bg-white shadow-sm hover:bg-teal-50 text-teal-900"
                }`}
                style={selectedReciter === r.id
                  ? { background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }
                  : {}}
              >
                <div className={`text-xs font-semibold mb-1 ${selectedReciter === r.id ? "text-teal-600" : "text-teal-400"}`}>
                  مجوّد
                </div>
                <div className="text-sm font-bold leading-tight">{r.name}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      {selectedReciter ? (
        <div className="flex gap-3">
          <button
            onClick={handlePlay}
            disabled={loading}
            className="flex-1 py-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
            data-testid="button-play-audio"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : playing ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>{loading ? "جارٍ التحميل..." : playing ? "إيقاف" : "استماع"}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex-1 py-4 rounded-2xl border-2 border-teal-100 bg-white text-teal-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-teal-50 transition-all active:scale-95"
            data-testid="button-download-audio"
          >
            <Download className="w-4 h-4" />
            <span>تحميل</span>
          </button>
        </div>
      ) : (
        <div className="py-4 rounded-2xl bg-white text-teal-600 text-sm text-center shadow-sm">
          اختاري القارئ أولًا
        </div>
      )}

      {/* Mini player */}
      {playing && reciter && currentAyah && (
        <Card className="border border-teal-100 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
              >
                <Volume2 className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-teal-700 truncate">{reciter.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {SURAH_NAMES[currentAyah.surah]} آية {currentAyah.ayah}
                  {repeat > 1 && ` · التكرار ${currentRepeatIdx + 1}/${repeat}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { if (currentAyahIdx > 0) playAyah(currentAyahIdx - 1, 0); }}
                  disabled={currentAyahIdx === 0}
                  className="p-1 rounded-lg hover:bg-teal-50 text-teal-500 disabled:opacity-30"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (currentAyahIdx < ayahs.length - 1) playAyah(currentAyahIdx + 1, 0); }}
                  disabled={currentAyahIdx >= ayahs.length - 1}
                  className="p-1 rounded-lg hover:bg-teal-50 text-teal-500 disabled:opacity-30"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-teal-50 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  background: "linear-gradient(90deg, #7c3aed, #3b82f6)",
                  width: `${((currentAyahIdx * repeat + currentRepeatIdx) / (ayahs.length * repeat)) * 100}%`
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
              <span>الآية {currentAyahIdx + 1} من {ayahs.length}</span>
              <span>التكرار {currentRepeatIdx + 1}/{repeat}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

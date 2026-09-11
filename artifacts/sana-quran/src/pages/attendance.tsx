import { useState } from "react";
import { useGetTodayAttendance, useGetRepeatedAbsences, useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, AlertTriangle, CalendarX, Filter } from "lucide-react";

export default function AttendancePage() {
  const [trackFilter, setTrackFilter] = useState<string>("الكل");

  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const isStudent = currentUser?.role === "student";

  const { data: todayAbsences } = useGetTodayAttendance(undefined, {
    query: { queryKey: ["attendanceToday"] }
  });
  const { data: repeatedAbsences } = useGetRepeatedAbsences(undefined, {
    query: { queryKey: ["attendanceRepeated"] }
  });

  const allTracks = Array.from(new Set([
    ...(todayAbsences?.absentStudents ?? []).map((s: any) => s.track),
    ...(repeatedAbsences ?? []).map((s: any) => s.track),
  ])).filter(Boolean).sort();

  const filteredToday = (todayAbsences?.absentStudents ?? []).filter(
    (s: any) => isStudent || trackFilter === "الكل" || s.track === trackFilter
  );
  const filteredRepeated = (repeatedAbsences ?? []).filter(
    (s: any) => isStudent || trackFilter === "الكل" || s.track === trackFilter
  );

  const openWhatsApp = (phone: string | null | undefined) => {
    if (!phone) return;
    const clean = phone.replace(/[^\d+]/g, "");
    window.open(`https://wa.me/${clean}`, "_blank");
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isStudent ? "غياباتي" : "الغيابات"}</h1>
          <p className="text-muted-foreground text-sm mt-1">{isStudent ? "سجل غياباتك" : "متابعة الغيابات اليومية والمتكررة"}</p>
        </div>
        {!isStudent && allTracks.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex flex-wrap gap-1.5">
              {["الكل", ...allTracks].map(t => (
                <button
                  key={t}
                  onClick={() => setTrackFilter(t)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    trackFilter === t
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Today's absences */}
      <Card className="border-0 shadow-sm" data-testid="card-today-absences">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <CalendarX className="w-4 h-4 text-rose-500" />
            غياب اليوم
            {todayAbsences && (
              <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">{filteredToday.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!todayAbsences || filteredToday.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">لا يوجد غياب مسجل لليوم</p>
          ) : (
            <div className="space-y-3">
              {filteredToday.map((item: any) => (
                <div
                  key={`${item.studentId}-${item.circleId}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-rose-50 border border-rose-100"
                  data-testid={`row-absence-today-${item.studentId}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{item.studentName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.circleName} · {item.track}
                    </p>
                  </div>
                  {!isStudent && item.parentPhone && (
                    <button
                      onClick={() => openWhatsApp(item.parentPhone)}
                      className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex-shrink-0"
                      data-testid={`button-whatsapp-${item.studentId}`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      واتساب
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repeated absences */}
      <Card className="border-0 shadow-sm" data-testid="card-repeated-absences">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            الغياب المتكرر (3+ مرات)
            {repeatedAbsences && (
              <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{filteredRepeated.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRepeated.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">لا يوجد غياب متكرر</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/50 border-b border-amber-100">
                  <tr>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الطالبة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الحلقة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">المسار</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">عدد الغيابات</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">التواصل</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRepeated.map((item: any) => (
                    <tr key={`${item.studentId}-${item.circleId}`}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      data-testid={`row-absence-repeated-${item.studentId}`}
                    >
                      <td className="py-2.5 px-3 font-semibold">{item.studentName}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">{item.circleName}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">{item.track}</td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-xs border-0 ${item.absenceCount >= 5 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                          {item.absenceCount} مرات
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        {!isStudent && item.parentPhone && (
                          <button
                            onClick={() => openWhatsApp(item.parentPhone)}
                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
                            data-testid={`button-whatsapp-repeated-${item.studentId}`}
                          >
                            <MessageCircle className="w-3 h-3" />
                            واتساب
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

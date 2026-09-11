import { useGetMyMessages } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Clock, Inbox } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function MyMessagesPage() {
  const { data: messages, isLoading } = useGetMyMessages({ query: { queryKey: ["myMessages"] } });

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" />
          رسائلي
        </h1>
        <p className="text-muted-foreground text-sm mt-1">رسائل القائدة الموجهة إليكِ</p>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm">جاري التحميل...</div>
      )}

      {!isLoading && (!messages || messages.length === 0) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">لا توجد رسائل حاليًا</p>
            <p className="text-xs text-muted-foreground/70">ستظهر هنا رسائل القائدة عند إرسالها</p>
          </CardContent>
        </Card>
      )}

      {messages && messages.length > 0 && (
        <div className="space-y-3">
          {messages.map(msg => (
            <Card key={msg.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                  {msg.expiresAt && (
                    <span className="text-xs text-amber-600 flex items-center gap-1 mr-auto">
                      <Clock className="w-3 h-3" />
                      صالحة حتى {formatDate(msg.expiresAt)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

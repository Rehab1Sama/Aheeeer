import { useGetMyMessages } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
}

export default function MessagesSection() {
  const { data: messages, isLoading } = useGetMyMessages({ query: { queryKey: ["myMessages"] } });

  if (isLoading) return null;
  if (!messages || messages.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          رسائل القائدة
          <Badge className="bg-primary text-primary-foreground text-xs mr-auto">
            {messages.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {messages.map(msg => (
          <div key={msg.id} className="bg-white/80 rounded-xl px-3.5 py-3 shadow-sm border border-primary/10">
            <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
              {msg.expiresAt && (
                <span className="text-xs text-amber-600 flex items-center gap-1 mr-auto">
                  <Clock className="w-3 h-3" />
                  تنتهي {formatDate(msg.expiresAt)}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

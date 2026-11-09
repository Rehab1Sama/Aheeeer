// صفحة رسائل واحدة لمن ترسل وتستقبل معًا (مسؤولة المسار): تبويب «الواردة» وتبويب «إرسال».
import { useState } from "react";
import MessagesPage from "@/pages/messages";
import MyMessagesPage from "@/pages/my-messages";
import { Inbox, Send } from "lucide-react";

export default function MessagesHub({ initialTab = "inbox" }: { initialTab?: "inbox" | "send" }) {
  const [tab, setTab] = useState<"inbox" | "send">(initialTab);
  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex gap-2 max-w-4xl mx-auto">
        {([["inbox", "الواردة", Inbox], ["send", "إرسال رسالة", Send]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold border ${tab === key ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>
      {tab === "inbox" ? <MyMessagesPage /> : <MessagesPage />}
    </div>
  );
}

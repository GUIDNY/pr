import { MessageCircle } from "lucide-react";
import { getChatbotSettings } from "@/lib/queries/chatbot-settings";
import { ChatbotSettingsForm } from "@/components/admin/chatbot-settings-form";

export const metadata = { title: "אלפרד - צ'אט בוט | A&I Electronics Admin" };

export default async function AdminChatbotPage() {
  const settings = await getChatbotSettings();

  return (
    <div>
      <div className="mb-1 flex items-center gap-2.5">
        <MessageCircle className="text-brand size-6" />
        <h1 className="text-2xl font-bold">אלפרד — צ&apos;אט בוט שירות לקוחות</h1>
      </div>
      <p className="text-muted-foreground mb-6 text-sm">
        הנתונים כאן משפיעים ישירות על מה שאלפרד עונה ללקוחות בצ&apos;אט באתר — עדכון כאן חוסך דיפלוי קוד בכל פעם ששעות
        השירות או מדיניות המשלוח משתנות.
      </p>
      <ChatbotSettingsForm initial={settings} />
    </div>
  );
}

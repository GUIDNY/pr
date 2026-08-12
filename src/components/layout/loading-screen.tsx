import { Refrigerator } from "lucide-react";

export function LoadingScreen({ label = "רק רגע, טוענים בשבילכם..." }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 py-20">
      <div className="flex flex-col items-center">
        <Refrigerator className="text-brand animate-appliance-dance size-16" strokeWidth={1.5} />
        <div className="bg-foreground/40 mt-1 h-2 w-10 animate-appliance-shadow rounded-full blur-[2px]" />
      </div>
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
    </div>
  );
}

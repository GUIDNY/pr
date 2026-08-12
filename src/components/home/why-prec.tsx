import { ShieldCheck, Truck, Headset, Tags, type LucideIcon } from "lucide-react";

const ICONS: LucideIcon[] = [Truck, ShieldCheck, Headset, Tags];

export function WhyPrec({ title, items }: { title: string; items: { title: string; body: string }[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <h2 className="mb-6 text-xl font-bold sm:text-2xl">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div key={item.title} className="border-border bg-card rounded-xl border p-5">
              <span className="bg-brand/10 text-brand mb-3 flex size-11 items-center justify-center rounded-full">
                <Icon className="size-5" strokeWidth={1.5} />
              </span>
              <p className="font-semibold">{item.title}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{item.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

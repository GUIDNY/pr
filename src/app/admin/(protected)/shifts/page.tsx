import Link from "next/link";
import { requireCatalogPage } from "@/lib/auth";
import { shiftsForWeek, getSettings } from "@/lib/shifts/data";
import { ShiftsBoard } from "@/components/admin/shifts-board";
import { addDays, israelToday, isValidDate, shortDate, weekDates, weekStart, weekText } from "@/lib/shifts/week";

export const metadata = { title: "משמרות הזמנות | Buy Today Admin" };
export const dynamic = "force-dynamic";

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireCatalogPage();
  const { week } = await searchParams;
  const start = weekStart(week && isValidDate(week) ? week : israelToday());
  const [shifts, settings] = await Promise.all([shiftsForWeek(start), getSettings()]);
  const prev = addDays(start, -7);
  const next = addDays(start, 7);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-bold">משמרות הזמנות</h1>
      <div className="flex items-center justify-between text-sm">
        <Link href={`/admin/shifts?week=${prev}`} className="underline">
          → שבוע קודם
        </Link>
        <span className="font-semibold">
          {shortDate(start)}–{shortDate(addDays(start, 6))}
        </span>
        <Link href={`/admin/shifts?week=${next}`} className="underline">
          שבוע הבא ←
        </Link>
      </div>
      <ShiftsBoard
        key={start}
        dates={weekDates(start)}
        initial={shifts}
        waText={weekText(start, shifts)}
        phones={{ idan: settings.phone_idan ?? "", asaf: settings.phone_asaf ?? "" }}
      />
    </div>
  );
}

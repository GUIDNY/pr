import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { DepartmentTile } from "@/lib/queries/categories";

/**
 * The whole shop, on one screen, with its real sizes.
 *
 * Baymard's homepage research is direct about why this exists: shoppers who
 * meet a narrow slice of a catalogue on a homepage misjudge what kind of
 * shop it is and underestimate its range, and the correction is breadth —
 * show a wide spread of what is actually sold rather than a curated handful.
 * The page this replaced showed a strip of category names and eleven photo
 * tiles, and from those a first-time visitor could not tell whether this
 * shop sells fridges or kettles.
 *
 * So every department is here, each with the number of products behind it
 * and the three sub-categories it is largest in. The counts are read live
 * on each request, which is what makes them worth printing: a department
 * cannot advertise stock it does not have, and one that empties disappears
 * instead of linking to a blank page.
 *
 * Ordered by size rather than by the merchandising sort, because the
 * question this block answers is "how big is this shop, and in what" — and
 * an ordering that hides the 341-product department below a 13-product one
 * answers it wrongly.
 */
export function DepartmentBoard({ departments, total }: { departments: DepartmentTile[]; total: number }) {
  if (departments.length === 0) return null;

  return (
    <section id="departments" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">כל המחלקות</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="font-semibold tabular-nums">{total.toLocaleString("he-IL")}</span> מוצרים
            במלאי עכשיו. המספרים מתעדכנים מהמלאי עצמו.
          </p>
        </div>
        <Link href="/brands" className="text-brand text-sm font-semibold hover:underline">
          לפי מותג
          <ArrowLeft className="mr-1 inline size-3.5" />
        </Link>
      </div>

      {/* One-pixel gaps over a bordered container: the departments read as
          one object with divisions rather than as a dozen floating cards,
          which is what a directory is. */}
      <div className="border-border bg-border grid grid-cols-1 gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => (
          <Link
            key={dept.slug}
            href={`/category/${dept.slug}`}
            className="bg-card hover:bg-brand/5 group flex flex-col gap-1.5 p-4 transition-colors sm:p-5"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="group-hover:text-brand text-base font-bold transition-colors sm:text-lg">
                {dept.name}
              </span>
              <span className="text-muted-foreground group-hover:text-brand shrink-0 text-sm font-bold tabular-nums transition-colors">
                {dept.count.toLocaleString("he-IL")}
              </span>
            </span>
            {dept.leaves.length > 0 && (
              <span className="text-muted-foreground line-clamp-1 text-xs leading-relaxed">
                {dept.leaves.join(" · ")}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

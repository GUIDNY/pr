"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Phone, MapPin, Tag, Truck, User, Heart } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { NavigableDepartment } from "@/lib/queries/categories";
import { BackOfficeLink } from "@/components/layout/back-office-link";

export function MobileNav({ departments }: { departments: NavigableDepartment[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="פתח תפריט"
          className="hover:bg-muted flex size-10 shrink-0 items-center justify-center rounded-full lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>תפריט</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <Accordion type="single" collapsible className="px-2">
            {departments.map((dept) => (
              <AccordionItem key={dept.slug} value={dept.slug}>
                <AccordionTrigger className="px-3 text-sm font-medium">{dept.name}</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-1 px-3">
                  <Link
                    href={`/category/${dept.slug}`}
                    onClick={() => setOpen(false)}
                    className="text-brand py-1.5 text-sm font-medium"
                  >
                    כל המוצרים ב{dept.name}
                  </Link>
                  {dept.children.map((child) => (
                    <Link
                      key={child.slug}
                      href={`/category/${child.slug}`}
                      onClick={() => setOpen(false)}
                      className="text-muted-foreground hover:text-foreground py-1.5 text-sm"
                    >
                      {child.name}
                    </Link>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="border-t px-5 py-4">
            {/* On a phone the top utility bar is hidden entirely, so without
                this a salesperson on their phone has no way in at all — and a
                phone is where an order actually gets handled. */}
            <div onClick={() => setOpen(false)} className="mb-3 empty:mb-0">
              <BackOfficeLink />
            </div>
            <ul className="flex flex-col gap-3 text-sm">
              {/* The phone header is one row with no room for these two
                  icons, so the drawer carries them. */}
              <li>
                <Link href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2">
                  <User className="size-4" /> החשבון שלי
                </Link>
              </li>
              <li>
                <Link href="/account/favorites" onClick={() => setOpen(false)} className="flex items-center gap-2">
                  <Heart className="size-4" /> מועדפים
                </Link>
              </li>
              <li>
                <Link href="/deals" onClick={() => setOpen(false)} className="flex items-center gap-2">
                  <Tag className="text-brand size-4" /> מבצעים
                </Link>
              </li>
              <li>
                <Link href="/track-order" onClick={() => setOpen(false)} className="flex items-center gap-2">
                  <Truck className="size-4" /> מעקב הזמנה
                </Link>
              </li>
              <li>
                <Link href="/page/branches" onClick={() => setOpen(false)} className="flex items-center gap-2">
                  <MapPin className="size-4" /> סניפים
                </Link>
              </li>
              <li>
                <a href="tel:04-6639510" className="flex items-center gap-2">
                  <Phone className="size-4" /> 04-6639510
                </a>
              </li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

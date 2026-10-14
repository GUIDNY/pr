"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { suggestLocalities } from "@/lib/delivery-zones";

/**
 * The city field, completing from the state's localities register.
 *
 * A plain text box took "נתניה", "נתניה " and "נתנייה" as three cities and
 * handed the carrier whichever one the shopper typed. This offers the
 * register's spelling as the shopper types and keeps whatever they settle
 * on — the list is a help, not a gate, because a place the register spells
 * differently from its residents is still a place a parcel goes.
 *
 * Hand-rolled rather than a library: the checkout already loads enough, and
 * a listbox under an input is forty lines. Keyboard: arrows move, Enter
 * picks, Escape closes; the input keeps focus throughout so a shopper on
 * a phone is never bounced between keyboard and list.
 */
export function CityCombobox({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (city: string) => void;
  invalid?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const options = open ? suggestLocalities(value) : [];
  const listed = options.length > 0;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (city: string) => {
    onChange(city);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div ref={wrap} className="relative">
      <Input
        role="combobox"
        aria-expanded={listed}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!listed) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {listed && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="border-border bg-popover text-popover-foreground absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border py-1 text-sm shadow-md"
        >
          {options.map((city, i) => (
            <li
              key={city}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              /* pointerdown, not click: a click fires after blur, and the
                 blur would have closed the list before the pick landed. */
              onPointerDown={(e) => {
                e.preventDefault();
                pick(city);
              }}
              onPointerEnter={() => setActive(i)}
              className={cn("cursor-pointer px-3 py-1.5", i === active && "bg-accent text-accent-foreground")}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

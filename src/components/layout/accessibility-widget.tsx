"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Accessibility,
  ALargeSmall,
  Ban,
  Contrast,
  Highlighter,
  Link2,
  Minus,
  Moon,
  MousePointer2,
  Palette,
  Plus,
  RotateCcw,
  Ruler,
  ScanEye,
  Sparkles,
  SquareMenu,
  Type,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* The accessibility menu required by תקנות שוויון זכויות לאנשים עם מוגבלות
   (התאמות נגישות לשירות), תשע"ג-2013, which adopt ת"י 5568 (WCAG 2.0 AA) for
   websites. The regulations expect the adjustments to be reachable from every
   page, operable by keyboard alone, and announced to screen readers — hence the
   fixed launcher, the Alt+1 shortcut, the focus trap and the aria wiring below.

   Everything the menu changes is expressed as a class or a custom property on
   <html>; the CSS lives next to the rest of the design tokens in globals.css so
   the two can't drift apart. Nothing here is sent to the server: the preference
   object is written to localStorage on the visitor's own device only, which is
   what the privacy notice at the foot of the panel promises. */

export const A11Y_STORAGE_KEY = "prec-a11y";

type ColorMode = "none" | "contrast" | "dark" | "invert" | "grayscale";

type A11ySettings = {
  fontScale: number;
  colorMode: ColorMode;
  readableFont: boolean;
  spacing: boolean;
  highlightLinks: boolean;
  highlightTitles: boolean;
  bigCursor: boolean;
  stopAnimations: boolean;
  focusHighlight: boolean;
  readingGuide: boolean;
};

const DEFAULTS: A11ySettings = {
  fontScale: 1,
  colorMode: "none",
  readableFont: false,
  spacing: false,
  highlightLinks: false,
  highlightTitles: false,
  bigCursor: false,
  stopAnimations: false,
  focusHighlight: false,
  readingGuide: false,
};

const MIN_SCALE = 1;
const MAX_SCALE = 1.6;
const SCALE_STEP = 0.1;

const COLOR_MODES: { value: ColorMode; label: string; icon: typeof Contrast }[] = [
  { value: "contrast", label: "ניגודיות גבוהה", icon: Contrast },
  { value: "dark", label: "מצב כהה", icon: Moon },
  { value: "invert", label: "היפוך צבעים", icon: Palette },
  { value: "grayscale", label: "גווני אפור", icon: ScanEye },
];

/* Runs both here and, verbatim in string form, in the blocking <head> script in
   the root layout — a visitor who chose high contrast must not be shown a flash
   of the default palette on every navigation. Keep the two in step. */
function applySettings(s: A11ySettings) {
  const root = document.documentElement;
  root.style.setProperty("--a11y-font-scale", String(s.fontScale));
  root.classList.toggle("a11y-contrast", s.colorMode === "contrast");
  root.classList.toggle("dark", s.colorMode === "dark");
  root.classList.toggle("a11y-invert", s.colorMode === "invert");
  root.classList.toggle("a11y-grayscale", s.colorMode === "grayscale");
  root.classList.toggle("a11y-readable-font", s.readableFont);
  root.classList.toggle("a11y-spacing", s.spacing);
  root.classList.toggle("a11y-links", s.highlightLinks);
  root.classList.toggle("a11y-titles", s.highlightTitles);
  root.classList.toggle("a11y-big-cursor", s.bigCursor);
  root.classList.toggle("a11y-no-motion", s.stopAnimations);
  root.classList.toggle("a11y-focus", s.focusHighlight);
}

/* The stored preferences are an external store, not React state: they are read
   from localStorage, they are already applied to the DOM by the boot script
   before React exists, and the server has no way of knowing them. Going through
   useSyncExternalStore is what lets the server render the defaults and the
   client swap in the visitor's real choices without a hydration mismatch. */
let snapshot: A11ySettings | null = null;
const listeners = new Set<() => void>();

function readSettings(): A11ySettings {
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<A11ySettings>) };
  } catch {
    // A browser in private mode, or a corrupt value someone hand-edited.
    return DEFAULTS;
  }
}

function getSnapshot(): A11ySettings {
  // Cached, because useSyncExternalStore compares snapshots by reference and a
  // fresh object on every read would loop forever.
  snapshot ??= readSettings();
  return snapshot;
}

function getServerSnapshot(): A11ySettings {
  return DEFAULTS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeSettings(next: A11ySettings) {
  snapshot = next;
  applySettings(next);
  try {
    if (next === DEFAULTS) window.localStorage.removeItem(A11Y_STORAGE_KEY);
    else window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage refused the write; the choice still holds for this visit.
  }
  listeners.forEach((listener) => listener());
}

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [guideY, setGuideY] = useState(0);
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // The boot script in <head> has already put these classes on <html>, so in
  // production this is a no-op. It earns its place in development, where Strict
  // Mode's remount strips every attribute React doesn't own off <html> and the
  // visitor's high-contrast mode would silently disappear.
  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<A11ySettings>) => {
    writeSettings({ ...getSnapshot(), ...patch });
  }, []);

  const reset = useCallback(() => writeSettings(DEFAULTS), []);

  // Alt+1 opens and closes the menu — the shortcut Israeli accessibility
  // statements conventionally publish, and the one screen-reader users look for.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.key === "1") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus goes into the panel on open and back to the launcher on close, and
  // Tab cycles inside the panel while it is open.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>("button, [href]");
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) return;
    // Only pull focus back when the panel itself had it, so an Escape pressed
    // elsewhere on the page doesn't yank the caret to the launcher.
    if (panelRef.current?.contains(document.activeElement)) launcherRef.current?.focus();
  }, [open]);

  // Reading ruler: a band that follows the pointer so a line of text can be
  // tracked without losing it — pointer events cover mouse, pen and touch.
  useEffect(() => {
    if (!settings.readingGuide) return;
    function onMove(e: PointerEvent) {
      setGuideY(e.clientY);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [settings.readingGuide]);

  const scalePercent = Math.round(settings.fontScale * 100);

  return (
    <>
      {settings.readingGuide && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 z-[60] h-9 border-y-2 border-amber-400 bg-amber-300/25"
          style={{ top: guideY - 18 }}
        />
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="תפריט נגישות (Alt+1)"
        title="תפריט נגישות (Alt+1)"
        className={cn(
          // On a phone the launcher tucks under Alfred in the same corner
          // (start = right in RTL) at 44px — the smallest a touch target may
          // be without failing WCAG 2.5.8. Alfred sits at bottom-24, so
          // bottom-5 leaves clear air between the two. From lg: up it keeps
          // the corner opposite Alfred, where there is room for both.
          "border-border bg-background text-foreground fixed bottom-5 start-4 z-50 flex size-11 items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-105 lg:bottom-6 lg:size-14 lg:start-auto lg:end-4",
          open && "scale-0 opacity-0"
        )}
      >
        <Accessibility className="text-brand size-6 lg:size-7" aria-hidden="true" />
      </button>

      <div
        ref={panelRef}
        id="a11y-panel"
        role="dialog"
        aria-modal="false"
        aria-label="תפריט נגישות"
        hidden={!open}
        className="border-border bg-background fixed bottom-5 start-4 z-50 flex max-h-[min(34rem,72vh)] w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl lg:bottom-6 lg:start-auto lg:end-4"
      >
        <div className="bg-primary text-primary-foreground flex items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <Accessibility className="size-5" aria-hidden="true" />
            תפריט נגישות
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="סגירת תפריט הנגישות"
            className="hover:bg-primary-foreground/15 rounded-md p-1"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">
          <section aria-labelledby="a11y-text-size">
            <h3 id="a11y-text-size" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <ALargeSmall className="size-4" aria-hidden="true" /> גודל טקסט
            </h3>
            <div className="border-border flex items-center justify-between rounded-lg border p-1.5">
              <button
                type="button"
                onClick={() => update({ fontScale: Math.max(MIN_SCALE, +(settings.fontScale - SCALE_STEP).toFixed(2)) })}
                disabled={settings.fontScale <= MIN_SCALE}
                aria-label="הקטנת הטקסט"
                className="hover:bg-muted flex size-9 items-center justify-center rounded-md disabled:opacity-40"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <span aria-live="polite" className="text-sm font-medium">
                {scalePercent}%
              </span>
              <button
                type="button"
                onClick={() => update({ fontScale: Math.min(MAX_SCALE, +(settings.fontScale + SCALE_STEP).toFixed(2)) })}
                disabled={settings.fontScale >= MAX_SCALE}
                aria-label="הגדלת הטקסט"
                className="hover:bg-muted flex size-9 items-center justify-center rounded-md disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section aria-labelledby="a11y-colors">
            <h3 id="a11y-colors" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Palette className="size-4" aria-hidden="true" /> צבע וניגודיות
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {COLOR_MODES.map(({ value, label, icon: Icon }) => {
                const active = settings.colorMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ colorMode: active ? "none" : value })}
                    className={cn(
                      "border-border flex items-center gap-1.5 rounded-lg border p-2 text-start text-xs font-medium",
                      active ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="a11y-reading">
            <h3 id="a11y-reading" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Type className="size-4" aria-hidden="true" /> קריאות וניווט
            </h3>
            <div className="flex flex-col gap-2">
              <ToggleRow
                icon={SquareMenu}
                label="גופן קריא"
                pressed={settings.readableFont}
                onToggle={() => update({ readableFont: !settings.readableFont })}
              />
              <ToggleRow
                icon={Type}
                label="ריווח שורות ואותיות"
                pressed={settings.spacing}
                onToggle={() => update({ spacing: !settings.spacing })}
              />
              <ToggleRow
                icon={Link2}
                label="הדגשת קישורים"
                pressed={settings.highlightLinks}
                onToggle={() => update({ highlightLinks: !settings.highlightLinks })}
              />
              <ToggleRow
                icon={Highlighter}
                label="הדגשת כותרות"
                pressed={settings.highlightTitles}
                onToggle={() => update({ highlightTitles: !settings.highlightTitles })}
              />
              <ToggleRow
                icon={Ruler}
                label="סרגל קריאה"
                pressed={settings.readingGuide}
                onToggle={() => update({ readingGuide: !settings.readingGuide })}
              />
              <ToggleRow
                icon={MousePointer2}
                label="סמן עכבר גדול"
                pressed={settings.bigCursor}
                onToggle={() => update({ bigCursor: !settings.bigCursor })}
              />
              <ToggleRow
                icon={Ban}
                label="עצירת אנימציות"
                pressed={settings.stopAnimations}
                onToggle={() => update({ stopAnimations: !settings.stopAnimations })}
              />
              <ToggleRow
                icon={Sparkles}
                label="הדגשת מוקד המקלדת"
                pressed={settings.focusHighlight}
                onToggle={() => update({ focusHighlight: !settings.focusHighlight })}
              />
            </div>
          </section>

          <button
            type="button"
            onClick={reset}
            className="border-border hover:bg-muted flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-sm font-medium"
          >
            <RotateCcw className="size-4" aria-hidden="true" /> איפוס כל ההתאמות
          </button>

          <div className="text-muted-foreground flex flex-col gap-1.5 text-xs leading-relaxed">
            <p>
              ההתאמות נשמרות בדפדפן שלך בלבד (אחסון מקומי), אינן נשלחות לשרתי האתר, אינן מזהות אותך ואינן משמשות
              לפרסום. מחיקת נתוני הגלישה או לחיצה על &quot;איפוס&quot; מוחקת אותן.
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              <Link href="/accessibility" className="text-brand underline underline-offset-2" onClick={() => setOpen(false)}>
                הצהרת נגישות
              </Link>
              <Link href="/privacy" className="text-brand underline underline-offset-2" onClick={() => setOpen(false)}>
                מדיניות פרטיות
              </Link>
              <a href="tel:04-6639510" className="text-brand underline underline-offset-2">
                רכז נגישות: 04-6639510
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  pressed,
  onToggle,
}: {
  icon: typeof Contrast;
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "border-border flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        pressed ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full px-2 py-0.5 text-[0.7rem]",
          pressed ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {pressed ? "פעיל" : "כבוי"}
      </span>
    </button>
  );
}

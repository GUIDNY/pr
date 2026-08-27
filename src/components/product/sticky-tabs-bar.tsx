"use client";

import { useEffect, useState } from "react";

// Measures the real site header at runtime instead of hardcoding a top
// offset — the header's height already varies (the top announcement strip
// is hidden below md:), so a fixed pixel guess would either leave a gap or,
// worse, let the tabs slide under the header on some breakpoint. Reading
// the header's actual rendered height keeps this correct automatically
// without touching the header itself.
export function StickyTabsBar({ children }: { children: React.ReactNode }) {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;

    function update() {
      setTop(header!.getBoundingClientRect().height);
    }
    update();

    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Not sticky until the header's height is known — stickying at the wrong
  // offset for one frame would flash the tabs under the header.
  return (
    <div className="bg-background sticky z-20" style={top === null ? undefined : { position: "sticky", top }}>
      {children}
    </div>
  );
}

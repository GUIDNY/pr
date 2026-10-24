// Clarity has been installed since the beginning and has recorded nothing.
//
// Zero sessions in thirty days, and the reason was one missing object. The
// file at clarity.ms/tag/{id} is not the recorder — it is a 726-byte
// bootstrap, and its third statement reads `a[c].v||a[c].t` where `a[c]` is
// window.clarity. This codebase loaded that file on its own, having decided
// the stub was redundant, so every page load threw
// `Cannot read properties of undefined (reading 'v')` and stopped three
// statements before the one that appends scripts.clarity.ms/…/clarity.js.
//
// Nothing could have caught that from the outside. The tag answers 200, the
// script tag is in the DOM, and the dashboard's empty session list looks
// exactly like a shop nobody visited.
//
// So this runs Microsoft's own tag source — the real bytes, below — against
// our stub, and against its absence. The second half matters as much as the
// first: it is the assertion that the stub is load-bearing rather than
// decorative, and it fails the moment somebody concludes again that the tag
// can stand alone.
//
// Run: npx tsx scripts/check-clarity.ts
import { readFileSync } from "node:fs";
import { installClarity, type ClarityHost } from "../src/lib/analytics/clarity";

/* Fetched from https://www.clarity.ms/tag/ye4n6ogwec on 24 October 2026,
   verbatim, all 726 bytes of it. Microsoft can change it; if this fixture
   and the live file ever disagree about what they need from us, the live
   file is right — re-fetch with curl and paste it back in. */
const TAG_SOURCE = `!function(c,l,a,r,i,t,y){function sync(){(new Image).src="https://c.clarity.ms/c.gif"}"complete"==document.readyState?sync():window.addEventListener("load",sync);a[c].v||a[c].t||a[c]("metadata",(function(){a[c]("set", "C_IS", "0");}),!1,!0);if(a[c].v||a[c].t)return a[c]("event",c,"dup."+i.projectId);a[c].t=!0,(t=l.createElement(r)).async=!0,t.src="https://scripts.clarity.ms/0.8.72/clarity.js",(y=l.getElementsByTagName(r)[0]).parentNode.insertBefore(t,y),a[c]("start",i),a[c].q.unshift(a[c].q.pop()),a[c]("set","C_IS","0")}("clarity",document,window,"script",{"projectId":"ye4n6ogwec","upload":"https://t.clarity.ms/collect","expire":365,"cookies":["_uetmsclkid","_uetvid","_clck"],"track":true,"content":true,"dob":2487});`;

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

type Inserted = { async?: boolean; src?: string };

/**
 * Run the tag the way a browser would, with just enough DOM for it: it
 * reads document.readyState, listens for load, creates a script element and
 * inserts it before the first one, and requests a tracking pixel through
 * `new Image`.
 */
function runTag(withStub: boolean) {
  const inserted: Inserted[] = [];
  const images: string[] = [];
  const firstScript = { parentNode: { insertBefore: (node: Inserted) => void inserted.push(node) } };
  const document = {
    readyState: "complete",
    createElement: (): Inserted => ({}),
    getElementsByTagName: () => [firstScript],
  };
  const window: ClarityHost & { addEventListener: (type: string, fn: () => void) => void } = {
    addEventListener: () => {},
  };
  class Image {
    set src(value: string) {
      images.push(value);
    }
  }
  if (withStub) installClarity(window);

  let threw: Error | null = null;
  try {
    new Function("window", "document", "Image", TAG_SOURCE)(window, document, Image);
  } catch (error) {
    threw = error instanceof Error ? error : new Error(String(error));
  }
  return { threw, inserted, images, window };
}

/* 1. Without the stub: the production bug, reproduced. If this ever stops
      throwing, Microsoft has changed the contract and the comments in
      lib/analytics/clarity.ts are describing a world that no longer
      exists — but so is the conclusion that the stub is optional. */
const bare = runTag(false);
if (!bare.threw) {
  fail("the tag no longer needs window.clarity to exist — re-read it before trusting this");
} else if (!/reading '?v'?/.test(bare.threw.message)) {
  fail(`the tag failed without the stub, but not on \`.v\`: ${bare.threw.message}`);
}
if (bare.inserted.length > 0) fail("the tag appended the recorder without a stub — the premise of this file is wrong");

/* 2. With it: the recorder is actually fetched. This is the line the live
      site never reached. */
const real = runTag(true);
if (real.threw) fail(`the tag threw with the stub installed: ${real.threw.message}`);

const recorder = real.inserted.find((node) => node.src?.includes("clarity.ms"));
if (!recorder) {
  fail("the tag did not append the recorder — nothing would ever be recorded");
} else {
  if (!/^https:\/\/scripts\.clarity\.ms\/[\d.]+\/clarity\.js$/.test(recorder.src ?? "")) {
    fail(`the recorder's src is not the engine: ${recorder.src}`);
  }
  if (recorder.async !== true) fail("the recorder was appended synchronously — it must not block the page");
}

/* 3. The cookie-sync pixel, which is the other request the network panel
      shows on a working install. */
if (!real.images.some((src) => src.startsWith("https://c.clarity.ms/c.gif"))) {
  fail("the tag did not request c.clarity.ms/c.gif — the cookie sync never ran");
}

/* 4. The queue, in the shape the engine drains:
        var t = window.clarity.q || [];
        … window.clarity.apply(window, t.shift());
      Array-like entries, and the tag's own `q.unshift(q.pop())` must have
      been able to reorder them — that line is why `.q` is created eagerly
      rather than on first call. */
const queue = real.window.clarity?.q ?? [];
if (queue.length < 3) {
  fail(`the stub queued ${queue.length} calls; the tag makes three (metadata, start, set)`);
}
for (const [index, entry] of queue.entries()) {
  if (!Array.isArray(entry) && !(typeof entry === "object" && entry !== null && "length" in entry)) {
    fail(`queued call ${index} is not array-like, so .apply would reject it`);
  }
}
const first = queue[0] as unknown[] | undefined;
if (first?.[0] !== "start") {
  fail(`the queue's first call is ${JSON.stringify(first?.[0])}, not "start" — the tag's unshift did not take`);
}
if (real.window.clarity?.t !== true) {
  fail("the tag could not mark itself as run (.t), so a second copy would load a second recorder");
}

/* 5. The component still installs the stub before the tag, and still loads
      the tag by src. An inline <script> here would be the other old bug:
      this component mounts on consent, long after parse, and a script
      element React creates then does not reliably execute. */
const component = readFileSync("src/components/analytics/clarity.tsx", "utf8");
if (!component.includes("installClarity(window)")) {
  fail("clarity.tsx does not install the stub — the tag will throw on `.v` again");
}
if (component.indexOf("installClarity(window)") > component.indexOf("<Script")) {
  fail("clarity.tsx installs the stub after rendering the tag — the tag can execute first");
}
if (/<Script[^>]*>\s*\{`/.test(component)) {
  fail("clarity.tsx inlines the snippet; a script React inserts after hydration does not reliably run");
}

/* 6. The throwaway project opened while diagnosing this. Its id must never
      reach the code — sessions sent there are sessions nobody reads. */
if (component.includes("z2ggmbo3mo") || readFileSync("src/lib/analytics/clarity.ts", "utf8").includes("z2ggmbo3mo")) {
  fail("the scratch project id z2ggmbo3mo is in the code");
}

const total = 12;
console.log(
  `${total - failed}/${total} passed  (the real tag run with the stub and without it, ` +
    `the recorder fetched, the cookie sync, the queue's shape and order, the component's wiring)`,
);
process.exit(failed === 0 ? 0 : 1);

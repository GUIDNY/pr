const URLS = [
  "https://www.prec.co.il/images/itempics/B6230_05122023142327.jpg",
  "https://www.prec.co.il/images/itempics/BB1209NX_1503202614595415197.jpg",
];
const headers = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 BuyTodayBot/1.0 (+https://buytoday.co.il)",
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "accept-language": "he-IL,he;q=0.9,en;q=0.8",
  referer: "https://www.prec.co.il/",
};
for (const u of URLS) {
  try {
    const r = await fetch(u, { headers });
    console.log("node fetch + browser headers:", r.status, r.headers.get("content-type") ?? "", r.headers.get("server") ?? "");
  } catch (e) { console.log("node fetch FAILED:", e.message); }
  await new Promise(r => setTimeout(r, 1500));
}
// And with no extra headers at all, the way the first version did it.
try {
  const r = await fetch(URLS[0]);
  console.log("node fetch bare:", r.status);
} catch (e) { console.log("bare FAILED:", e.message); }

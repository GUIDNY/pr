/**
 * Asking a host whether it wants us fetching its images.
 *
 * The migration was not asking. It sent a browser-shaped request with our
 * own token in the user-agent — BuyTodayBot, with a URL that says who to
 * complain to — and then ignored the file that exists for exactly that
 * conversation. A bot that names itself and disregards robots.txt is worse
 * than an anonymous one: it is identifiable and it is choosing.
 *
 * It cost almost nothing to fix. Of the twenty-two largest image hosts in
 * this catalogue, one disallows everything (Electrolux's media library) and
 * one disallows the path our file sits on (Monitor Audio's /site/assets/).
 * The rest are open or forbid /admin and /cart. So respecting the file
 * stops us at two hosts, and those two are the ones that need a sanctioned
 * download rather than a crawler anyway.
 *
 * WHAT AN UNANSWERED REQUEST MEANS. A 404 or a 403 is "there are no rules
 * here", and we proceed — silence is not refusal. A 5xx, a 429, a timeout
 * or a dropped connection is NOT silence, and RFC 9309 says a fetcher must
 * then assume a complete disallow; Google treats timeouts, DNS failures and
 * severed connections as 5xx for exactly this purpose.
 *
 * That distinction is operational before it is legal, and it is the one
 * this file originally got wrong. Hosts do not answer robots.txt with a
 * tidy 404 — they get slow under load. Treating a timeout as permission
 * means the moment a host starts struggling under our requests, the cron
 * leans on it harder. That is the sequence that ends in a blocked address.
 *
 * Google holds a full stop for 12 hours, then falls back to the last good
 * copy for 30 days. There is nowhere to keep a 30-day copy here — a cron
 * invocation is a fresh process — so this keeps the conservative half: a
 * host we could not read is left alone for the rest of the run, and asked
 * again next time. One robots.txt request per host per run either way.
 *
 * A deliberately small parser. Groups, the most specific matching agent,
 * longest-match wins, Allow beats Disallow at equal length, `*` and `$`.
 * That is the part of RFC 9309 real files use; anything exotic resolves to
 * "allowed", which is the safe direction for a fetch we would otherwise
 * have made unconditionally.
 */

/** The token we answer to. Matched case-insensitively against a group's
    user-agent, so `buytodaybot` in someone's file finds us. */
export const OUR_AGENT_TOKEN = "buytodaybot";

type Rule = { allow: boolean; path: string };
type Groups = Map<string, Rule[]>;

export function parseRobotsTxt(text: string): Groups {
  const groups: Groups = new Map();
  let current: string[] = [];
  /* Consecutive user-agent lines share one set of rules; the first rule
     line after them closes the header and starts a new group on the next
     user-agent. */
  let expectingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const agent = /^user-agents?\s*:\s*(.*)$/i.exec(line);
    if (agent) {
      if (!expectingAgents) current = [];
      current.push(agent[1].trim().toLowerCase());
      expectingAgents = true;
      continue;
    }

    const rule = /^(allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!rule || current.length === 0) continue;
    expectingAgents = false;

    const allow = rule[1].toLowerCase() === "allow";
    const path = rule[2].trim();
    // "Disallow:" with nothing after it means no restriction at all.
    if (!allow && path === "") continue;
    if (path === "") continue;

    for (const a of current) {
      const list = groups.get(a) ?? [];
      list.push({ allow, path });
      groups.set(a, list);
    }
  }
  return groups;
}

/** The group that applies to us: our own token if the file names it,
    otherwise the wildcard, otherwise no rules at all. */
function rulesFor(groups: Groups): Rule[] {
  for (const [agent, rules] of groups) {
    if (agent !== "*" && OUR_AGENT_TOKEN.includes(agent)) return rules;
  }
  return groups.get("*") ?? [];
}

/** A robots path pattern against a URL path. `*` is any run, `$` anchors
    the end; everything else is literal. */
function matches(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const anchored = escaped.endsWith("\\$") ? `^${escaped.slice(0, -2)}$` : `^${escaped}`;
  try {
    return new RegExp(anchored).test(path);
  } catch {
    return false;
  }
}

export function isAllowedByRules(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!matches(r.path, path)) continue;
    // Longest match wins; Allow wins a tie, which is what the standard says
    // and the direction that keeps a fetch we were going to make anyway.
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) {
      best = r;
    }
  }
  return best ? best.allow : true;
}

/**
 * The three answers, kept apart because they mean different things to the
 * caller: "deny" is a decision the host made and is worth recording against
 * the image, "unreachable" is a fact about today and must not be.
 */
export type RobotsVerdict = "allow" | "deny" | "unreachable";

/* One fetch per host per invocation, keyed by HOST — not by registrable
   domain. robots.txt is scoped to scheme, host and port, and subdomains
   inherit nothing: api.electrolux-medialibrary.com serves its own file
   separately from services.electrolux-medialibrary.com, and a product sits
   on each. Keying by domain would apply one site's rules to another's. */
const cache = new Map<string, Rule[] | "unreachable">();

export async function mayFetch(url: string): Promise<RobotsVerdict> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "deny";
  }

  const key = parsed.host.toLowerCase();
  let entry = cache.get(key);

  if (entry === undefined) {
    try {
      const res = await fetch(`${parsed.protocol}//${parsed.host}/robots.txt`, {
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": `BuyTodayBot/1.0 (+https://buytoday.co.il)` },
      });
      if (res.ok) {
        entry = rulesFor(parseRobotsTxt(await res.text()));
      } else if (res.status === 429 || res.status >= 500) {
        // Rate-limited or broken: not an absence of rules, an absence of an
        // answer. 429 is singled out from the other 4xx deliberately — it
        // is the host saying "later", which is the opposite of "no rules".
        entry = "unreachable";
      } else {
        // Any other 4xx: there is no file, so there are no rules.
        entry = [];
      }
    } catch {
      // Timeout, DNS, a severed connection. Google counts these as 5xx and
      // so do we; this is the common case, not the exotic one.
      entry = "unreachable";
    }
    cache.set(key, entry);
  }

  if (entry === "unreachable") return "unreachable";
  return isAllowedByRules(entry, parsed.pathname + parsed.search) ? "allow" : "deny";
}

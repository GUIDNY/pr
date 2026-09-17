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
 * FAILS OPEN. No robots.txt, a 404, a 403, a timeout — the host is treated
 * as allowing. That is what the standard says and it is the honest reading:
 * silence is not refusal. Only an actual rule blocks an actual fetch.
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

/* One fetch per host per invocation. A serverless run is short and a cron
   invocation is shorter; caching beyond it would mean holding a file we
   cannot invalidate. */
const cache = new Map<string, Rule[]>();

export async function mayFetch(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const key = parsed.host.toLowerCase();
  let rules = cache.get(key);

  if (rules === undefined) {
    try {
      const res = await fetch(`${parsed.protocol}//${parsed.host}/robots.txt`, {
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": `BuyTodayBot/1.0 (+https://buytoday.co.il)` },
      });
      rules = res.ok ? rulesFor(parseRobotsTxt(await res.text())) : [];
    } catch {
      rules = [];
    }
    cache.set(key, rules);
  }

  return isAllowedByRules(rules, parsed.pathname + parsed.search);
}

# The price-sheet agent

Gets the three workbooks from the company file server into the shop, twice a
day, without anybody remembering to do it.

They were last synced on **6 September** and it is now late September. That
gap is the whole reason this exists: the sync has always worked, it has just
always needed a person to press a button, and pressing it is not somebody's
job.

## How it fits together

```
  Mac inside the network                        Vercel
  ──────────────────────                        ──────
  launchd, 07:30 + 15:30
     │
     ├─ reads  /Volumes/מחירון/*.xlsx     (read-only, always)
     ├─ sha256, skips what has not changed
     │
     ├─ POST /api/inventory/source  ───────────►  stores the copies,
     │                                            answers which changed
     └─ GET  /api/inventory/sync    ───────────►  imports stock
```

The site cannot reach the file server and never will, so everything moves
outward from the Mac. Two calls rather than one because storing three files
takes a second and a full sync takes minutes, and a single request that does
both is a request that gets killed halfway through the part that matters.

## The rule that outranks everything else here

**The workbooks are never modified.** Not renamed, not moved, not re-saved,
not marked as processed. They belong to the company's ERP export and this
shop is one reader among several. The agent opens them `"rb"`, copies the
bytes into local scratch once, and closes them — and it fingerprints every
file before and after its own run and logs a `VIOLATION` line if anything
moved. See CLAUDE.md.

## Installing it

1. Copy `push-price-sheets.py` somewhere on the Mac — `~/buytoday/` is fine.
2. Set `INVENTORY_AGENT_SECRET` in the Vercel dashboard to a long random
   value. Generate it on the Mac and never paste it into a chat:
   ```
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
3. Copy `com.buytoday.pricesheets.plist` to `~/Library/LaunchAgents/` and
   fill in the three `CHANGE-ME` values — the script's path, the folder, and
   that same secret. Then `chmod 600` it: it holds the secret.
4. The folder is `/Volumes/מחירון` and is already the default, so there is
   nothing to change unless the share is ever remounted under another name.
5. **Dry run first**, which reads and hashes and sends nothing:
   ```
   BUYTODAY_SHEETS_DIR="/Volumes/…/מחירון" python3 push-price-sheets.py --dry-run
   ```
   Three `NEW` lines and no `VIOLATION` means it is reading the right folder.
6. Then one real run by hand, and read what came back before trusting a
   schedule. After sixteen days of drift the first import will move a lot.
7. `launchctl load ~/Library/LaunchAgents/com.buytoday.pricesheets.plist`

The log is at `~/Library/Logs/buytoday-sync.log`.

## Filenames move, so the agent does not rely on them

The workbooks are matched by the **start** of their name, not the whole
thing. The three copies uploaded by hand in September are recorded as
`מחירון מלאי אלקטרוניקה6.9.xlsx` — the same sheets with the date stuck on the
end — while the ones on the share today carry no date. Whoever exports them
does it both ways, and an exact match would have recognised nothing on the
first dated run and called it a clean pass with no import.

So the agent resolves which sheet is which and sends the **source key**, and
the server validates that key against its own list rather than reading a name
whose shape it cannot rely on. `.tmp` files and Excel's `~$` lock files are
never read. When two files match the same prefix — the plain one and a dated
copy left behind — the newest wins and the log names the one it ignored.

## What it will and will not change

**Stock: yes, automatically.** That is the sheet's job and it already owns
those columns exclusively.

**Price: no.** A price change is detected, recorded as a `PRICE_CHANGED`
event and shown in the admin, and the product keeps the price it has until a
person accepts it. Letting an automated import rewrite live prices twice a
day is the same cycle that once wiped a morning's corrections, except that
this time it is money — and the parser has already produced a ₪690 Miele
once. When there is a fortnight of clean runs to look at, the sensible next
step is to apply changes inside a narrow band automatically and send the rest
to the queue.

## When it goes wrong

| Log line | What happened |
|---|---|
| `ERROR folder not reachable` | The share is not mounted. Fatal on purpose — an unmounted share looks exactly like a folder with no spreadsheets, and a run that finds nothing would otherwise report success. |
| `SKIP … waiting for it to settle` | Somebody was saving the file. It will go on the next run. |
| `WARN not in the folder` | One sheet is missing. Not fatal, never normal. |
| `HTTP 409` on sync | Another sync was already running. Nothing is lost. |
| `VIOLATION` | The agent's own check says a source file changed during its run. Stop and find out why before running it again. |

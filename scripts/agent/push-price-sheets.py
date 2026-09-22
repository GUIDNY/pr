#!/usr/bin/env python3
"""
Pushes the three price sheets from the company file server to the shop.

Runs on a Mac inside the company network, twice a day, under launchd. The
site is on Vercel and has no route to prec.wee.co.il and never will, so the
direction is inward: this reads, the site receives.

    python3 push-price-sheets.py            normal run
    python3 push-price-sheets.py --dry-run  read and hash, send nothing
    python3 push-price-sheets.py --force    send even if nothing changed

THE SHEETS ARE NEVER MODIFIED. Not renamed, not moved, not re-saved, not
marked as processed. They are the company's own record, maintained in the ERP
and exported for everyone who needs them; this shop is one reader among
several. Every file is opened "rb", copied once into local scratch, and
closed — and the script takes each file's size, mtime and sha256 before and
after its own run and refuses to finish quietly if any of them moved. A
promise in a comment is not a guarantee; that check is.

Only the standard library, because a machine in a shop is not a machine
anybody will keep a virtualenv healthy on.
"""

import argparse
import hashlib
import json
import mimetypes
import os
import shutil
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------- settings

# THE ONE LINE TO FILL IN. Drag the מחירון folder onto a Terminal window and
# paste what appears. It will look like /Volumes/something/מחירון.
SHEETS_DIR = Path(os.environ.get("BUYTODAY_SHEETS_DIR", "/Volumes/מחירון"))

SITE = os.environ.get("BUYTODAY_SITE", "https://buytoday.co.il")

# Set in the launchd plist, never in this file — a secret in a file that lives
# in a git repository is a secret that has already leaked.
SECRET = os.environ.get("BUYTODAY_AGENT_SECRET", "")

# Source key -> the start of its filename.
#
# A PREFIX AND NOT THE WHOLE NAME, and that is not laziness. The three
# workbooks uploaded by hand in September are recorded in the database as
# "מחירון מלאי אלקטרוניקה6.9.xlsx" — the same sheets with the date stuck on
# the end — while the ones on the share today carry no date. Whoever exports
# them does it both ways. Matching the whole name would have recognised
# nothing on the first dated run and reported a clean pass with no import,
# which is exactly the silent nothing-happened this job exists to end.
#
# The keys are the ones in src/lib/inventory/sheet-map.ts, and they are what
# gets sent — the server validates the key and never has to read a name whose
# shape it cannot rely on.
#
# The three prefixes do not overlap: "מחירון ליין קטן" and
# "מחירון ליין לבן מסכים" diverge at the fourth word. If a fourth sheet is
# ever added, check that before adding it here.
SOURCES = {
    "electronics": "מחירון מלאי אלקטרוניקה",
    "small-appliances": "מחירון ליין קטן",
    "white-goods-screens": "מחירון ליין לבן מסכים",
}

# How long a file must have been still before it is read. Excel writes through
# a temp file and renames over the original, and the folder shows A15BDAD5.tmp
# and 3.tmp sitting next to the workbooks — proof that somebody saves into it.
# Reading mid-save gets a truncated workbook, which parses as zero rows, which
# reads downstream as "every product is gone".
SETTLE_SECONDS = 30

STATE = Path.home() / "Library" / "Application Support" / "buytoday-sync" / "state.json"
LOG = Path.home() / "Library" / "Logs" / "buytoday-sync.log"


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).astimezone():%Y-%m-%d %H:%M:%S}  {msg}"
    print(line, flush=True)
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass  # a log that cannot be written is not a reason to skip the sync


def fingerprint(path: Path) -> dict:
    """Size, mtime and sha256 — read-only, and the evidence the file is
    untouched. sha256 of a megabyte is microseconds; there is no reason to
    trust mtime alone when the real thing is this cheap."""
    st = path.stat()
    digest = hashlib.sha256()
    with open(path, "rb") as fh:          # "rb". The only mode this script uses.
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return {"size": st.st_size, "mtime": st.st_mtime, "sha256": digest.hexdigest()}


def resolve(present: dict[str, Path]) -> dict[str, Path]:
    """Which file on the share is which source.

    Only .xlsx, and never Excel's own scratch: the folder holds A15BDAD5.tmp
    and 3.tmp next to the workbooks, and names beginning "~$" are Excel's lock
    files. Reading either gets bytes that are not a workbook.

    When two files match the same prefix — the plain one and a dated copy left
    behind — the newest wins and the run says so. Picking silently would mean
    importing last month's sheet on the day somebody saves a new one beside
    the old.
    """
    chosen: dict[str, Path] = {}
    for key, prefix in SOURCES.items():
        matches = [
            p
            for name, p in present.items()
            if name.startswith(prefix)
            and name.lower().endswith(".xlsx")
            and not name.startswith("~$")
        ]
        if not matches:
            continue
        matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        if len(matches) > 1:
            others = ", ".join(p.name for p in matches[1:])
            log(f"WARN   {key}: several files match — using {matches[0].name}, ignoring {others}")
        chosen[key] = matches[0]
    return chosen


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def build_multipart(files: list[tuple[str, str, bytes]]) -> tuple[bytes, str]:
    """A multipart body by hand, because the alternative is a dependency.

    The part is named after the SOURCE KEY, not "file". That is what makes the
    upload independent of whatever the export decided to call the workbook
    today — see SOURCES. The filename rides along for display only.
    """
    boundary = uuid.uuid4().hex
    ctype = mimetypes.types_map.get(".xlsx", "application/octet-stream")
    body = bytearray()
    for key, name, data in files:
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{key}"; filename="'.encode()
        body += name.encode("utf-8")
        body += b'"\r\n'
        body += f"Content-Type: {ctype}\r\n\r\n".encode()
        body += data
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def post(url: str, body: bytes, content_type: str) -> tuple[int, dict]:
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", content_type)
    req.add_header("Authorization", f"Bearer {SECRET}")
    return send(req)


def get(url: str) -> tuple[int, dict]:
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {SECRET}")
    return send(req)


def send(req: urllib.request.Request) -> tuple[int, dict]:
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=600, context=ctx) as res:
            return res.status, json.loads(res.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", "replace")
        try:
            return err.code, json.loads(raw or "{}")
        except ValueError:
            return err.code, {"error": raw[:500]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if not SECRET and not args.dry_run:
        log("ERROR  BUYTODAY_AGENT_SECRET is not set")
        return 2

    """A share that is not mounted looks exactly like a folder with no
    spreadsheets in it, and a run that finds nothing reports success. That is
    the shape of the failure that goes unnoticed for a fortnight, so it is
    checked first and it is fatal."""
    if not SHEETS_DIR.is_dir():
        log(f"ERROR  folder not reachable: {SHEETS_DIR}  (is the share mounted?)")
        return 2

    present = {p.name: p for p in SHEETS_DIR.iterdir() if p.is_file()}
    chosen = resolve(present)

    missing = [k for k in SOURCES if k not in chosen]
    if missing:
        # Not fatal — one sheet may genuinely be away being edited — but it is
        # never normal, and it is the difference between "no changes today"
        # and "we stopped seeing a third of the catalogue".
        log(f"WARN   no file found for: {', '.join(missing)}")
    if len(chosen) == 0:
        log("ERROR  none of the three sheets are there — refusing to call this a clean run")
        return 2

    state = load_state()
    now = time.time()
    scratch = Path(tempfile.mkdtemp(prefix="buytoday-sheets-"))
    before: dict[str, dict] = {}
    to_send: list[tuple[str, str, bytes]] = []

    try:
        for key, path in chosen.items():
            age = now - path.stat().st_mtime
            if age < SETTLE_SECONDS:
                log(f"SKIP   {path.name} — saved {int(age)}s ago, waiting for it to settle")
                continue

            fp = fingerprint(path)
            before[key] = {**fp, "path": str(path)}

            # Keyed by source, not by filename: the name changes when somebody
            # appends a date, and state keyed on the name would call a renamed
            # but identical file new every single run.
            if not args.force and state.get(key, {}).get("sha256") == fp["sha256"]:
                log(f"SAME   {key}  ({path.name})")
                continue

            # Copied out once; everything after this works on our copy, so a
            # retry never re-reads the original.
            local = scratch / f"{key}.xlsx"
            shutil.copyfile(path, local)
            to_send.append((key, path.name, local.read_bytes()))
            log(f"NEW    {key}  {path.name}  {fp['size']:,} bytes  {fp['sha256'][:12]}")

        if not to_send:
            log("nothing changed — no upload, no sync")
            return 0

        if args.dry_run:
            log(f"dry run — would upload {len(to_send)} file(s)")
            return 0

        status, payload = post(f"{SITE}/api/inventory/source", *build_multipart(to_send))
        log(f"upload  HTTP {status}  {json.dumps(payload, ensure_ascii=False)[:400]}")
        if status not in (200, 207):
            log("ERROR  upload rejected — state not advanced, will retry next run")
            return 1

        # Only the files the server confirmed. A partial 207 must not mark a
        # rejected file as sent, or it is never retried.
        for row in payload.get("results", []):
            if row.get("ok") and row.get("key") in before:
                state[row["key"]] = before[row["key"]]
        save_state(state)

        if not payload.get("anyChanged") and not args.force:
            log("server already had these bytes — skipping sync")
            return 0

        status, run = get(f"{SITE}/api/inventory/sync")
        log(f"sync    HTTP {status}  {json.dumps(run, ensure_ascii=False)[:400]}")
        if status == 409:
            log("another sync was already running — it will pick these up")
            return 0
        if status != 200:
            log("ERROR  sync failed")
            return 1
        return 0

    finally:
        shutil.rmtree(scratch, ignore_errors=True)

        """THE PROOF. Every file this run looked at is fingerprinted again and
        compared. If any of them moved, the run says so as loudly as it can —
        because the one rule this script has is that it does not write to
        those files, and a rule nobody checks is a rule that is already
        broken somewhere."""
        for key, fp in before.items():
            path = Path(fp["path"])
            if not path.exists():
                log(f"VIOLATION  {path.name} is gone after this run")
                continue
            after = fingerprint(path)
            expected = {k: v for k, v in fp.items() if k != "path"}
            if after != expected:
                log(f"VIOLATION  {path.name} changed during this run: {expected} -> {after}")


if __name__ == "__main__":
    sys.exit(main())

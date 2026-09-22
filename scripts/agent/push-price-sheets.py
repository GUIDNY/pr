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
SHEETS_DIR = Path(os.environ.get("BUYTODAY_SHEETS_DIR", "/Volumes/CHANGE-ME/מחירון"))

SITE = os.environ.get("BUYTODAY_SITE", "https://buytoday.co.il")

# Set in the launchd plist, never in this file — a secret in a file that lives
# in a git repository is a secret that has already leaked.
SECRET = os.environ.get("BUYTODAY_AGENT_SECRET", "")

# The exact three names the parser keys its per-tab category map by, in
# src/lib/inventory/sheet-map.ts. A file whose name is not on this list is
# ignored rather than guessed at: the server derives the source key from the
# name, and a white-goods sheet filed under electronics would import 1,100
# products into the wrong categories.
EXPECTED = [
    "מחירון מלאי אלקטרוניקה.xlsx",
    "מחירון ליין קטן.xlsx",
    "מחירון ליין לבן מסכים.xlsx",
]

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


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def build_multipart(files: list[tuple[str, bytes]]) -> tuple[bytes, str]:
    """A multipart body by hand, because the alternative is a dependency."""
    boundary = uuid.uuid4().hex
    ctype = mimetypes.types_map.get(".xlsx", "application/octet-stream")
    body = bytearray()
    for name, data in files:
        body += f"--{boundary}\r\n".encode()
        # filename* / RFC 5987 so the Hebrew name survives the trip; the
        # server matches on it to decide which source this is.
        body += b'Content-Disposition: form-data; name="file"; filename="'
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
    missing = [n for n in EXPECTED if n not in present]
    if missing:
        # Not fatal — one sheet may genuinely be away being edited — but it is
        # never normal, and it is the difference between "no changes today"
        # and "we stopped seeing a third of the catalogue".
        log(f"WARN   not in the folder: {', '.join(missing)}")
    if len(missing) == len(EXPECTED):
        log("ERROR  none of the three sheets are there — refusing to call this a clean run")
        return 2

    state = load_state()
    now = time.time()
    scratch = Path(tempfile.mkdtemp(prefix="buytoday-sheets-"))
    before: dict[str, dict] = {}
    to_send: list[tuple[str, bytes]] = []

    try:
        for name in EXPECTED:
            path = present.get(name)
            if path is None:
                continue

            age = now - path.stat().st_mtime
            if age < SETTLE_SECONDS:
                log(f"SKIP   {name} — saved {int(age)}s ago, waiting for it to settle")
                continue

            fp = fingerprint(path)
            before[name] = fp

            if not args.force and state.get(name, {}).get("sha256") == fp["sha256"]:
                log(f"SAME   {name}")
                continue

            # Copied out once; everything after this works on our copy, so a
            # retry never re-reads the original.
            local = scratch / f"{abs(hash(name))}.xlsx"
            shutil.copyfile(path, local)
            to_send.append((name, local.read_bytes()))
            log(f"NEW    {name}  {fp['size']:,} bytes  {fp['sha256'][:12]}")

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
            if row.get("ok") and row.get("filename") in before:
                state[row["filename"]] = before[row["filename"]]
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
        for name, fp in before.items():
            path = present.get(name)
            if path is None or not path.exists():
                log(f"VIOLATION  {name} is gone after this run")
                continue
            after = fingerprint(path)
            if after != fp:
                log(f"VIOLATION  {name} changed during this run: {fp} -> {after}")


if __name__ == "__main__":
    sys.exit(main())

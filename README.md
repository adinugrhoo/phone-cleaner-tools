# Phone Cleaner — Google Apps Script

A Google Sheets sidebar tool that cleans, validates, and deduplicates phone numbers into a central master sheet. Runs as an **Editor Add-on** — available in every Google Sheet you open. Built with pure Google Apps Script and vanilla JS — no external libraries or npm required.

---

## What it does

Every week a PM drops a new sheet with raw phone numbers. You open the sidebar, fill in the details, and the tool:

1. **Cleans** — splits comma-separated cells, strips non-digit characters
2. **Validates** — applies country-specific rules loaded live from a Countries tab (no code changes needed)
3. **Deduplicates** — checks against the master sheet; new numbers are appended, duplicates get `last_seen` updated, opted-out numbers are skipped
4. **Previews first** — nothing is written until you explicitly click Sync

---

## Files

| File | Purpose |
|------|---------|
| `Code.gs` | Server-side: cleaning pipeline, country rules, dedup, read/write to master sheet |
| `Sidebar.html` | Client-side: sidebar UI (Tailwind CSS + shadcn design tokens + Google Sans Flex font) |
| `appsscript.json` | Add-on manifest — declares OAuth scopes and runtime |

---

## UI

The sidebar is built with **Tailwind CSS CDN** and **shadcn design tokens** for a clean, modern look — no build step needed.

- **Google Sans Flex** font (loaded from Google Fonts)
- Source toggle: Paste URL mode or Selected Range mode
- Icon-only **refresh button** (↺) on the Selected Range input — re-fetches the active selection without reopening the sidebar
- **Native date picker** for the batch date field — stored as `DD MMM YYYY` in the batch label
- Stats cards (new / duplicate / rejected) with color-coded results table and reject list
- Preview → Sync flow: nothing writes to master until you confirm

---

## Setup

### 1. Create a standalone Apps Script project

This tool runs as an **Editor Add-on** so it appears in every Google Sheet you open — not just one.

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Rename the project to `Phone Cleaner`

### 2. Copy the files

In the Apps Script editor:

1. Replace `Code.gs` contents with the code from this repo
2. Click **+** (New file) → **HTML** → name it `Sidebar` → paste `Sidebar.html`
3. Click the gear icon (**Project Settings**) → check **Show "appsscript.json" manifest file in editor**
4. Open `appsscript.json` → replace its contents with the `appsscript.json` from this repo
5. Save all files (Ctrl+S / Cmd+S)

### 3. Install as an Editor Add-on

1. Click **Deploy → Test deployments**
2. Select type → **Editor Add-on**
3. Click **Install** → authorize the permissions when prompted
4. Open any Google Sheet — you will now see **Extensions → Phone Cleaner** in the menu

> The add-on is tied to your Google account. Once installed, it appears automatically in every Google Sheet you open — no repeat setup needed per sheet.
>
> **Note:** "Deploy → New deployment → Add-on" is for publishing to the Workspace Marketplace and requires a GCP project. For personal use, always use **Test deployments → Install** instead.

### 4. Create a Master Sheet (one-time)

Create a new Google Sheet to act as the central database. Then:

1. Open any Google Sheet → **Extensions → Phone Cleaner → Configure Master Sheet**
2. Paste the URL (or Spreadsheet ID) of the master sheet
3. Click OK — the tool automatically creates **Master**, **Rejects**, and **Countries** tabs with headers, and seeds 7 default countries

This setting is saved to your Google account (user properties), so you only need to configure it once across all sheets.

### 5. Run your first batch

1. Open any Google Sheet → **Extensions → Phone Cleaner → Open Sidebar**
2. Choose source:
   - **Paste URL** — paste a Google Sheet URL or Spreadsheet ID and specify the column number
   - **Selected Range** — select the phone number column in the current sheet first, then click the ↺ refresh button to detect it
3. Pick a default country for ambiguous 0-prefix numbers
4. Set the batch number (auto-incremented) and date (auto-filled, both editable)
5. Click **Preview** — results appear without writing anything
6. Review new / duplicate / rejected counts, then click **Sync to master**

---

## Cleaning pipeline

Each cell goes through these steps in order:

```
Step 1 — Split by comma
  "08123, 08456 text, 08789" → ["08123", "08456 text", "08789"]

Step 2 — Strip non-digits
  "08456 text" → "08456"

Step 3 — Apply country rule
  Rules loaded from Countries tab on every run
  → valid E.164 number  OR  → reject

Step 4 — Deduplicate
  Exact match against master sheet column A
  → new: append row
  → duplicate: update last_seen only
  → opted_out: skip entirely
```

---

## Country rules

Rules live in the **Countries tab** of the master sheet. Edit the sheet to add or update a country — no redeployment needed. The tool reads this tab fresh on every run.

| Col | Field | Example | Notes |
|-----|-------|---------|-------|
| A | code | ID | ISO 2-letter country code |
| B | name | Indonesia | Shown in sidebar dropdown |
| C | prefix | +62 | E.164 prefix to prepend |
| D | valid_lengths | 9,10,11,12 | Digit lengths after stripping leading 0 |
| E | strip_leading_zero | TRUE | Whether to remove a leading 0 before applying prefix |

**Default countries (seeded automatically on first configure):**

| Code | Country | Prefix | Valid lengths | Strip leading 0 |
|------|---------|--------|---------------|-----------------|
| ID | Indonesia | +62 | 9,10,11,12 | TRUE |
| SG | Singapore | +65 | 8 | FALSE |
| MY | Malaysia | +60 | 9,10 | TRUE |
| PH | Philippines | +63 | 10 | TRUE |
| TH | Thailand | +66 | 9 | TRUE |
| VN | Vietnam | +84 | 9,10 | TRUE |
| AU | Australia | +61 | 9,10 | TRUE |

To add a new country: open the master sheet → Countries tab → add a row. Done.

---

## Master sheet schema

### Master tab

| Col | Field | Example | Notes |
|-----|-------|---------|-------|
| A | number | +6281234567890 | E.164, primary key for deduplication |
| B | country | ID | ISO code |
| C | region | Indonesia | Country name |
| D | batch | Batch 21 · 15 May 2025 | Set in sidebar per run |
| E | source_sheet_id | 1BxiMVs0XRA5... | Spreadsheet ID of the source file |
| F | first_seen | 2025-05-15 | Set on first ingestion, never overwritten |
| G | last_seen | 2025-05-15 | Updated every time number appears again |
| H | outreach_status | not_sent | not_sent / sent / opted_out |
| I | opt_out | FALSE | TRUE locks row from all outreach permanently |

### Rejects tab

| Col | Field | Example |
|-----|-------|---------|
| A | raw_value | 08abc, 123 |
| B | reason | invalid_length / no_digits / ambiguous_country |
| C | source_sheet_id | 1BxiMVs0XRA5... |
| D | batch | Batch 21 · 15 May 2025 |
| E | rejected_at | 2025-05-15 |

Rejects are shared back with the PM so source data quality improves over time.

### Countries tab

See country rules section above.

---

## Performance notes

GAS has a 6-minute execution limit per run. The tool mitigates this by:

- Loading the master index into a JS hash map once — O(1) per-number lookup
- Loading country rules once per run into memory
- Writing all new rows in a single `setValues()` call instead of `appendRow()` per row
- Previewing warns if a batch exceeds 5,000 numbers

---

## Out of scope

- Sending outreach messages (the tool only manages the number list)
- Automatic weekly scheduling (PM triggers manually — keeps human review in the loop)
- Phone number reachability validation (calling/pinging numbers)

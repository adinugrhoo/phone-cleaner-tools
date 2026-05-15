# Phone Cleaner — Google Apps Script

A Google Sheets sidebar tool that cleans, validates, and deduplicates phone numbers into a central master sheet. Built with pure Google Apps Script — no external libraries or npm required.

## What it does

Every week a PM drops a new sheet with raw phone numbers. You open the sidebar, fill in the details, and the tool:

1. **Cleans** — splits comma-separated cells, strips non-digit characters
2. **Validates** — applies country-specific rules (loaded from a Countries tab, no code changes needed)
3. **Deduplicates** — checks against the master sheet; new numbers are appended, duplicates get `last_seen` updated, opted-out numbers are skipped
4. **Previews first** — nothing is written until you explicitly click Sync

---

## Files

| File | Purpose |
|------|---------|
| `Code.gs` | Server-side: cleaning pipeline, country rules, dedup, read/write to master sheet |
| `Sidebar.html` | Client-side: sidebar UI with preview → sync flow |
| `appsscript.json` | Add-on manifest — declares OAuth scopes and runtime |

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
4. Open `appsscript.json` in the editor → replace its contents with the `appsscript.json` from this repo
5. Save all files (Ctrl+S / Cmd+S)

### 3. Deploy as an Editor Add-on

1. Click **Deploy → New deployment**
2. Click the gear next to "Select type" → choose **Editor Add-on**
3. Fill in a description (e.g. `v1`), leave access as **Only myself**
4. Click **Deploy** — authorize the permissions when prompted

### 4. Install the add-on in your account

1. Click **Deploy → Test deployments** (or open the deployment you just created)
2. Click **Install** next to your deployment
3. Open any Google Sheet — you will now see **Extensions → Phone Cleaner** in the menu

> The add-on is tied to your Google account. Once installed, it appears automatically in every Google Sheet you open — no need to repeat setup per sheet.

### 5. Create a Master Sheet (one-time)

Create a new Google Sheet to act as the central database. Then:

1. Open any Google Sheet → **Extensions → Phone Cleaner → Configure Master Sheet**
2. Paste the URL (or Spreadsheet ID) of the master sheet
3. Click OK — the tool creates **Master**, **Rejects**, and **Countries** tabs with headers and seeds 7 default countries

This setting is saved to your Google account (user properties), so you only need to configure it once.

### 6. Run your first batch

1. Open any Google Sheet → **Extensions → Phone Cleaner → Open Sidebar**
2. Choose source: paste a sheet URL **or** select the phone column in the current sheet
3. Pick a default country for ambiguous 0-prefix numbers
4. Click **Preview** — results appear without writing anything
5. Review, then click **Sync to master**

---

## Cleaning pipeline

Each cell goes through these steps:

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

Rules live in the **Countries tab** of the master sheet. Edit the sheet to add or change countries — no redeployment needed.

| Col | Field | Example |
|-----|-------|---------|
| A | code | ID |
| B | name | Indonesia |
| C | prefix | +62 |
| D | valid_lengths | 9,10,11,12 |
| E | strip_leading_zero | TRUE |

**Default countries (seeded automatically):**

| Code | Country | Prefix | Valid lengths | Strip leading 0 |
|------|---------|--------|---------------|-----------------|
| ID | Indonesia | +62 | 9,10,11,12 | TRUE |
| SG | Singapore | +65 | 8 | FALSE |
| MY | Malaysia | +60 | 9,10 | TRUE |
| PH | Philippines | +63 | 10 | TRUE |
| TH | Thailand | +66 | 9 | TRUE |
| VN | Vietnam | +84 | 9,10 | TRUE |
| AU | Australia | +61 | 9,10 | TRUE |

To add a new country, open the master sheet, go to the Countries tab, and add a row. The tool reads this tab fresh on every run.

---

## Master sheet schema

### Master tab

| Col | Field | Example |
|-----|-------|---------|
| A | number | +6281234567890 |
| B | country | ID |
| C | region | Indonesia |
| D | batch | Batch 21 · 15 May 2025 |
| E | source_sheet_id | 1BxiMVs0XRA5... |
| F | first_seen | 2025-05-15 |
| G | last_seen | 2025-05-15 |
| H | outreach_status | not_sent |
| I | opt_out | FALSE |

### Rejects tab

| Col | Field | Example |
|-----|-------|---------|
| A | raw_value | 08abc, 123 |
| B | reason | invalid_length / no_digits / ambiguous_country |
| C | source_sheet_id | 1BxiMVs0XRA5... |
| D | batch | Batch 21 · 15 May 2025 |
| E | rejected_at | 2025-05-15 |

---

## Performance notes

GAS has a 6-minute execution limit. The tool mitigates this by:

- Loading the master index into a JS hash map once — O(1) per-number lookup
- Loading country rules once per run
- Writing all new rows in a single `setValues()` call
- Showing a warning in the sidebar if a batch exceeds 5,000 numbers

---

## Out of scope

- Sending outreach messages (the tool only manages the number list)
- Automatic weekly scheduling (PM triggers manually — keeps human review in the loop)
- Phone number reachability validation

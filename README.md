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

---

## Setup

### 1. Create a Master Sheet

Create a new Google Sheet (separate from any source data). This will hold three tabs: **Master**, **Rejects**, and **Countries**.

### 2. Deploy the script

1. Open any Google Sheet → **Extensions → Apps Script**
2. Replace the contents of `Code.gs` with the code from this repo
3. Click **+** to add a new file, name it `Sidebar` (type: HTML), paste `Sidebar.html`
4. Save (Ctrl+S / Cmd+S) and close the editor
5. Reload the Google Sheet — a **Phone Cleaner** menu appears in the menu bar

### 3. Configure the master sheet

1. Click **Phone Cleaner → Configure Master Sheet**
2. Paste the URL (or ID) of the master sheet you created in step 1
3. Click OK — the tool creates all required tabs and seeds the Countries tab with 7 default countries

### 4. Run your first batch

1. Click **Phone Cleaner → Open Sidebar**
2. Choose a source: paste a sheet URL **or** select a column in the current sheet
3. Pick a default country for ambiguous 0-prefix numbers
4. Click **Preview** — results appear in the sidebar
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

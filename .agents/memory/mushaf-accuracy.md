---
name: Mushaf Madinah page data accuracy
description: How MUSHAF_PAGES is structured and what fixes were made for accuracy
---

## Structure
- `MUSHAF_PAGES`: 1208 entries, each = one wajh (half-page of Madinah Mushaf)
- Standard: 2 entries per physical page (e.g. [2,1,2] and [2,3,2.5] = page 2)
- `calculatePages` counts complete entries, multiplies by 0.5 → result in wajhs
- Full Quran = 1208 entries × 0.5 = 604 wajhs ✓

## Critical Fix (page 48 — ayat al-dayn)
- Al-Baqara 2:282 fills an entire Mushaf page (longest verse)
- Originally: [2,282,48] then [2,283,49] — only ONE entry for page 48 (missing the .5 half)
- Fix applied: added [2,282,48.5] between them so page 48 counts as a full wajh
- Also removed duplicate [114,5,604.5] that existed to compensate for the missing entry

**Why:** Without the fix, any memorization range spanning page 48 would under-count by 0.5 wajh.

## Verification Results
- No gaps in wajh boundaries (verified computationally)
- Juz 1 = 21 wajh, Juz 2 = 20, Juz 3 = 20 ✓
- All 30 juzs verified, full Quran = 604 wajhs ✓

## How to apply
Any future changes to MUSHAF_PAGES must keep total entries = 1208 (2 × 604 pages).
Special long-verse pages (like page 48) need two entries pointing to same surah:ayah.

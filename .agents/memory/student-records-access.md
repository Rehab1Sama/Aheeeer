---
name: Student records access fix
description: Why students were blocked from seeing their own records, and how it was fixed
---

# Student records access — fix

## The rule
`GET /api/records` was blocking ALL students with 403. Now students can query only their OWN records.

## How student identity is resolved
Same logic as `/api/auth/me`: lookup by `(fullName = user.name AND circleId = user.circleId)` using `limit(1)`. We do NOT use the name-only fallback in the records endpoint (security risk — duplicate names could expose wrong data). If no circleId match found, return empty array.

## Why deputy was broken for student profiles
`STAFF_ROLES` was `["leader", "track_supervisor", "teacher", "supervisor"]` — missing `"deputy"`. Fixed by adding it.

**Why:** Deputies need to view student notes, enrollments, and profile pages just like leaders, but they were getting 403 on those endpoints.

**How to apply:** Any new staff-only endpoint in students.ts should use `STAFF_ROLES` which now includes deputy.

---
name: Multi-circle student linking
description: How users.student_id links to students table, and the bugs that occur when a student is enrolled in multiple circles.
---

# Multi-circle student account linking

## The rule
`users.student_id` is a one-to-one FK to `students.id`. When a student is in two circles, there is ONE student record in `students` and TWO rows in `student_enrollments`. User accounts must NOT mutate `students.circleId` if the student has > 1 active enrollment.

## Fixed bugs (2026-07-21)

**Bug 1 — `POST /users` created duplicate student records**
Creating a student account always inserted a new `students` row. Fixed: now searches for existing student by name+circleId (direct, then via `student_enrollments`) before inserting.

**Bug 2 — `PATCH /users/:id` and role-change route overwrote `students.circleId`**
Both routes called `db.update(studentsTable).set({ circleId })`. Fixed: check enrollment count first; only update `circleId` if enrollment count ≤ 1.

**Bug 3 — Migration steps 6 & 7 assigned arbitrary circle to multi-circle students**
Steps 6 and 7 in `migrateAndLinkStudentIds()` updated `users.circle_id` from `students.circleId` / `student_enrollments` for users with `circle_id IS NULL`. When a student had multiple enrollments, PostgreSQL picked an arbitrary one and assigned the same circle to all linked user accounts. Fixed: added subquery guard `COUNT(*) <= 1` so only single-circle students get their circle_id backfilled.

## Remaining issue
Existing duplicate student records (created before the fix) need a cleanup script — see follow-up task.

## 2026-09-10: removed `restoreWronglyMergedStudents()`
This boot-time repair function (added to undo damage from Bug 3 above) matched an
archived student against an active student by name alone, with no other identifying
field. Since `students.full_name` has no uniqueness constraint, two genuinely
different students sharing the same name (common with Arabic names) would be
wrongly treated as one wrongly-split record and merged back together on every
deploy. Removed entirely rather than patched, since the underlying Bug 3 it was
compensating for is already fixed by the guards above — it had no remaining
legitimate purpose. `mergeDuplicateStudents()` (with its own same-circle guard)
was kept, since `registration.ts` and `students.ts` `POST /students` still insert
without a prior name check.

## Why
The accounts page displayed all student accounts with the same circle because the migration non-deterministically assigned the same circle to all accounts. The fix ensures `circle_id` stays NULL (honest) for multi-circle students until set explicitly.

## How to apply
- In `artifacts/api-server/src/routes/users.ts`: before any `db.insert(studentsTable)` in student account flows, search for an existing record by name+circle first.
- Never call `db.update(studentsTable).set({ circleId })` without first checking `enrollment count ≤ 1`.
- In startup migration: add `COUNT(*) <= 1` guard on steps 6 & 7 of `migrateAndLinkStudentIds()`.

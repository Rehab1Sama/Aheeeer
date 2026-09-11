---
name: Student-user direct link (users.student_id)
description: How student user accounts are linked to their student record — the FK column added to fix zero-stats bug.
---

## The problem
Student identity was resolved by `fullName + circleId` name-matching against the `students` table. This failed for students enrolled via `student_enrollments` (newer system) where `students.circleId` is null → `req.userStudentId = null` → all stats showed 0.

## The fix
Added `student_id integer REFERENCES students(id)` to the `users` table. Resolution priority in `authenticate.ts`:
1. `user.studentId` (direct FK — primary path)
2. `students.fullName + students.circleId` (legacy direct column)
3. `student_enrollments JOIN students` WHERE `circleId = user.circleId`
4. Name-only fallback (only for unique names)

## Where student_id is set
- `POST /api/users` — after inserting students row, updates users.student_id
- `PATCH /api/users/:id` — ensures student row exists and sets student_id
- `PATCH /api/users/:id/set-role` — when role becomes "student", finds/creates student row and sets student_id
- `POST /api/registration/submit` — after inserting student, sets users.student_id = newStudent.id
- `migrateAndLinkStudentIds()` in index.ts — runs at startup, backfills existing accounts via 4-step SQL (idempotent)

**Why:** Name-based lookup is ambiguous (same name across circles), and fragile (name mismatch between users.name and students.fullName breaks the link entirely).

**How to apply:** Any new flow that creates a user with role="student" must also set users.student_id. The migration auto-heals on each server restart for any missed rows (with unique-name-only fallback to avoid wrong links).

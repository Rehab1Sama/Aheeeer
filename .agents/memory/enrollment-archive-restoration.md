---
name: Enrollment archive restoration
description: Boundary between restoring a circle enrollment and moving a student to another circle.
---

Restore an enrollment archive only to the same previously archived circle. Do not present another-circle destinations in the archive restore UI.

**Why:** A per-circle withdrawal preserves the student's other enrollment history. Treating restore as a transfer would make an advertised UI action fail server validation or silently change the intended scope.

**How to apply:** Keep restore requests tied to the archived enrollment's circle. If a user needs another circle, use a dedicated transfer/enrollment operation with its own active-circle and authorization checks.
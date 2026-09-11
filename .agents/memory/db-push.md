---
name: DB push method for this project
description: How to apply schema changes to the PostgreSQL database
---

## Problem
`drizzle-kit push` hangs interactively in this environment.

## Solution
Use direct SQL via Node.js with the `pg` package:
```js
const { Client } = require('/home/runner/workspace/node_modules/.pnpm/pg@8.21.0/node_modules/pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('CREATE TABLE IF NOT EXISTS ...');
await client.end();
```

**Why:** The Replit environment doesn't support interactive TTY prompts from drizzle-kit.

## Schema export
After creating tables via SQL, export schema from `lib/db/src/schema/index.ts`.

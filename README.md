# موقع مقرأة سَنا الآي

نظام إدارة المقرأة: الحلقات والطالبات، الإدخال اليومي (يدويًا ومن بطاقات الواتساب)، خطط المراجعة بمقارنة النطاقات،
الأوسمة، الشهادات الفصلية، التسجيل، مهام مسؤولات المسارات، وتقرير القائدة اليومي على تيليجرام.

## البنية

| المجلد | المحتوى |
|---|---|
| `artifacts/sana-quran` | الواجهة: React + Vite + Tailwind + TanStack Query |
| `artifacts/api-server` | الخادم: Express 5 + Drizzle ORM، ويخدم الواجهة المبنية أيضًا |
| `lib/db` | مخطط قاعدة البيانات (`src/schema`) وملفات الترحيل (`drizzle/*.sql`) |
| `lib/api-spec` | عقد الواجهات (OpenAPI) — منه يُولَّد `lib/api-zod` و`lib/api-client-react` |

قاعدة البيانات: PostgreSQL على Supabase. الجداول القديمة غير المستخدمة منقولة إلى مخطط `archive` (لم تُحذف).

## النشر

- **Render** (`render.yaml`): كل دفعة على `main` تُبنى وتُنشر تلقائيًا.
  أمر التشغيل يطبّق ملفات الترحيل الجديدة أولًا (`lib/db/scripts/migrate.mjs`، وتُسجَّل في جدول `__sana_migrations`).
- **متغيرات البيئة** في Render: `DATABASE_URL`، `SESSION_SECRET`، `TELEGRAM_BOT_TOKEN`، `REPORT_KEY`، `ALLOWED_ORIGINS`.

## الفحص والجداول الآلية (GitHub Actions)

| الملف | العمل |
|---|---|
| `ci.yml` | مع كل دفعة: اختبارات القواعد + فحص الأنواع + بناء الموقع |
| `telegram-daily-report.yml` | تقرير القائدة اليومي ٦:٣٠ صباحًا بتوقيت مكة (يحتاج سر `REPORT_KEY`) |
| `weekly-backup.yml` | نسخة احتياطية مشفّرة كل جمعة، تُحفظ ٩٠ يومًا (يحتاج `BACKUP_DATABASE_URL` و`BACKUP_PASSPHRASE`) |

استرجاع نسخة احتياطية: `gpg --decrypt sana-backup-YYYY-MM-DD.sql.gz.gpg | gunzip > backup.sql`

## التطوير محليًا

```bash
corepack enable && pnpm install
pnpm run typecheck                         # فحص الأنواع
pnpm --filter @workspace/api-server test   # اختبارات القواعد (test/*.test.ts)
```

## قواعد مهمة في الكود

- **الطالبة في أكثر من حلقة:** لكل حلقة حساب وسجل تسجيل (`student_enrollments`)، وتُعرف بالربط المحفوظ ثم الاسم ثم السجل (`lib/access.ts`).
- **أيام الدوام:** `lib/dataEntrySchedule.ts` — الفتيات من الأحد للخميس، وبقية المسارات من الأحد للأربعاء.
- **خطة المراجعة:** `lib/planProgress.ts` (`evaluateCoverage`) — مقارنة نطاق المراجعة البعيدة بنطاق الخطة بالوجه،
  الترتيب العكسي بالسور، سماح وجه واحد، وتغطية يوم لاحق تعني إنجاز ما قبله. الاختبارات في `artifacts/api-server/test`.
- **سجل التعديلات:** كل إضافة/تعديل/حذف ناجح يُسجَّل في `audit_logs` (تُخفى كلمات السر)، ويُعرض للقائدة في «سجل التعديلات».
- **الحذف:** الأرشفة لا الحذف النهائي.

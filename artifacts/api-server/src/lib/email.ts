import nodemailer from "nodemailer";

function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendEmailOTP(to: string, otp: string): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) throw new Error("لم يتم ضبط EMAIL_USER و EMAIL_PASS في متغيرات البيئة");
  await transporter.sendMail({
    from: `"مقرأة سَنا الآي" <${process.env.EMAIL_USER}>`,
    to,
    subject: "رمز التحقق — مقرأة سنا القرآن",
    html: `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2d7d6f);padding:28px 32px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">مقرأة سَنا الآي</h1>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 20px;color:#334155;font-size:15px">أدخلي هذا الرمز للتحقق من بريدك:</p>
      <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
        <span style="font-size:42px;font-weight:900;letter-spacing:12px;color:#1e3a5f;font-family:monospace">${otp}</span>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">صالح لمدة <strong>10 دقائق</strong></p>
    </div>
  </div>
</body></html>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) throw new Error("لم يتم ضبط EMAIL_USER و EMAIL_PASS في متغيرات البيئة");
  await transporter.sendMail({
    from: `"مقرأة سَنا الآي" <${process.env.EMAIL_USER}>`,
    to,
    subject: "إعادة تعيين كلمة المرور — مقرأة سنا القرآن",
    html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2d7d6f);padding:28px 32px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">مقرأة سَنا الآي</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px">إعادة تعيين كلمة المرور</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">
        تلقينا طلبًا لإعادة تعيين كلمة مرور حسابك.<br>
        اضغطي على الزر أدناه لاختيار كلمة مرور جديدة.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${resetUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2d7d6f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.5px">
          إعادة تعيين كلمة المرور
        </a>
      </div>
      <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-align:center">أو انسخي هذا الرابط في متصفحك:</p>
      <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;word-break:break-all;direction:ltr">${resetUrl}</p>
      <p style="margin:20px 0 0;color:#cbd5e1;font-size:11px;text-align:center">هذا الرابط صالح لمدة <strong>ساعة واحدة</strong> فقط<br>إذا لم تطلبي هذا الرابط تجاهلي هذه الرسالة</p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendActivationEmail(to: string, activationUrl: string): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) throw new Error("لم يتم ضبط EMAIL_USER و EMAIL_PASS في متغيرات البيئة");
  await transporter.sendMail({
    from: `"مقرأة سَنا الآي" <${process.env.EMAIL_USER}>`,
    to,
    subject: "تفعيل حسابك — مقرأة سنا القرآن",
    html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#1e3a5f,#2d7d6f);padding:28px 32px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800">مقرأة سَنا الآي</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px">تفعيل الحساب</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6">
        أهلاً بك في مقرأة سَنا الآي 🌿<br>
        تم استلام طلب تسجيلك بنجاح. اضغطي على الزر أدناه لتفعيل حسابك.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${activationUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2d7d6f);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.5px">
          تفعيل الحساب
        </a>
      </div>
      <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-align:center">أو انسخي هذا الرابط في متصفحك:</p>
      <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;word-break:break-all;direction:ltr">${activationUrl}</p>
      <p style="margin:20px 0 0;color:#cbd5e1;font-size:11px;text-align:center">هذا الرابط صالح لمدة <strong>48 ساعة</strong> — إذا لم تطلبي هذا الرابط تجاهلي هذه الرسالة</p>
    </div>
  </div>
</body>
</html>`,
  });
}

// يزيل من صف المستخدم كل ما لا يجوز أن يخرج من الخادم: كلمة المرور ورموز تأكيد البريد
// واستعادة كلمة المرور (كانت تُرسل في قائمة المستخدمين، ومن يقرأ رمز الاستعادة يغيّر كلمة المرور).
export function toSafeUser<T extends Record<string, unknown>>(user: T): Omit<T, "passwordHash" | "emailVerificationToken" | "passwordResetToken" | "passwordResetTokenExpiry" | "telegramLinkToken" | "telegramChatId"> {
  const { passwordHash: _p, emailVerificationToken: _e, passwordResetToken: _r, passwordResetTokenExpiry: _x, telegramLinkToken: _t, telegramChatId: _c, ...safe } = user as any;
  return safe;
}

const TOKEN_KEY = "sana_auth_token";
const ACTIVE_CIRCLE_KEY = "sana_active_circle_id";

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// دالة جديدة لجلب الحلقة المختارة حالياً
export function getActiveCircleId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_CIRCLE_KEY);
}

// دالة جديدة لحفظ الحلقة المختارة وإعادة تحميل الصفحة فوراً
export function setActiveCircleId(circleId: string): void {
  localStorage.setItem(ACTIVE_CIRCLE_KEY, circleId);
  // سطر القوة: هذا السطر سيجبر الموقع على مسح "سنى 4" وعرض بيانات "وهج"
  window.location.reload();
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTIVE_CIRCLE_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

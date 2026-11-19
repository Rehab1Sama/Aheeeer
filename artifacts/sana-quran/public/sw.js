// عامل خدمة بسيط حتى يمكن تثبيت الموقع تطبيقًا على الجوال.
// لا يحفظ أي بيانات: كل طلب يذهب للشبكة كما هو، فلا تظهر بيانات قديمة أبدًا.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// YOU's service worker: shows the notifications Supabase sends (your weekly review is ready)
// and opens YOU on your week when you tap one. Nothing is cached; the page always loads fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'YOU', { body: d.body || '', icon: '/icon-180.png', badge: '/icon-180.png', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    for (const w of wins) if ('focus' in w) { if ('navigate' in w) w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});

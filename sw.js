// sw.js — Elevensies Service Worker
// Handles push notifications and basic offline caching

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// Push event — show notification
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch { data = { title: 'Elevensies', body: e.data ? e.data.text() : "It's time to play!" }; }

  const title = data.title || 'Elevensies';
  const options = {
    body: data.body || "It's 11am — time to play!",
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || 'https://playelevensies.com' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — open the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || 'https://playelevensies.com';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('playelevensies.com') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

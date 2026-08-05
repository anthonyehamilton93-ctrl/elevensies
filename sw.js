// sw.js — Elevensies Service Worker
//
// Handles push notifications only. There is deliberately no offline caching:
// the whole game is a single HTML file that gets redeployed often, and caching
// it would serve players a stale build after every deploy.
//
// Icon paths are versioned (-v2) to match manifest.json. If you upload new
// icons, bump the version in the filename and change ICON below — browsers
// cache notification icons aggressively and will otherwise keep the old one.

const ICON = '/icon-192-v2.png';
const APP_ORIGIN = 'https://playelevensies.com';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// Push event — show notification
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = {
      title: 'Elevensies',
      body: e.data ? e.data.text() : "It's time to play!",
    };
  }

  const options = {
    body: data.body || "It's 11am — time to play!",
    icon: ICON,
    badge: ICON,
    data: { url: data.url || APP_ORIGIN },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'Elevensies', options)
  );
});

// Notification click — focus an existing tab if there is one, else open the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || APP_ORIGIN;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(APP_ORIGIN) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

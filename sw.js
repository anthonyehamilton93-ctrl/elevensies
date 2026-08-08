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
    // A single tag means a later reminder replaces an earlier undelivered one
    // rather than stacking two notifications for the same day's game.
    tag: 'elevensies-daily',
    renotify: true,
    requireInteraction: false,
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'Elevensies', options)
  );
});

// The browser can rotate a push subscription on its own — a service worker
// update is the usual trigger. When that happens the old endpoint still looks
// valid to the push service for a while, so messages sent to it are accepted
// and silently dropped. Resubscribe and tell the server the new address.
const VAPID_PUBLIC_KEY = 'BOaVNchoGC50d0sx48gA_wgL7HHoj8zjrMP-cw84p8Rqd4bdf1CxH25QSS5B9tHWD2fzRCw-kMH8f7fuZhMRABE';

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

// A tiny key/value store both the page and this worker can reach. It holds a
// token identifying this browser, written when the player subscribes.
function elvIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('elevensies', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function elvIdbGet(key) {
  return elvIdb().then(db => new Promise((resolve) => {
    const r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  })).catch(() => null);
}

self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      // Chrome usually leaves oldSubscription null, which is why the token
      // matters — without it there's no way to know which row rotated.
      const oldEndpoint = e.oldSubscription ? e.oldSubscription.endpoint : null;
      const deviceToken = await elvIdbGet('device_token');
      const appKey =
        (e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey)
        || urlB64ToUint8Array(VAPID_PUBLIC_KEY);

      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });

      await fetch('/api/daily-reminder?resubscribe=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken, oldEndpoint, subscription: sub.toJSON() }),
      });
    } catch (err) {
      console.error('Resubscribe failed:', err);
    }
  })());
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

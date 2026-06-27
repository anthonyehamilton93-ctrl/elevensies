// Elevensies Service Worker — daily 11am reminder
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

let reminderTimeout = null;

function msUntilNext11am() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(11, 0, 0, 0);
  if (now.getHours() >= 11) next.setDate(next.getDate() + 1);
  return Math.max(next - now, 1000); // never negative
}

function scheduleReminder() {
  clearTimeout(reminderTimeout);
  const ms = msUntilNext11am();
  reminderTimeout = setTimeout(async () => {
    try {
      await self.registration.showNotification('Elevensies 🟨', {
        body: "Today's game is open — play before midday!",
        tag: 'elevensies-daily',
        renotify: false,
        data: { url: self.registration.scope }
      });
    } catch(e) { /* silently ignore if notifications are now blocked */ }
    scheduleReminder(); // reschedule for tomorrow
  }, ms);
}

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE_REMINDER') scheduleReminder();
  if (e.data.type === 'CANCEL_REMINDER') {
    clearTimeout(reminderTimeout);
    reminderTimeout = null;
  }
});

// Tap notification → open or focus the game
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.startsWith(self.registration.scope));
      return existing ? existing.focus() : self.clients.openWindow(url);
    })
  );
});

// Reschedule on SW startup — covers browser restarts
scheduleReminder();

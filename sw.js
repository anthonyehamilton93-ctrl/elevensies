// Elevensies Service Worker — daily 11am reminder
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

let reminderTimeout = null;

function msUntilNext11am() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(11, 0, 0, 0);
  if (now.getHours() >= 11) next.setDate(next.getDate() + 1);
  return next - now;
}

function scheduleReminder() {
  clearTimeout(reminderTimeout);
  reminderTimeout = setTimeout(() => {
    self.registration.showNotification('Elevensies 🟡', {
      body: "Today's game is open — play your word before midday!",
      tag: 'elevensies-daily',
      renotify: false,
      data: { url: self.registration.scope }
    });
    scheduleReminder(); // reschedule for tomorrow
  }, msUntilNext11am());
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_REMINDER') scheduleReminder();
  if (e.data && e.data.type === 'CANCEL_REMINDER') {
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

// Reschedule on SW startup (handles browser restarts keeping SW alive)
scheduleReminder();

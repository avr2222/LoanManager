// Push notification handler — imported by the VitePWA-generated service worker.
// Handles incoming push messages and notification click actions.

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { body: event.data.text() }; }

  const title   = data.title ?? 'Loan Reminder';
  const options = {
    body:    data.body  ?? 'You have pending loan payments.',
    icon:    '/LoanManager/pwa-192x192.png',
    badge:   '/LoanManager/pwa-64x64.png',
    tag:     'loan-reminder',
    renotify: true,
    data:    { url: data.url ?? '/LoanManager/' },
    actions: [
      { action: 'open',    title: 'View Dashboard' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url ?? '/LoanManager/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if already open
      for (const client of clients) {
        if (client.url.includes('/LoanManager/') && 'focus' in client) {
          return client.focus().then((c) => c.navigate(targetUrl));
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

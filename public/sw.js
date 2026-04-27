const VERSION = 'v1.0'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('push', function(e) {
  const data = e.data ? e.data.json() : {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'Gestor TuAgentX', {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url || '/dashboard' }
    })
  )
})

self.addEventListener('notificationclick', function(e) {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data.url))
})

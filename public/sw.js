// Service worker minimal — hanya dipakai supaya browser Android
// mengizinkan kita menampilkan notifikasi ke bilah status.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

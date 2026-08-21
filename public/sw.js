self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Ini bagian pentingnya: event 'push' ini akan tetap terpicu oleh sistem
// operasi (Android/iOS) walau halaman web-nya sudah ditutup total.
self.addEventListener("push", (event) => {
  let data = { title: "Pesan baru", body: "" };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Pesan baru", {
      body: data.body || "",
      icon: "/icon.png",
    })
  );
});

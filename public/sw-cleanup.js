(async () => {
  if (!('serviceWorker' in navigator) || sessionStorage.getItem('fabsattire_sw_cleanup')) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (!registrations.length) return;
  sessionStorage.setItem('fabsattire_sw_cleanup', '1');
  await Promise.all(registrations.map(registration => registration.unregister()));
  if ('caches' in window) {
    await Promise.all((await caches.keys()).map(cacheName => caches.delete(cacheName)));
  }
  window.location.replace(`${location.pathname}?_sw_cleanup=${Date.now()}${location.hash}`);
})().catch(() => undefined);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.update());
  });
}

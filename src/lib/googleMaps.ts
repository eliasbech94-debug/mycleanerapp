// Loads the Google Maps JS API (Places library) once, asynchronously.
let loaderPromise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    google: typeof google;
    __initGoogleMaps?: () => void;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Missing Google Maps browser key"));

  loaderPromise = new Promise((resolve, reject) => {
    window.__initGoogleMaps = () => resolve(window.google);
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${key}` +
      `&libraries=places&loading=async&callback=__initGoogleMaps` +
      (channel ? `&channel=${channel}` : "");
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

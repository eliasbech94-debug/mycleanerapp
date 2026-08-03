/**
 * Mapbox surface for Find Cleaner.
 *
 * Everything drawn here uses ANONYMISED provider area coordinates that the
 * database already coarsened — the component never receives, stores or
 * renders a provider's exact home location. The only precise point on the map
 * is the CUSTOMER's own job location pin.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, Point } from "geojson";
import { ensureMapboxToken, getMapboxToken, MAPBOX_STYLE } from "@/lib/mapbox";
import type { JobLocation, PublicProvider } from "@/lib/providerSearch";
import { HEADQUARTERS } from "@/config/headquarters";
import { countryMapPoints } from "@/config/countryGeo";
import mycleanerLogo from "@/assets/mycleaner-logo.png";

const BRAND_TEAL = "#168a7a";
const BRAND_ORANGE = "#ff6b35";
const SRC_PROVIDERS = "providers";
const SRC_RADIUS = "job-radius";
const SRC_ROUTES = "hq-routes";
const MAX_FOCUS_ZOOM = 13; // never zoom tighter than the anonymisation grid
const EUROPE_BOUNDS: [[number, number], [number, number]] = [
  [-11, 35.5],
  [30, 65],
];

type Props = {
  job: JobLocation | null;
  radiusKm: number;
  providers: PublicProvider[];
  selectedId: string | null;
  hoverId: string | null;
  /** Server-driven active market ISO codes (never hardcoded here). */
  activeMarkets?: string[];
  /** Default state: no address chosen yet — paint all of Europe. */
  showcase?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onJobChange: (job: JobLocation) => void;
  onMapMoved: (center: JobLocation) => void;
  onError?: (message: string) => void;
};

/** Great-circle-ish arc between two points, for the dotted HQ routes. */
function arc(from: [number, number], to: [number, number], steps = 48): [number, number][] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Perpendicular offset gives the line a subtle curve.
  const cx = mx - dy * 0.16;
  const cy = my + dx * 0.16;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * x1 + 2 * u * t * cx + t * t * x2,
      u * u * y1 + 2 * u * t * cy + t * t * y2,
    ]);
  }
  return pts;
}


function circlePolygon(lng: number, lat: number, radiusM: number, points = 64) {
  const latR = radiusM / 110574;
  const lngR = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i += 1) {
    const th = (i / points) * 2 * Math.PI;
    ring.push([lng + lngR * Math.cos(th), lat + latR * Math.sin(th)]);
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Polygon" as const, coordinates: [ring] },
      },
    ],
  };
}

function toFeatureCollection(list: PublicProvider[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: list.map((p) => ({
      type: "Feature",
      properties: {
        userId: p.userId,
        displayName: p.displayName,
        price: p.priceFrom ?? 0,
        rating: p.rating,
        avatar: p.avatarUrl ?? "",
        available: p.coversLocation ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [p.publicLng, p.publicLat] },
    })),
  };
}

export function ProviderMap({
  job,
  radiusKm,
  providers,
  selectedId,
  hoverId,
  activeMarkets,
  showcase = false,
  onSelect,
  onHover,
  onJobChange,
  onMapMoved,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const jobMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const hqMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const countryMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const dashTimerRef = useRef<number | null>(null);
  const overviewCameraRef = useRef<{ center: mapboxgl.LngLat; zoom: number } | null>(null);
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [overview, setOverview] = useState(false);
  const overviewRef = useRef(false);
  overviewRef.current = overview;
  const showcaseRef = useRef(showcase);
  showcaseRef.current = showcase;
  const savedCameraRef = useRef<{ center: mapboxgl.LngLat; zoom: number } | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const handlersRef = useRef({ onSelect, onHover, onJobChange, onMapMoved });
  handlersRef.current = { onSelect, onHover, onJobChange, onMapMoved };


  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getSource(SRC_PROVIDERS)) return;
    const feats = map.querySourceFeatures(SRC_PROVIDERS, { filter: ["!", ["has", "point_count"]] });
    const seen = new Set<string>();

    feats.forEach((f) => {
      const props = f.properties as Record<string, string | number> | null;
      const id = String(props?.userId ?? "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const coords = (f.geometry as Point).coordinates as [number, number];
      let marker = markersRef.current.get(id);
      if (!marker) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "mc-pin";
        el.setAttribute("data-testid", `provider-marker-${id}`);
        el.setAttribute("aria-label", String(props?.displayName ?? ""));
        el.innerHTML = `<span class="mc-pin__label"></span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          handlersRef.current.onSelect(id);
        });
        el.addEventListener("mouseenter", () => handlersRef.current.onHover(id));
        el.addEventListener("mouseleave", () => handlersRef.current.onHover(null));
        marker = new mapboxgl.Marker({ element: el }).setLngLat(coords).addTo(map);
        markersRef.current.set(id, marker);
      } else {
        marker.setLngLat(coords);
      }
      const el = marker.getElement();
      const label = el.querySelector(".mc-pin__label");
      if (label) {
        const price = Number(props?.price ?? 0);
        label.textContent = price > 0 ? `${price} kr` : String(props?.displayName ?? "");
      }
      el.dataset.selected = selectedId === id ? "true" : "false";
      el.dataset.hovered = hoverId === id ? "true" : "false";
    });

    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
  }, [selectedId, hoverId]);

  // --- runtime token --------------------------------------------------------
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    ensureMapboxToken()
      .then(() => {
        if (!cancelled) setTokenReady(true);
      })
      .catch((e) => {
        if (!cancelled) onError?.((e as Error)?.message ?? "mapbox_token_missing");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- init -----------------------------------------------------------------
  useEffect(() => {
    if (!tokenReady) return;
    if (!containerRef.current || mapRef.current) return;
    let map: mapboxgl.Map;
    try {
      mapboxgl.accessToken = getMapboxToken();
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAPBOX_STYLE,
        center: job ? [job.lng, job.lat] : [7.5, 51.5],
        zoom: job ? 11 : 2.6,
      });
    } catch (e) {
      onError?.((e as Error)?.message ?? "map_failed");
      return;
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      readyRef.current = true;
      map.addSource(SRC_RADIUS, { type: "geojson", data: circlePolygon(0, 0, 1) });
      map.addLayer({
        id: `${SRC_RADIUS}-fill`,
        type: "fill",
        source: SRC_RADIUS,
        paint: { "fill-color": BRAND_ORANGE, "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: `${SRC_RADIUS}-line`,
        type: "line",
        source: SRC_RADIUS,
        paint: { "line-color": BRAND_ORANGE, "line-width": 2, "line-dasharray": [2, 2] },
      });

      map.addSource(SRC_PROVIDERS, {
        type: "geojson",
        data: toFeatureCollection([]),
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 14,
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: SRC_PROVIDERS,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": BRAND_TEAL,
          "circle-radius": ["step", ["get", "point_count"], 20, 10, 26, 25, 34],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: SRC_PROVIDERS,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 13,
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: SRC_PROVIDERS,
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 1, "circle-opacity": 0 },
      });

      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const clusterId = f?.properties?.cluster_id;
        const src = map.getSource(SRC_PROVIDERS) as mapboxgl.GeoJSONSource;
        if (clusterId == null || !src) return;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: (f.geometry as Point).coordinates as [number, number],
            zoom: zoom ?? map.getZoom() + 2,
          });
        });
      });
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));

      map.on("render", syncMarkersRef.current);
      map.on("moveend", () => {
        const c = map.getCenter();
        handlersRef.current.onMapMoved({ lat: c.lat, lng: c.lng });
      });
      map.on("click", (e) => {
        // Dropping / moving the customer's pin — this is the JOB location.
        if (overviewRef.current || showcaseRef.current) return;
        handlersRef.current.onJobChange({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });

      // --- MyCleaner HQ (public company address, exact by design) ----------
      map.addSource(SRC_ROUTES, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: `${SRC_ROUTES}-line`,
        type: "line",
        source: SRC_ROUTES,
        layout: { "line-cap": "round" },
        paint: {
          "line-color": BRAND_TEAL,
          "line-width": 2,
          "line-opacity": 0.75,
          "line-dasharray": [0, 2],
        },
      });

      const hqEl = document.createElement("button");
      hqEl.type = "button";
      hqEl.className = "mc-hq-pin";
      hqEl.setAttribute("data-testid", "hq-marker");
      hqEl.setAttribute("aria-label", `${HEADQUARTERS.name} — ${HEADQUARTERS.label}`);
      hqEl.innerHTML = `<img src="${mycleanerLogo}" alt="" aria-hidden="true" />`;
      hqEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setOverview(true);
      });
      const hqPopup = new mapboxgl.Popup({ offset: 26, closeButton: true }).setHTML(
        `<div class="mc-hq-popup" data-testid="hq-popup">
           <span class="mc-hq-popup__label">${HEADQUARTERS.label}</span>
           <strong class="mc-hq-popup__name">${HEADQUARTERS.name}</strong>
           <address class="mc-hq-popup__address">${HEADQUARTERS.addressLines
             .map((l) => `<span>${l}</span>`)
             .join("")}</address>
           <p class="mc-hq-popup__tagline">${HEADQUARTERS.tagline}</p>
         </div>`,
      );
      hqMarkerRef.current = new mapboxgl.Marker({ element: hqEl })
        .setLngLat([HEADQUARTERS.lng, HEADQUARTERS.lat])
        .setPopup(hqPopup)
        .addTo(map);

      // Smooth "arrival" camera for the default Europe state.
      if (!job) {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        map.fitBounds(EUROPE_BOUNDS, { padding: 48, duration: reduced ? 0 : 2000 });
      }

      setMapReady(true);
      syncMarkersRef.current();
    });


    map.on("error", (e) => onError?.(e?.error?.message ?? "map_error"));

    // The split layout resizes the pane after mount; keep the canvas and the
    // Europe framing correct without re-creating the map.
    const ro = new ResizeObserver(() => {
      map.resize();
      if (showcaseRef.current && !overviewRef.current) {
        map.fitBounds(EUROPE_BOUNDS, { padding: 48, duration: 0 });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      countryMarkersRef.current.forEach((m) => m.remove());
      countryMarkersRef.current = [];
      hqMarkerRef.current?.remove();
      hqMarkerRef.current = null;
      if (dashTimerRef.current) window.clearInterval(dashTimerRef.current);
      dashTimerRef.current = null;
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady]);

  const syncMarkersRef = useRef(syncMarkers);
  syncMarkersRef.current = syncMarkers;

  // --- job pin + radius -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !job) return;
    if (!jobMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "mc-job-pin";
      el.setAttribute("data-testid", "job-pin");
      const marker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([job.lng, job.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        handlersRef.current.onJobChange({ lat, lng });
      });
      jobMarkerRef.current = marker;
    } else {
      jobMarkerRef.current.setLngLat([job.lng, job.lat]);
    }
    if (readyRef.current && map.getSource(SRC_RADIUS)) {
      (map.getSource(SRC_RADIUS) as mapboxgl.GeoJSONSource).setData(
        circlePolygon(job.lng, job.lat, radiusKm * 1000),
      );
    }
  }, [job, radiusKm]);

  // --- provider data --------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !mapReady) return;
    const src = map.getSource(SRC_PROVIDERS) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(toFeatureCollection(providers));
    if (!showcaseRef.current && providers.length > 0 && !selectedId) {
      const b = new mapboxgl.LngLatBounds();
      providers.forEach((p) => b.extend([p.publicLng, p.publicLat]));
      if (job) b.extend([job.lng, job.lat]);
      map.fitBounds(b, { padding: 80, maxZoom: MAX_FOCUS_ZOOM, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, mapReady]);

  // --- selection: focus, and restore the previous camera on close -----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedId;
    if (selectedId) {
      const p = providers.find((x) => x.userId === selectedId);
      if (!p) return;
      if (!prev) savedCameraRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      map.easeTo({
        center: [p.publicLng, p.publicLat],
        zoom: Math.min(Math.max(map.getZoom(), 11), MAX_FOCUS_ZOOM),
        duration: 500,
      });
    } else if (prev && savedCameraRef.current) {
      map.easeTo({ ...savedCameraRef.current, duration: 500 });
      savedCameraRef.current = null;
    }
    syncMarkersRef.current();
  }, [selectedId, providers]);

  useEffect(() => {
    syncMarkersRef.current();
  }, [hoverId, selectedId]);

  // --- Europe overview: active markets, symbolic logos, dotted HQ routes ----
  const marketsKey = (activeMarkets ?? []).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource(SRC_ROUTES) as mapboxgl.GeoJSONSource | undefined;

    const clear = () => {
      countryMarkersRef.current.forEach((m) => m.remove());
      countryMarkersRef.current = [];
      src?.setData({ type: "FeatureCollection", features: [] });
      if (dashTimerRef.current) window.clearInterval(dashTimerRef.current);
      dashTimerRef.current = null;
    };

    if (!overview && !showcase) {
      clear();
      if (overviewCameraRef.current) {
        map.easeTo({ ...overviewCameraRef.current, duration: 900 });
        overviewCameraRef.current = null;
      }
      return;
    }

    const points = countryMapPoints(marketsKey ? marketsKey.split(",") : []);
    clear();

    src?.setData({
      type: "FeatureCollection",
      features: points.map((c) => ({
        type: "Feature" as const,
        properties: { code: c.code },
        geometry: {
          type: "LineString" as const,
          coordinates: arc([HEADQUARTERS.lng, HEADQUARTERS.lat], [c.lng, c.lat]),
        },
      })),
    });

    points.forEach((c) => {
      const el = document.createElement("div");
      el.className = "mc-country-pin";
      el.setAttribute("data-testid", `market-marker-${c.code}`);
      el.innerHTML = `
        <img src="${mycleanerLogo}" alt="" aria-hidden="true" />
        <span class="mc-country-pin__label"><span aria-hidden="true">${c.flag}</span>${c.name}</span>`;
      countryMarkersRef.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map),
      );
    });

    // Subtle "travelling dots" animation along the routes.
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      let step = 0;
      dashTimerRef.current = window.setInterval(() => {
        step = (step + 1) % 8;
        if (!map.getLayer(`${SRC_ROUTES}-line`)) return;
        map.setPaintProperty(`${SRC_ROUTES}-line`, "line-dasharray", [
          0,
          2,
          step / 4,
          0.001,
        ]);
      }, 120);
    }

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, showcase, marketsKey, mapReady]);

  const enterOverview = useCallback(() => {
    const map = mapRef.current;
    if (map && !overviewRef.current) {
      overviewCameraRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      map.fitBounds(EUROPE_BOUNDS, { padding: 60, duration: 1400 });
    }
    setOverview(true);
  }, []);

  useEffect(() => {
    if (overview) {
      const map = mapRef.current;
      if (map && !overviewCameraRef.current) {
        overviewCameraRef.current = { center: map.getCenter(), zoom: map.getZoom() };
        map.fitBounds(EUROPE_BOUNDS, { padding: 60, duration: 1400 });
      }
    }
  }, [overview]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="provider-map" className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-6 left-3 z-10" hidden={showcase && !overview}>
        <button
          type="button"
          data-testid="mycleaner-europe-control"
          aria-pressed={overview}
          onClick={() => (overview ? setOverview(false) : enterOverview())}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <img src={mycleanerLogo} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
          {overview ? "Tilbage til søgning" : "MyCleaner i Europa"}
        </button>
      </div>
    </div>
  );
}

export default ProviderMap;

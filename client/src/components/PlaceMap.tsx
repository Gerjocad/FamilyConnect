import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPlace { id?: number; lat: number; lon: number; radius: number; icon: string; name?: string }

const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
// Mitte von Deutschland, falls noch nichts gewählt ist
const FALLBACK: [number, number] = [51.16, 10.45];

const emojiIcon = (icon: string) =>
  L.divIcon({ className: 'place-marker', html: `<span>${icon}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });

/**
 * Karte mit Orten als Kreis (Radius) und Symbol.
 * Mit onPick: Antippen der Karte oder Ziehen des Symbols setzt den Ort (nur für `editing`).
 */
export function PlaceMap({ places, editing, onPick, onSelect, center, height = 260 }: {
  places: MapPlace[];
  /** der gerade bearbeitete Ort (verschiebbar) */
  editing?: MapPlace | null;
  onPick?(lat: number, lon: number): void;
  onSelect?(place: MapPlace): void;
  /** Startpunkt, wenn noch kein Ort da ist */
  center?: [number, number] | null;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const fitted = useRef<string | null>(null);
  // gewünschter Ausschnitt; wird erst angewendet, wenn die Karte ihre Größe kennt (z. B. im Dialog)
  const target = useRef<{ bounds: L.LatLngBounds; pad: number } | null>(null);
  const pendingFit = useRef(false);
  const applyFit = () => {
    const m = map.current;
    if (!m || !target.current) return;
    if (m.getSize().x === 0) {
      pendingFit.current = true;
      return;
    }
    pendingFit.current = false;
    m.fitBounds(target.current.bounds.pad(target.current.pad), { maxZoom: 17, animate: false });
  };

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(center ?? FALLBACK, center ? 15 : 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pick.current?.(round(e.latlng.lat), round(e.latlng.lng)));
    map.current = m;
    // im Dialog ist die Größe erst nach dem Einblenden bekannt
    const observer = new ResizeObserver(() => {
      m.invalidateSize();
      if (pendingFit.current) applyFit();
    });
    observer.observe(box.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const shown = editing ? [...places.filter((p) => p.id !== editing.id), editing] : places;
    const bounds: L.LatLngBounds[] = [];
    for (const p of shown) {
      const active = editing && p === editing;
      const circle = L.circle([p.lat, p.lon], {
        radius: p.radius,
        color: active ? '#e8590c' : '#1c7ed6',
        weight: active ? 3 : 2,
        fillOpacity: active ? 0.22 : 0.12,
        dashArray: active ? undefined : '4 4',
      }).addTo(g);
      const marker = L.marker([p.lat, p.lon], { icon: emojiIcon(p.icon), draggable: Boolean(active && pick.current) }).addTo(g);
      if (p.name) marker.bindTooltip(`${p.name} · ${p.radius} m`, { direction: 'top', offset: [0, -16] });
      if (active) {
        marker.on('drag', (e) => circle.setLatLng((e.target as L.Marker).getLatLng()));
        marker.on('dragend', (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          pick.current?.(round(ll.lat), round(ll.lng));
        });
      } else if (onSelect) {
        marker.on('click', () => onSelect(p));
        circle.on('click', () => onSelect(p));
      }
      bounds.push(circle.getBounds());
    }
    // Ausschnitt anpassen: beim Bearbeiten auf den Kreis, sonst auf alle Orte – nur wenn sich Ort/Radius ändert
    const key = editing ? `e:${editing.lat},${editing.lon},${editing.radius}` : `a:${shown.length}`;
    if (key !== fitted.current) {
      fitted.current = key;
      const all = editing ? L.latLng(editing.lat, editing.lon).toBounds(editing.radius * 2) : bounds.reduce<L.LatLngBounds | null>((acc, b) => (acc ? acc.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast())), null);
      if (all) {
        target.current = { bounds: all, pad: editing ? 0.8 : 0.3 };
        applyFit();
      }
    }
  }, [places, editing, onSelect]);

  return <div ref={box} className="place-map" style={{ height }} />;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

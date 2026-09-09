"use client";

import { useEffect, useMemo, useRef } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type GeoJSON as LeafletGeoJSON, type LatLngExpression, type Layer } from "leaflet";
import "leaflet/dist/leaflet.css";

type Feature = {
  type: "Feature";
  properties?: Record<string, string>;
  geometry: unknown;
};
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

function MapEffects({
  onCountryClick,
  selectedName
}: {
  onCountryClick: (name: string, center: L.LatLng) => void;
  selectedName: string;
}) {
  const map = useMap();
  const selectedRef = useRef(selectedName);
  selectedRef.current = selectedName;

  useMapEvents({
    moveend: () => {}
  });

  useEffect(() => {
    const resize = () => map.invalidateSize(false);
    const ro = new ResizeObserver(resize);
    const el = map.getContainer();
    ro.observe(el);
    window.addEventListener("resize", resize, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [map]);

  return null;
}

function CountryLayer({
  data,
  selectedName,
  onCountryClick
}: {
  data: FeatureCollection;
  selectedName: string;
  onCountryClick: (name: string, center: L.LatLng) => void;
}) {
  const ref = useRef<LeafletGeoJSON>(null);

  const style = useMemo(() => (feature?: Feature) => {
    const name = String(feature?.properties?.NAME || feature?.properties?.NAME_EN || feature?.properties?.ADMIN || "");
    const selected = name === selectedName;
    return {
      color: selected ? "#ffe29b" : "#765124",
      weight: selected ? 2.5 : 1,
      opacity: .9,
      fillColor: selected ? "#5fe6f3" : "#c7a766",
      fillOpacity: selected ? .58 : .28
    };
  }, [selectedName]);

  const handlers = (feature: Feature, layer: Layer) => {
    const name = String(feature.properties?.NAME || feature.properties?.NAME_EN || feature.properties?.ADMIN || "Unknown Land");
    const geo = L.geoJSON(feature as never);
    const center = geo.getBounds().getCenter();
    layer.bindTooltip(name, { sticky: true, direction: "top", className: "country-tooltip" });
    layer.on({
      mouseover: () => {
        if (name !== selectedName && "setStyle" in layer) (layer as L.Path).setStyle({ color: "#d9b25c", weight: 1.8, fillColor: "#e0c17e", fillOpacity: .45 });
      },
      mouseout: () => {
        if (name !== selectedName && "setStyle" in layer) (layer as L.Path).setStyle(style(feature) as never);
      },
      click: () => onCountryClick(name, center)
    });
  };

  return <GeoJSON ref={ref} data={data as never} style={style as never} onEachFeature={handlers as never} />;
}

export default function MapCanvas({
  geojson,
  selectedName,
  onCountryClick,
  ship,
  route,
  destination
}: {
  geojson: FeatureCollection | null;
  selectedName: string;
  onCountryClick: (name: string, center: L.LatLng) => void;
  ship: L.LatLngExpression;
  route: LatLngExpression[];
  destination: L.LatLngExpression | null;
}) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={1}
      maxZoom={6}
      worldCopyJump
      zoomControl
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        updateWhenIdle
        keepBuffer={3}
      />
      {geojson && <CountryLayer data={geojson} selectedName={selectedName} onCountryClick={onCountryClick} />}
      <MapEffects onCountryClick={onCountryClick} selectedName={selectedName} />

      {route.length > 1 && (
        <RouteLayer points={route} />
      )}
      {destination && <DestinationMarker position={destination} />}
      <ShipMarker position={ship} />
    </MapContainer>
  );
}

function RouteLayer({ points }: { points: LatLngExpression[] }) {
  return <Polyline positions={points} pathOptions={{ color: "#63e7ff", weight: 2.5, opacity: .82, dashArray: "7 9", className: "magical-voyage-route" }} />;
}

function DestinationMarker({ position }: { position: LatLngExpression }) {
  return <CircleMarker center={position} radius={8} pathOptions={{ color: "#ffe29b", weight: 2, fillColor: "#5de5ff", fillOpacity: .9 }}><Tooltip>Destination</Tooltip></CircleMarker>;
}

function ShipMarker({ position }: { position: LatLngExpression }) {
  const icon = useMemo(() => L.divIcon({
    className: "ancient-ship-marker",
    html: `<div style="position:relative;width:82px;height:82px;transform:translate(-50%,-50%);pointer-events:none">
      <div style="position:absolute;left:9px;right:9px;bottom:20px;height:17px;background:linear-gradient(#75411e,#2e1609);border:2px solid #d2a153;border-radius:0 0 50% 50%;box-shadow:0 3px 5px rgba(0,0,0,.55)"></div>
      <div style="position:absolute;left:39px;bottom:32px;width:4px;height:38px;background:#6e431d;box-shadow:1px 0 0 #d1a154"></div>
      <div style="position:absolute;left:22px;bottom:46px;width:37px;height:25px;background:linear-gradient(145deg,#ead294,#a87434);clip-path:polygon(50% 0,100% 100%,0 100%);border:1px solid #684018;transform-origin:bottom center;animation:shipSail 2.8s ease-in-out infinite"></div>
      <div style="position:absolute;left:42px;top:8px;width:17px;height:10px;background:#a63325;clip-path:polygon(0 0,100% 20%,75% 80%,0 100%)"></div>
      <div style="position:absolute;left:4px;right:4px;bottom:11px;height:8px;background:radial-gradient(ellipse,rgba(190,230,231,.65),transparent 70%);animation:wakePulse 1.5s ease-in-out infinite"></div>
    </div>`
  }), []);
  return <Marker position={position} icon={icon} zIndexOffset={1000} />;
}

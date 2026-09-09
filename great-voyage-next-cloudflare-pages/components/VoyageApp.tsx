"use client";

import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import gsap from "gsap";
import { Compass, MapPin, RotateCcw, ScrollText, Search, Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react";
import type L from "leaflet";
import {
  CONFIG, type LatLng, type MediaRecord, fetchMedia, fetchJsonWithFallback,
  haversineDistance, interpolateGreatCircle, normalizeString, uniqueMedia
} from "@/lib/voyage";

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });

type Feature = { type: "Feature"; properties?: Record<string,string>; geometry: unknown };
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

export default function VoyageApp() {
  const [loading, setLoading] = useState(true);
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [countries, setCountries] = useState<Feature[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [selectedCenter, setSelectedCenter] = useState<LatLng | null>(null);
  const [ship, setShip] = useState<LatLng>(CONFIG.MAP_CENTER);
  const [route, setRoute] = useState<LatLng[]>([]);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [voyages, setVoyages] = useState(0);
  const [distance, setDistance] = useState(0);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [journal, setJournal] = useState<MediaRecord[]>([]);
  const [discovery, setDiscovery] = useState<MediaRecord[]>([]);
  const [discoveryIndex, setDiscoveryIndex] = useState(0);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voyageRaf = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3400);
  }, []);

  useEffect(() => {
    const start = performance.now();
    const load = async () => {
      try {
        const data = await fetchJsonWithFallback([CONFIG.GEOJSON_URL, CONFIG.GEOJSON_FALLBACK_URL]) as FeatureCollection;
        setGeojson(data);
        setCountries(data.features.filter(f => f.properties));
      } catch {
        notify("The ancient country charts could not be restored.");
      }

      const results = await Promise.allSettled([fetchMedia("image"), fetchMedia("video")]);
      const media = uniqueMedia(results.flatMap(r => r.status === "fulfilled" ? r.value : []));
      setJournal(media.slice(0, CONFIG.JOURNAL_LIMIT));

      const wait = Math.max(0, 2800 - (performance.now() - start));
      setTimeout(() => setLoading(false), wait);
    };
    load();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [notify]);

  useEffect(() => {
    if (!rootRef.current || loading) return;
    const cards = rootRef.current.querySelectorAll(".journal-card");
    if (!cards.length) return;
    gsap.fromTo(cards, { y: 42, opacity: 0, rotate: (i) => i % 2 ? 1.5 : -1.5 }, {
      y: 0, opacity: 1, rotate: (i) => i % 2 ? .55 : -.7,
      duration: .9, stagger: .1, ease: "power3.out"
    });
  }, [journal, loading]);

  const openDiscovery = useCallback(async (name: string) => {
    setSelectedName(name);
    setArchivesLoading(true);
    setDiscovery([]);
    setDiscoveryIndex(0);
    try {
      const results = await Promise.allSettled([fetchMedia("image", name), fetchMedia("video", name)]);
      setDiscovery(uniqueMedia(results.flatMap(r => r.status === "fulfilled" ? r.value : [])));
    } catch {
      notify("The archive could not be opened.");
    } finally {
      setArchivesLoading(false);
    }
  }, [notify]);

  const startVoyage = useCallback((center: LatLng) => {
    if (voyageRaf.current) cancelAnimationFrame(voyageRaf.current);
    const start = ship;
    const end = center;
    const km = haversineDistance(start, end);
    if (km < 1) return;

    setVoyages(v => v + 1);
    setDistance(d => d + km);
    setDestination(end);

    const started = performance.now();
    const duration = Math.min(7000, Math.max(2500, km * 3.5));

    const tick = (now: number) => {
      const raw = Math.min((now - started) / duration, 1);
      const t = raw < .5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      const position = interpolateGreatCircle(start, end, t);
      setShip(position);
      const points = Array.from({ length: Math.max(2, Math.ceil(t * 80)) + 1 }, (_, i) =>
        interpolateGreatCircle(start, end, t * (i / Math.max(1, Math.ceil(t * 80))))
      );
      setRoute(points);
      if (raw < 1) voyageRaf.current = requestAnimationFrame(tick);
      else voyageRaf.current = null;
    };
    voyageRaf.current = requestAnimationFrame(tick);
  }, [ship]);

  const selectCountry = useCallback((name: string, center: L.LatLng) => {
    const latlng = { lat: center.lat, lng: center.lng };
    setSelectedCenter(latlng);
    openDiscovery(name);
    startVoyage(latlng);
  }, [openDiscovery, startVoyage]);

  const doSearch = () => {
    const query = normalizeString(search);
    if (!query) return;
    const match = countries.find(c => {
      const name = String(c.properties?.NAME || c.properties?.NAME_EN || c.properties?.ADMIN || "");
      return normalizeString(name) === query;
    }) || countries.find(c => {
      const name = String(c.properties?.NAME || c.properties?.NAME_EN || c.properties?.ADMIN || "");
      return normalizeString(name).includes(query);
    });
    if (!match) return notify("No kingdom bearing that name was found in the charts.");
    const geo = (window as typeof window & { L?: typeof import("leaflet") }).L;
    if (!geo) return notify("The cartography engine is still awakening.");
    const center = geo.geoJSON(match as never).getBounds().getCenter();
    selectCountry(String(match.properties?.NAME || match.properties?.NAME_EN || match.properties?.ADMIN), center);
  };

  const reset = () => {
    if (voyageRaf.current) cancelAnimationFrame(voyageRaf.current);
    setShip(CONFIG.MAP_CENTER);
    setRoute([]);
    setDestination(null);
    setSelectedName("");
    setSelectedCenter(null);
    setDiscovery([]);
    setVoyages(0);
    setDistance(0);
    setSearch("");
  };

  const currentMedia = discovery[discoveryIndex];

  return (
    <div ref={rootRef} className="min-h-screen">
      <AnimatePresence>
        {loading && <Loader />}
      </AnimatePresence>

      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: loading ? 0 : 1 }}
        transition={{ duration: .8, ease: [0.22,1,0.36,1] }}
        className="relative z-50 flex min-h-[86px] items-center justify-between gap-5 border-b-[3px] border-[#8c5c23] bg-gradient-to-b from-[#2e190c] to-[#1c0e07] px-4 py-3 md:px-8"
      >
        <div className="flex items-center gap-3">
          <motion.div animate={reduceMotion ? {} : { rotate: [ -3, 3, -3 ], y: [0,-3,0] }} transition={{ duration: 4, repeat: Infinity }} className="grid h-12 w-12 place-items-center rounded-full border border-[#dcb054]/60 text-[#e9c574] shadow-[0_0_0_5px_rgba(215,169,78,.07),0_0_15px_rgba(215,169,78,.15)]">
            <Compass size={32} />
          </motion.div>
          <div>
            <h1 className="font-uncial text-[22px] leading-none text-[#f1d58f] md:text-[31px]">The Great Voyage</h1>
            <p className="mt-1 text-[9px] uppercase tracking-[2px] text-[#b89458] md:text-xs">Chronicles of an Ancient Adventurer</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[#b89458] md:flex">
          <Sparkles size={15} />
          <span className="font-cinzel text-[10px] tracking-[2px]">A CHARTED FUTURE FROM AN UNCERTAIN PAST</span>
        </div>
      </motion.header>

      <main className="mx-auto w-full max-w-[1700px] px-3 pb-16 pt-5 md:px-7 md:pt-8">
        <section className="ancient-panel mb-5 flex flex-wrap items-center gap-3 p-3 [clip-path:polygon(0_8px,7px_0,22%_4px,45%_0,68%_5px,90%_0,100%_7px,99%_93%,91%_100%,68%_96%,45%_100%,20%_96%,0_100%)] md:p-4">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6e471f]" size={20} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doSearch(); if (e.key === "Escape") setSearch(""); }}
              placeholder="Search a kingdom, nation or distant land..."
              className="min-h-[45px] w-full border-2 border-[#6c461f] bg-gradient-to-b from-[#f4e4b9] to-[#d4b675] pl-11 pr-4 text-[#2d1a0c] outline-none placeholder:text-[#76552f] focus:border-[#b37c2b] focus:ring-4 focus:ring-[#d8aa50]/20"
            />
          </div>
          <button className="ancient-btn flex items-center justify-center gap-2" onClick={reset}><RotateCcw size={15}/> Reset Voyage</button>
          <button className="ancient-btn flex items-center justify-center gap-2" onClick={() => { setJournalOpen(true); document.getElementById("journal")?.scrollIntoView({ behavior: "smooth" }); }}><ScrollText size={15}/> Expedition Journal</button>
        </section>

        <section className="relative border-[4px] border-[#170b05] bg-gradient-to-br from-[#2b160b] via-[#875c29] to-[#2d160b] p-3 shadow-[0_15px_45px_rgba(0,0,0,.48),0_0_0_2px_#b1823c]">
          <div className="pointer-events-none absolute inset-[5px] z-20 border border-[#f5d07c]/50" />
          <div className="relative h-[58dvh] min-h-[430px] overflow-hidden border-[5px] border-[#d0aa63] bg-[#102f35] shadow-[inset_0_0_70px_rgba(0,0,0,.5)] md:h-[72dvh]">
            <MapCanvas geojson={geojson} selectedName={selectedName} onCountryClick={selectCountry} ship={[ship.lat, ship.lng]} route={route.map(p => [p.lat,p.lng])} destination={destination ? [destination.lat,destination.lng] : null} />

            <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] grid grid-cols-3 gap-1.5 md:left-7 md:right-auto">
              <Hud label="Lands Charted" value={countries.length.toLocaleString()} />
              <Hud label="Voyages" value={voyages.toLocaleString()} />
              <Hud label="Distance" value={`${Math.round(distance).toLocaleString()} km`} />
            </div>

            <div className="pointer-events-none absolute right-6 top-6 z-[500] hidden h-[125px] w-[125px] md:block">
              <div className="absolute inset-0 rounded-full border-2 border-[#ebc26c]/75 shadow-[0_0_0_7px_rgba(58,31,12,.25),0_0_25px_rgba(214,170,76,.16)] animate-[spin_35s_linear_infinite]" />
              <div className="absolute inset-[13px] rounded-full border border-dashed border-[#f0cc7d]/70 animate-[spinReverse_24s_linear_infinite]" />
              <div className="absolute inset-[31px] rounded-full border-2 border-[#e1b85e]/65" />
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-cinzel font-bold text-[#e5c379]">N</span>
              <span className="absolute -right-5 top-1/2 -translate-y-1/2 font-cinzel font-bold text-[#e5c379]">E</span>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-cinzel font-bold text-[#e5c379]">S</span>
              <span className="absolute -left-5 top-1/2 -translate-y-1/2 font-cinzel font-bold text-[#e5c379]">W</span>
            </div>

            <AnimatePresence>
              {(selectedName || archivesLoading) && (
                <Discovery
                  name={selectedName}
                  loading={archivesLoading}
                  media={currentMedia}
                  index={discoveryIndex}
                  count={discovery.length}
                  onClose={() => { setSelectedName(""); setDiscovery([]); }}
                  onPrev={() => setDiscoveryIndex(i => discovery.length ? (i - 1 + discovery.length) % discovery.length : 0)}
                  onNext={() => setDiscoveryIndex(i => discovery.length ? (i + 1) % discovery.length : 0)}
                />
              )}
            </AnimatePresence>
          </div>
        </section>

        <section id="journal" className="relative mt-10 overflow-hidden border-4 border-[#1b0d06] bg-gradient-to-br from-[#59391e] via-[#26140a] to-[#1b0d06] px-3 py-8 shadow-[0_15px_45px_rgba(0,0,0,.48),inset_0_0_0_2px_#a77635] md:px-5 md:py-10">
          <div className="relative z-10 mb-7 text-center">
            <div className="mb-2 text-xs tracking-[4px] text-[#d8ac59]">✦ ──────── ✧ ──────── ✦</div>
            <h2 className="font-uncial text-4xl text-[#f1d695] drop-shadow-[0_3px_8px_rgba(0,0,0,.7)] md:text-5xl">Expedition Journal</h2>
            <p className="mt-2 text-[#b99762] italic">Fragments, visions and records gathered from distant shores</p>
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {journal.length ? journal.map((item, i) => <JournalCard key={item.url} item={item} index={i} />) :
              <div className="col-span-full border border-dashed border-[#d0a650]/45 bg-[#160c07]/45 p-12 text-center text-[#caa96d]"><strong className="block font-cinzel text-[#e8ca86]">Opening the expedition archives...</strong>Please wait while the old records are restored.</div>}
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-[#4c2d15] bg-[#170b05] px-5 py-9 text-center text-xs text-[#a17c48]">
        <span className="mb-2 block tracking-[8px] text-[#c79643]">✦ ✧ ✦ ✧ ✦</span>
        The Great Voyage · Cartography of the Known World
      </footer>

      <AnimatePresence>
        {toast && <motion.div initial={{ opacity:0, y:25 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:25 }} className="fixed bottom-5 right-5 z-[5000] max-w-[390px] border border-[#ae7b30] bg-gradient-to-br from-[#2e190c]/95 to-[#140a05]/95 px-4 py-3 text-[#f1d9a2] shadow-2xl">{toast}</motion.div>}
      </AnimatePresence>

      {journalOpen && <span className="sr-only">Expedition journal opened</span>}
    </div>
  );
}

function Loader() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: .9 }}
      className="fixed inset-0 z-[10000] grid place-items-center bg-[radial-gradient(circle_at_center,rgba(82,52,25,.25),transparent_42%),linear-gradient(135deg,#110803,#2a170b,#100704)]"
    >
      <motion.div
        initial={{ opacity: 0, scale: .75, rotate: -2, y: 40 }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        transition={{ duration: 1.1, ease: [0.22,1,0.36,1] }}
        className="relative flex min-h-[420px] w-[min(700px,90vw)] flex-col items-center justify-center px-6 py-14 text-center shadow-[0_30px_80px_rgba(0,0,0,.7),inset_0_0_60px_rgba(72,38,13,.35)] [clip-path:polygon(2%_4%,7%_1%,15%_4%,24%_2%,35%_5%,46%_2%,57%_5%,69%_1%,81%_4%,93%_2%,98%_7%,96%_17%,99%_29%,96%_42%,99%_55%,96%_70%,99%_83%,94%_97%,82%_94%,70%_98%,57%_95%,45%_98%,33%_95%,20%_98%,7%_94%,2%_97%,4%_84%,1%_72%,4%_57%,1%_44%,4%_30%,1%_16%)] bg-[linear-gradient(90deg,#9e7545,#ead09a_8%,#f1dfad_50%,#d6b777_92%,#8e6337)]"
      >
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 7, repeat: Infinity, ease: "linear" }} className="relative mb-6 grid h-32 w-32 place-items-center rounded-full border-2 border-[#79501f]/70 shadow-[0_0_25px_rgba(216,170,80,.3)]">
          <div className="absolute inset-3 rounded-full border border-dashed border-[#806026] animate-[spinReverse_8s_linear_infinite]" />
          <div className="absolute inset-8 rounded-full border-2 border-[#b77f2c]/60" />
          <div className="text-5xl text-[#6a4218]">✦</div>
        </motion.div>
        <h1 className="font-uncial text-4xl text-[#4a2b13] md:text-6xl">The Great Voyage</h1>
        <p className="mb-8 mt-2 text-lg italic text-[#6b4828]">Unfolding the mysteries of the ancient world...</p>
        <div className="h-3 w-[min(430px,75vw)] border-2 border-[#7b511e] bg-[#2c190c]">
          <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 2.5, ease: "linear" }} className="h-full bg-gradient-to-r from-[#7e5119] via-[#ffe2a0] to-[#b87922] shadow-[0_0_12px_rgba(255,204,98,.7)]" />
        </div>
        <p className="mt-4 text-sm tracking-[1px] text-[#6b4828]">Consulting the old charts...</p>
      </motion.div>
    </motion.div>
  );
}

function Hud({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-gradient-to-b from-[#28170c]/95 to-[#170c07]/95 px-2 py-2 text-center text-[#f1d594] shadow-lg backdrop-blur md:min-w-[105px] md:px-3">
      <span className="block font-cinzel text-[7px] uppercase tracking-[1px] text-[#a98249] md:text-[9px]">{label}</span>
      <span className="mt-0.5 block font-cinzel text-xs font-bold md:text-base">{value}</span>
    </div>
  );
}

function Discovery({
  name, loading, media, index, count, onClose, onPrev, onNext
}: {
  name: string; loading: boolean; media?: MediaRecord; index: number; count: number;
  onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  return (
    <motion.aside
      initial={{ opacity:0, scale:.94, y:10 }}
      animate={{ opacity:1, scale:1, y:0 }}
      exit={{ opacity:0, scale:.96, y:10 }}
      transition={{ duration:.35 }}
      className="absolute bottom-3 left-3 right-3 z-[900] max-h-[70vh] overflow-auto border border-[#5de5ff]/80 bg-gradient-to-br from-[#08161c]/95 to-[#0b2028]/95 p-2 text-[#dffcff] shadow-[0_0_0_1px_rgba(171,111,255,.35),0_0_25px_rgba(64,219,255,.2),0_15px_45px_rgba(0,0,0,.5)] backdrop-blur md:bottom-auto md:left-auto md:right-5 md:top-5 md:w-[360px]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-cinzel text-sm uppercase tracking-[1px] text-[#c9f9ff]">{name || "Unknown Land"}</h2>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center border border-[#5be2ff]/45 bg-black/30 text-[#9befff]"><X size={15}/></button>
      </div>
      <div className="relative mt-2 flex h-[210px] items-center justify-center overflow-hidden border border-[#62e2ff]/50 bg-[#031015]">
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_5px,rgba(94,230,255,.04)_6px_7px)] animate-[scan_5s_linear_infinite]" />
        {loading ? <motion.div animate={{ opacity:[.35,1,.35] }} transition={{ duration:1.5, repeat:Infinity }} className="font-cinzel text-xs text-[#73eaff]">✦ Summoning records ✦</motion.div> :
          media ? (media.type === "video" ? <video controls playsInline preload="metadata" src={media.url} className="relative z-10 h-full w-full object-contain" /> : <img src={media.url} alt={media.title} className="relative z-10 h-full w-full object-contain" />) :
          <div className="px-5 text-center text-xs text-[#91cbd4]">✦<br/><br/>No records were found for this land.</div>}
      </div>
      <div className="px-1 pt-2">
        <h3 className="font-cinzel text-xs text-[#e5fbff]">{media?.title || (loading ? "Consulting the expedition archives..." : "No record discovered")}</h3>
        <p className="mt-1 line-clamp-2 text-[11px] text-[#91c9d2]">{media?.description || "Ancient records are being retrieved."}</p>
      </div>
      <div className="mt-2 flex justify-center gap-2">
        <button disabled={count < 2} onClick={onPrev} className="grid h-8 w-9 place-items-center border border-[#62e3ff]/45 bg-[#184c56]/65 disabled:opacity-40"><ChevronLeft size={15}/></button>
        <span className="self-center font-cinzel text-[9px] text-[#82dce8]">{count ? `${index+1} / ${count}` : "—"}</span>
        <button disabled={count < 2} onClick={onNext} className="grid h-8 w-9 place-items-center border border-[#62e3ff]/45 bg-[#184c56]/65 disabled:opacity-40"><ChevronRight size={15}/></button>
      </div>
    </motion.aside>
  );
}

function JournalCard({ item, index }: { item: MediaRecord; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: .2 }}
      whileHover={{ y: -9, rotate: 0, scale: 1.015 }}
      transition={{ duration: .55, delay: index * .06 }}
      className={`journal-card relative min-w-0 overflow-visible border-2 border-[#583619] bg-gradient-to-br from-[#c49b60] via-[#ebd49b] to-[#a57a43] p-3 shadow-[0_13px_30px_rgba(0,0,0,.42),inset_0_0_0_3px_rgba(255,225,156,.23)] ${index % 2 ? "rotate-[.55deg]" : "-rotate-[.7deg]"}`}
    >
      <div className="pointer-events-none absolute -left-1 -right-1 -top-3 h-6 rounded-[45%] border border-[#4d2c15] bg-gradient-to-b from-[#9a6d39] via-[#e4c88c] to-[#70451f] shadow-md" />
      <div className="pointer-events-none absolute -bottom-3 -left-1 -right-1 h-6 rounded-[45%] border border-[#4d2c15] bg-gradient-to-b from-[#a37541] via-[#e4c88c] to-[#6d431f] shadow-md" />
      <div className="relative overflow-hidden border-[3px] border-[#d2a44e] bg-[#080e10] p-3 shadow-[0_0_0_2px_#5c391b,0_0_0_5px_rgba(237,203,130,.18),0_0_18px_rgba(73,215,229,.12)]">
        <span className="pointer-events-none absolute left-1 top-0 z-20 text-lg text-[#ffe29b]">✦</span>
        <span className="pointer-events-none absolute bottom-0 right-1 z-20 text-lg text-[#ffe29b]">✧</span>
        <div className="relative h-[220px] overflow-hidden bg-[#081013] md:h-[255px]">
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-1/3 bg-gradient-to-b from-transparent via-[#69ebef]/10 to-transparent animate-[scan_5s_linear_infinite]" />
          {item.type === "video" ? <video controls preload="metadata" playsInline src={item.url} className="h-full w-full object-contain transition-transform duration-700 group-hover:scale-[1.025]" /> :
            <img loading="lazy" src={item.url} alt={item.title} className="h-full w-full object-contain transition-transform duration-700 hover:scale-[1.025]" />}
        </div>
      </div>
      <div className="px-1 pb-1 pt-4">
        <h3 className="font-cinzel text-sm leading-tight text-[#4a2c15]">{item.title}</h3>
        <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-[#6a4726]">{item.description || "A fragment preserved within the expedition chronicles."}</p>
        <span className="mt-2 inline-flex border border-[#66431d]/50 bg-[#ffe4a1]/35 px-2 py-1 font-cinzel text-[8px] font-bold tracking-[1px] text-[#6a431d]">{item.type === "video" ? "MOVING RECORD" : "ILLUSTRATED RECORD"}</span>
      </div>
    </motion.article>
  );
}

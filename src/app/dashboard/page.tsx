"use client";

import { useEffect, useRef, useState } from "react";
import { Map, MapControls, useMap } from "@/components/ui/map";
import maplibregl from "maplibre-gl";
import Link from "next/link";
import { AlertTriangle, Map as MapIcon, Activity, ZapOff, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import * as turf from "@turf/turf";
import { ThemeToggle } from "@/components/theme-toggle";

const GEOJSON_URL = "https://raw.githubusercontent.com/ardian28/GeoJson-Indonesia-38-Provinsi/main/Kabupaten/38%20Provinsi%20Indonesia%20-%20Kabupaten.json";

function ChoroplethLayers({ geojsonData, setHoverInfo }: { geojsonData: any, setHoverInfo: (info: any) => void }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded || !geojsonData) return;

    const sourceId = 'indonesia-boundaries';

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojsonData,
        generateId: true
      });
    } else {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojsonData);
    }

    // Fill Layer
    if (!map.getLayer('city-fills')) {
      map.addLayer({
        id: 'city-fills',
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': [
            'case',
            // Shade RED if there are recent (1hr) mati reports
            ['>', ['get', 'recentMatiCount'], 0], [
              'interpolate', ['linear'], ['get', 'recentMatiCount'],
              1, 'rgba(255, 84, 81, 0.3)',
              5, 'rgba(255, 84, 81, 0.6)',
              15, 'rgba(255, 84, 81, 0.9)'
            ],
            // Default state: Safe (Green)
            'rgba(74, 225, 118, 0.15)'
          ],
          'fill-outline-color': 'transparent'
        }
      }, 'waterway');
    }

    // Border Layer
    if (!map.getLayer('city-borders')) {
      map.addLayer({
        id: 'city-borders',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(255, 255, 255, 1)',
            'rgba(100, 100, 100, 0.3)'
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            2,
            0.5
          ]
        }
      });
    }

    let hoveredStateId: string | number | null = null;

    const handleMouseMove = (e: any) => {
      if (e.features.length > 0) {
        if (hoveredStateId !== null && hoveredStateId !== undefined) {
          map.setFeatureState({ source: sourceId, id: hoveredStateId }, { hover: false });
        }
        hoveredStateId = e.features[0].id;
        if (hoveredStateId !== null && hoveredStateId !== undefined) {
          map.setFeatureState({ source: sourceId, id: hoveredStateId }, { hover: true });
        }

        const props = e.features[0].properties;

        setHoverInfo({
          x: e.point.x,
          y: e.point.y,
          cityName: props.WADMKK,
          province: props.WADMPR,
          counts: {
            mati: props.matiCount || 0
          }
        });
      }
    };

    const handleMouseLeave = () => {
      if (hoveredStateId !== null) {
        map.setFeatureState({ source: sourceId, id: hoveredStateId }, { hover: false });
      }
      hoveredStateId = null;
      setHoverInfo(null);
    };

    map.on('mousemove', 'city-fills', handleMouseMove);
    map.on('mouseleave', 'city-fills', handleMouseLeave);

    return () => {
      map.off('mousemove', 'city-fills', handleMouseMove);
      map.off('mouseleave', 'city-fills', handleMouseLeave);
      try {
        if (map.getStyle()) {
          if (map.getLayer('city-borders')) map.removeLayer('city-borders');
          if (map.getLayer('city-fills')) map.removeLayer('city-fills');
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        }
      } catch (e) { }
    };
  }, [map, isLoaded, geojsonData]);

  return null;
}

export default function DashboardPage() {
  const mapRef = useRef<maplibregl.Map>(null);
  const [currentDate, setCurrentDate] = useState("");
  const [hoverInfo, setHoverInfo] = useState<any>(null);

  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [totalSemuaLaporan, setTotalSemuaLaporan] = useState(0);
  const [totalHariIni, setTotalHariIni] = useState(0);
  const [total1JamLalu, setTotal1JamLalu] = useState(0);

  useEffect(() => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } as const;
    setCurrentDate(new Date().toLocaleDateString('id-ID', options));

    const loadData = async () => {
      try {
        setIsLoadingData(true);

        // 1. Fetch GeoJSON
        const res = await fetch(GEOJSON_URL);
        const geojson = await res.json();

        geojson.features.forEach((poly: any) => {
          poly.properties.matiCount = 0;
          poly.properties.nyalaCount = 0;
          poly.properties.recentMatiCount = 0;
          poly.properties.recentNyalaCount = 0;
        });

        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
          setErrorMsg("Supabase URL belum dikonfigurasi.");
          setGeojsonData(geojson);
          return;
        }

        // 2a. Fetch total all-time reports count
        const { count: totalSemuaCount } = await supabase
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'mati');

        // 2b. Fetch all reports today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: allReportsToday, error } = await supabase
          .from('reports')
          .select('*')
          .eq('status', 'mati')
          .gte('created_at', startOfDay.toISOString());

        if (error) throw error;

        let hariIniCount = allReportsToday?.length || 0;
        let satuJamCount = 0;

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).getTime();

        if (allReportsToday) {
          allReportsToday.forEach((r: any) => {
            if (new Date(r.created_at).getTime() >= oneHourAgo) {
              satuJamCount++;
            }
          });
        }

        setTotalSemuaLaporan(totalSemuaCount || 0);
        setTotalHariIni(hariIniCount);
        setTotal1JamLalu(satuJamCount);

        // 3. Turf aggregation
        if (allReportsToday && allReportsToday.length > 0) {
          const points = turf.featureCollection(
            allReportsToday.map((r: any) => turf.point([r.lng, r.lat], {
              status: r.status,
              recent: new Date(r.created_at).getTime() >= oneHourAgo // ✅ flag for shading only
            }))
          );

          geojson.features.forEach((poly: any) => {
            if (poly.geometry && (poly.geometry.type === "Polygon" || poly.geometry.type === "MultiPolygon")) {
              try {
                const ptsWithin = turf.pointsWithinPolygon(points, poly);

                let mati = 0;        // all-day count (for tooltip)
                let recentMati = 0;  // 1-hr count (for shading)

                ptsWithin.features.forEach(pt => {
                  if (pt.properties.status === 'mati') {
                    mati++;
                    if (pt.properties.recent) recentMati++;
                  }
                });

                poly.properties.matiCount = mati;
                poly.properties.recentMatiCount = recentMati;   // ✅ drives shading
              } catch (e) {
                console.warn("Skipping invalid polygon:", poly.properties.WADMKK);
              }
            }
          });
        }

        setGeojsonData(geojson);
      } catch (err: any) {
        console.error("Error loading data:", err);
        setErrorMsg("Gagal memuat data laporan.");
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex-col hidden md:flex z-20 shadow-xl">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="Blackout Tracker Logo" className="w-10 h-10 rounded-xl shadow-md border border-border/50" />
            <h1 className="text-xl font-bold text-primary">Blackout Tracker</h1>
          </div>
          <p className="text-sm text-muted-foreground">Indonesia Grid Monitor</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 text-primary font-semibold">
            <MapIcon className="w-5 h-5" />
            Live Map
          </Link>
          <Link href="/report" className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-accent transition-colors">
            <AlertTriangle className="w-5 h-5" />
            Submit Report
          </Link>
        </nav>
        <div className="p-4 border-t border-border flex justify-center">
          <ThemeToggle />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border z-20">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-lg shadow-sm border border-border/50" />
            <span className="font-bold text-primary">Blackout Tracker</span>
          </div>
          <ThemeToggle />
        </header>

        {/* Map Container */}
        <div className="flex-1 relative z-0">
          <Map
            ref={mapRef}
            center={[113.9213, -0.7893]} // Center of Indonesia
            zoom={4.5}
            className="absolute inset-0"
          >
            <MapControls position="bottom-right" showZoom showLocate />
            {geojsonData && <ChoroplethLayers geojsonData={geojsonData} setHoverInfo={setHoverInfo} />}
          </Map>

          {isLoadingData && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 bg-card p-6 rounded-xl shadow-2xl border border-border/50">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm font-semibold">Menganalisis Data Area...</p>
              </div>
            </div>
          )}

          {/* Interactive Tooltip over the Map */}
          {hoverInfo && (
            <div
              className="absolute z-50 pointer-events-none bg-card/90 backdrop-blur-md border border-border/50 shadow-xl rounded-xl p-4 min-w-[200px]"
              style={{
                left: hoverInfo.x + 15,
                top: hoverInfo.y + 15,
                transform: `translate(${hoverInfo.x > window.innerWidth - 250 ? '-100%' : '0'}, ${hoverInfo.y > window.innerHeight - 200 ? '-100%' : '0'})`
              }}
            >
              <h3 className="font-bold text-foreground text-lg leading-tight">{hoverInfo.cityName}</h3>
              <p className="text-xs text-muted-foreground mb-3">{hoverInfo.province}</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_5px_rgba(255,84,81,0.8)]"></div>
                    <span className="text-sm font-medium text-foreground">Laporan Padam Hari Ini</span>
                  </div>
                  <span className="text-sm font-bold text-primary">{hoverInfo.counts.mati}</span>
                </div>
              </div>
            </div>
          )}

          {/* Stats Overlay */}
          <div className="absolute top-0 left-0 right-0 p-4 md:p-6 pointer-events-none z-10 flex flex-col items-center">
            {errorMsg && (
              <div className="mb-4 bg-destructive/10 border border-destructive/50 text-destructive text-sm px-4 py-2 rounded-lg pointer-events-auto">
                {errorMsg}
              </div>
            )}

            {/* Header / Live Indicator */}
            <div className="flex items-center justify-between w-full max-w-4xl mb-4 bg-card/80 backdrop-blur-md border border-border/50 rounded-xl p-3 px-5 shadow-lg pointer-events-auto">
              <div className="text-sm font-semibold text-foreground/80">{currentDate || "Memuat tanggal..."}</div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                <span className="text-sm font-bold text-primary uppercase tracking-wider">Live</span>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-3 gap-2 md:gap-4 w-full max-w-4xl pointer-events-auto">
              <div className="bg-card/90 backdrop-blur-md border border-border/50 rounded-xl p-2 md:p-4 shadow-lg flex flex-col md:flex-row items-center text-center md:text-left gap-1 md:gap-4 transition-transform hover:scale-[1.02]">
                <div className="w-6 h-6 md:w-12 md:h-12 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <Activity className="w-3 h-3 md:w-6 md:h-6 text-foreground" />
                </div>
                <div className="w-full">
                  <div className="text-[9px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">Semua Laporan</div>
                  <div className="text-sm md:text-2xl font-bold text-foreground leading-tight">{totalSemuaLaporan.toLocaleString('id-ID')}</div>
                </div>
              </div>

              <div className="bg-card/90 backdrop-blur-md border border-border/50 rounded-xl p-2 md:p-4 shadow-lg flex flex-col md:flex-row items-center text-center md:text-left gap-1 md:gap-4 transition-transform hover:scale-[1.02]">
                <div className="w-6 h-6 md:w-12 md:h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <ZapOff className="w-3 h-3 md:w-6 md:h-6 text-primary" />
                </div>
                <div className="w-full">
                  <div className="text-[9px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">Padam Hari Ini</div>
                  <div className="text-sm md:text-2xl font-bold text-primary leading-tight">{totalHariIni.toLocaleString('id-ID')}</div>
                </div>
              </div>

              <div className="bg-card/90 backdrop-blur-md border border-border/50 rounded-xl p-2 md:p-4 shadow-lg flex flex-col md:flex-row items-center text-center md:text-left gap-1 md:gap-4 transition-transform hover:scale-[1.02]">
                <div className="w-6 h-6 md:w-12 md:h-12 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-3 h-3 md:w-6 md:h-6 text-destructive" />
                </div>
                <div className="w-full">
                  <div className="text-[9px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">Padam 1 Jam Lalu</div>
                  <div className="text-sm md:text-2xl font-bold text-destructive leading-tight">{total1JamLalu.toLocaleString('id-ID')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden bg-card border-t border-border flex justify-around items-center min-h-16 py-2 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-20">
          <Link href="/report" className="flex flex-col items-center justify-center text-muted-foreground hover:bg-accent rounded-full px-6 py-1 transition-all">
            <AlertTriangle className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-semibold">Report</span>
          </Link>
          <Link href="/dashboard" className="flex flex-col items-center justify-center text-primary bg-primary/10 transition-all px-6 py-1 rounded-full">
            <MapIcon className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-semibold">Map</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}

function ZapOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.41 6.75L13 2l-2.43 2.92" />
      <path d="M18.57 12.91L21 10h-5.34" />
      <path d="M8 8l-5 6h9l-1 8 5-6" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

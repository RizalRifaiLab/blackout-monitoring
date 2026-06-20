"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from '@marsidev/react-turnstile';
import { supabase } from "@/lib/supabase";
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { submitReportAction } from "@/app/actions/submitReport";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  ZapOff, 
  Home, 
  CheckCircle, 
  LightbulbOff, 
  Lightbulb, 
  MapPin, 
  Locate, 
  Camera, 
  Send, 
  AlertTriangle, 
  Map as MapIcon, 
  Loader2,
  XCircle
} from "lucide-react";
import Link from "next/link";

export default function ReportPage() {
  const [status, setStatus] = useState<"mati" | "nyala">("mati");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Permissions Gate State
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  // Camera State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [photoValidated, setPhotoValidated] = useState(false);
  const [validationMsg, setValidationMsg] = useState("");

  const startCamera = async () => {
    setCameraActive(true);
    setValidationMsg("");
    setPhotoValidated(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access denied", err);
      setValidationMsg("Akses kamera ditolak. Izinkan browser menggunakan kamera.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setAnalyzing(true);
    setValidationMsg("Menganalisis foto...");

    const video = videoRef.current;
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setValidationMsg("Kamera sedang memuat, mohon tunggu sebentar...");
      setAnalyzing(false);
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Draw image to hidden canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // STAGE 1: Fast Brightness Check (Rule-Based)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let totalBrightness = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
      totalBrightness += brightness;
    }
    
    const avgBrightness = totalBrightness / (canvas.width * canvas.height);

    let prediction = "UNCERTAIN";
    if (avgBrightness < 40) prediction = "BLACKOUT";
    else if (avgBrightness > 80) prediction = "POWER_UP";

    // STAGE 2: ML Fallback via MobileNet
    if (prediction === "UNCERTAIN") {
      setValidationMsg("Tahap 2: AI Menganalisis...");
      try {
        await tf.ready();
        // Load lightweight mobilenet model
        const model = await mobilenet.load({ version: 2, alpha: 0.5 });
        const predictions = await model.classify(canvas);
        
        // Look for light sources or standard objects
        const lightKeywords = ['candle', 'torch', 'lighter', 'match', 'flashlight', 'spotlight', 'lamp'];
        const topPreds = predictions.map(p => p.className.toLowerCase());
        
        const hasLightSource = lightKeywords.some(keyword => topPreds.some(pred => pred.includes(keyword)));
        if (hasLightSource) {
          prediction = "BLACKOUT"; // Localized light source in a dark room implies blackout
        } else {
          prediction = "POWER_UP"; // Detailed objects visible implies sufficient lighting
        }
      } catch (e) {
        console.error("ML Error", e);
        prediction = avgBrightness < 60 ? "BLACKOUT" : "POWER_UP"; // fallback
      }
    }

    // Final Validation Check against User Input
    if (status === 'mati' && prediction === 'POWER_UP') {
      setValidationMsg("Foto Ditolak: Lingkungan terlihat terang, tetapi Anda melaporkan 'Mati Lampu'.");
      setPhotoValidated(false);
    } else if (status === 'nyala' && prediction === 'BLACKOUT') {
      setValidationMsg("Foto Ditolak: Lingkungan terlihat gelap, tetapi Anda melaporkan 'Lampu Nyala'.");
      setPhotoValidated(false);
    } else {
      setValidationMsg("Verifikasi Visual Berhasil!");
      setPhotoValidated(true);
      stopCamera();
    }

    setAnalyzing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location || !captchaToken || !photoValidated) return;

    setLoading(true);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      alert("Supabase URL belum dikonfigurasi. Harap setup .env.local terlebih dahulu.");
      setLoading(false);
      return;
    }

    try {
      const result = await submitReportAction(
        status,
        location.lat,
        location.lng,
        "",
        captchaToken
      );

      if (!result.success) {
        alert(result.error);
        setLoading(false);
        return;
      }

      setSuccess(true);
      // Reset form states
      setPhotoValidated(false);
      setValidationMsg("");
      window.scrollTo(0, 0);
    } catch (error: any) {
      console.error("Error submitting report:", error);
      alert(error.message || "Gagal mengirim laporan.");
    } finally {
      setLoading(false);
    }
  };

  const handleGetLocation = () => {
    setLocationLoading(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationLoading(false);
        },
        (error) => {
          console.error("Error getting location", error);
          alert("Gagal mendapatkan lokasi. Pastikan izin lokasi diberikan.");
          setLocationLoading(false);
        }
      );
    } else {
      alert("Browser Anda tidak mendukung geolokasi.");
      setLocationLoading(false);
    }
  };

  const handleRequestPermissions = async () => {
    setPermissionLoading(true);
    setPermissionError("");
    try {
      // 1. Request Camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.getTracks().forEach(track => track.stop()); // Immediately stop it, we just needed the permission

      // 2. Request Location
      await new Promise((resolve, reject) => {
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
        } else {
          reject(new Error("Geolokasi tidak didukung."));
        }
      });

      setPermissionsGranted(true);
    } catch (error: any) {
      console.error("Permission error", error);
      setPermissionError("Akses ditolak. Mohon klik ikon gembok di URL bar browser Anda, izinkan Kamera & Lokasi, lalu coba lagi.");
    } finally {
      setPermissionLoading(false);
    }
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden pb-20 font-sans">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-background flex justify-between items-center px-4 h-16 border-b border-border/40">
        <div className="flex items-center gap-3">
          <ZapOff className="text-primary w-6 h-6" />
          <h1 className="text-xl font-bold text-primary">Lapor Mati Lampu</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/dashboard" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-accent transition-colors">
            <Home className="text-primary w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Success Dialog */}
      {success && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border shadow-2xl rounded-2xl p-6 w-full max-w-sm text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 rounded-full bg-secondary/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-secondary w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-foreground">Laporan Terkirim!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Terima kasih, informasi Anda telah diteruskan ke tim teknis PLN. Pantau status pemulihan di Live Map.
            </p>
            <button 
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl active:scale-95 transition-transform" 
              onClick={() => {
                setSuccess(false);
                setStatus("mati");
                setLocation(null);
                setCaptchaToken(null);
              }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Main Content Canvas */}
      <main className="pt-24 pb-12 px-4 max-w-md mx-auto min-h-screen">
        {!permissionsGranted ? (
          <div className="flex flex-col items-center justify-center text-center space-y-6 mt-10">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Izin Diperlukan</h2>
              <p className="text-muted-foreground text-sm">
                Untuk mencegah laporan palsu, aplikasi ini membutuhkan akses <b>Lokasi</b> (untuk menandai area pemadaman) dan <b>Kamera</b> (untuk verifikasi visual).
              </p>
            </div>
            
            {permissionError && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm font-medium">
                {permissionError}
              </div>
            )}

            <button 
              onClick={handleRequestPermissions}
              disabled={permissionLoading}
              className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 hover:brightness-110 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70"
            >
              {permissionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {permissionLoading ? "Meminta Izin..." : "Izinkan Akses"}
            </button>
            <p className="text-xs text-muted-foreground/70 italic">
              100% Aman. Data kamera hanya dianalisis di perangkat Anda dan tidak disimpan ke server.
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground">Laporan Baru</h2>
              <p className="text-base text-muted-foreground">Laporkan gangguan listrik di lokasi Anda secara real-time.</p>
            </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Status Toggle */}
          <div className="bg-card/70 backdrop-blur-md border border-border/50 p-4 rounded-xl">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Status Listrik</label>
            <div className="grid grid-cols-2 gap-2 bg-background p-1 rounded-lg">
              <button 
                type="button"
                onClick={() => { setStatus('mati'); setPhotoValidated(false); setValidationMsg(""); }}
                className={`flex items-center justify-center gap-2 py-3 rounded-md transition-all text-sm font-semibold ${status === 'mati' ? 'bg-primary/20 text-primary shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}
              >
                <LightbulbOff className="w-5 h-5" />
                Mati Lampu
              </button>
              <button 
                type="button"
                onClick={() => { setStatus('nyala'); setPhotoValidated(false); setValidationMsg(""); }}
                className={`flex items-center justify-center gap-2 py-3 rounded-md transition-all text-sm font-semibold ${status === 'nyala' ? 'bg-secondary/20 text-secondary shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}
              >
                <Lightbulb className="w-5 h-5" />
                Lampu Nyala
              </button>
            </div>
          </div>

          {/* Location Picker */}
          <div className="bg-card/70 backdrop-blur-md border border-border/50 p-4 rounded-xl">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Lokasi Gangguan</label>
            <div className="relative w-full h-40 rounded-lg overflow-hidden mb-3 bg-accent border border-border/50">
              <div className="absolute inset-0 z-0 opacity-50 bg-[url('https://lh3.googleusercontent.com/aida-public/AB6AXuCkr6Zi5cnLiNoIc-YK_Uw7Qs-Fk_w4foGaL-Hs6NrlYY0OQY7CItEAV5X-uTxCBRGg0nyluQ_YeqmfbhW3xoCF3CwX8E7zXSQFoftHW3p6y8vZFCL079uyzU8FXKxcIooFcW3IMIcAkQ_DLckmUbZKbGrZ3YVW94vLYhiNZIk3_vvE12Rf52cN5Bbvnwodk2b1BELYjxjZtJ-oousNnfEWFmV_H6VAkrC5r7qx23PflfGej0bpH-4du6tIlLZFk-kmKvFU3R0ciHg')] bg-cover bg-center"></div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center animate-pulse">
                  <MapPin className="text-primary w-6 h-6" />
                </div>
              </div>
              {location && (
                <div className="absolute bottom-2 left-2 right-2 bg-background/90 p-2 rounded text-xs text-center border border-border/50 backdrop-blur-sm">
                  Lat: {location.lat.toFixed(4)}, Lng: {location.lng.toFixed(4)}
                </div>
              )}
            </div>
            <button 
              type="button" 
              onClick={handleGetLocation}
              disabled={locationLoading}
              className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-lg text-sm font-semibold text-foreground hover:bg-accent transition-colors active:scale-95 disabled:opacity-50"
            >
              {locationLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Locate className="w-5 h-5" />}
              {location ? "Perbarui Lokasi" : "Tag Lokasi Saya"}
            </button>
          </div>

          {/* Picture Upload / Verification */}
          <div className="bg-card/70 backdrop-blur-md border border-border/50 p-4 rounded-xl">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Verifikasi Visual</label>
            
            {photoValidated ? (
              <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-secondary bg-secondary/10 rounded-xl">
                <CheckCircle className="w-12 h-12 text-secondary mb-2" />
                <span className="text-sm font-semibold text-secondary">{validationMsg}</span>
                <button type="button" onClick={() => setPhotoValidated(false)} className="text-xs text-muted-foreground mt-4 underline">Ulangi Verifikasi</button>
              </div>
            ) : cameraActive ? (
              <div className="relative w-full rounded-xl overflow-hidden bg-black flex flex-col items-center justify-center">
                <video ref={videoRef} className="w-full max-h-64 object-cover" autoPlay playsInline muted></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                
                {/* Overlay Controls */}
                <div className="absolute bottom-4 left-0 w-full flex justify-center gap-4 px-4">
                  <button 
                    type="button" 
                    onClick={stopCamera}
                    className="p-3 bg-destructive text-destructive-foreground rounded-full shadow-lg"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                  <button 
                    type="button" 
                    onClick={captureAndAnalyze}
                    disabled={analyzing}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                    {analyzing ? "Menganalisis AI..." : "Ambil Foto"}
                  </button>
                </div>
              </div>
            ) : (
              <div 
                onClick={startCamera}
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-xl bg-background hover:bg-accent/50 transition-colors cursor-pointer group"
              >
                <Camera className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm font-semibold text-muted-foreground mt-2 group-hover:text-foreground">Ambil Foto Langsung</span>
                <span className="text-[10px] text-muted-foreground/70 mt-1 italic">Wajib untuk verifikasi AI</span>
              </div>
            )}
            
            {validationMsg && !photoValidated && (
              <p className="text-xs text-destructive mt-3 text-center animate-in slide-in-from-top-1">{validationMsg}</p>
            )}
          </div>

          {/* Captcha */}
          <div className="bg-card/70 backdrop-blur-md border border-border/50 p-4 rounded-xl flex flex-col items-center">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 w-full block">Verifikasi Keamanan</label>
            <Turnstile 
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
              onSuccess={(token) => setCaptchaToken(token)}
              onError={() => setCaptchaToken(null)}
              onExpire={() => setCaptchaToken(null)}
            />
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button 
              type="submit" 
              disabled={loading || !location || !captchaToken || !photoValidated}
              className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all hover:brightness-110 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {loading ? "Mengirim..." : "Kirim Laporan"}
            </button>
            {(!location || !captchaToken || !photoValidated) && <p className="text-xs text-destructive mt-2 text-center">Harap lengkapi lokasi, verifikasi visual, dan captcha.</p>}
          </div>
        </form>
        </div>
        )}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 w-full z-50 bg-background border-t border-border/40 flex justify-around items-center h-20 px-4 pb-safe">
        <Link href="/report" className="flex flex-col items-center justify-center text-primary bg-primary/10 rounded-full px-6 py-1">
          <AlertTriangle className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-semibold">Report</span>
        </Link>
        <Link href="/dashboard" className="flex flex-col items-center justify-center text-muted-foreground hover:bg-accent transition-all px-6 py-1 rounded-full">
          <MapIcon className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-semibold">Map</span>
        </Link>
      </nav>
    </div>
  );
}

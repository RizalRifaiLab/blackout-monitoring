# Blackout Tracker - Indonesia Grid Monitor ⚡

A state-of-the-art, crowd-sourced live tracking platform designed to monitor power outages (mati lampu) and power restorations (lampu nyala) across Indonesia in real-time.

## 🌟 Key Features

### 1. Live Interactive Radar (Choropleth Map)
- Powered by **MapLibre GL** and **Turf.js** for high-performance rendering.
- Maps user reports onto official Indonesian Regency/City (Kabupaten/Kota) GeoJSON polygons.
- **Dynamic Shading:** Automatically highlights a city in Red (Blackout) or Green (Restored) if there is an active spike in reports within a **rolling 1-hour window**.
- Seamless switching between Light Mode (Carto Positron) and Dark Mode (Carto Dark Matter).

### 2. AI-Powered Camera Verification
To prevent fake reports, the submission process requires users to snap a live photo of their environment. The validation runs entirely securely in the browser (100% privacy, no images are saved):
- **Stage 1 (Luminance Engine):** Analyzes the raw pixel data via HTML5 Canvas. If the photo is pitch black, the blackout report is instantly approved.
- **Stage 2 (TensorFlow.js MobileNet):** For tricky edge cases (e.g., a dark room lit by a flashlight), an embedded Machine Learning model scans the image to detect local light sources (candles, flashlights, matches).

### 3. Fortified Anti-Spam Security
- **Cloudflare Turnstile:** Completely mitigates bot traffic without annoying CAPTCHAs.
- **Next.js Server Actions:** Database interactions are routed through secure backend channels.
- **IP Rate Limiting:** Extracts the user's un-fakeable `x-forwarded-for` network IP and prevents spam by enforcing a 15-minute cooldown for duplicate reports.

## 🛠️ Tech Stack
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS + `next-themes`
- **Database:** Supabase (PostgreSQL)
- **Mapping:** MapLibre GL JS + Turf.js
- **Machine Learning:** TensorFlow.js (`@tensorflow/tfjs` & `@tensorflow-models/mobilenet`)

## 🚀 Getting Started

### Prerequisites
You will need a [Supabase](https://supabase.com/) account and a [Cloudflare](https://dash.cloudflare.com/) account for the Turnstile CAPTCHA.

### Environment Setup
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_cloudflare_site_key
TURNSTILE_SECRET_KEY=your_cloudflare_secret_key
```

### Database Setup
Run the following query in your Supabase SQL Editor:
```sql
CREATE TABLE public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('mati', 'nyala')),
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    details TEXT,
    ip_address TEXT
);

-- Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for public" ON public.reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read for public" ON public.reports FOR SELECT USING (true);
```

### Run Locally
```bash
npm install
npm run dev
```

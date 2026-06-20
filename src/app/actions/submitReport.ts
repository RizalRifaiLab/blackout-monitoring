"use server";

import { headers } from "next/headers";
import { supabase } from "@/lib/supabase";

export async function submitReportAction(
  status: "mati" | "nyala",
  lat: number,
  lng: number,
  details: string,
  captchaToken: string
) {
  // 1. Get IP Address
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  // For local development, x-forwarded-for might be null, so fallback to a default
  const ip = forwardedFor ? forwardedFor.split(",")[0] : "127.0.0.1";

  // 2. Verify Turnstile Captcha
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return { success: false, error: "Sistem tidak terkonfigurasi dengan benar (Missing CAPTCHA Secret)." };
  }

  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `secret=${secretKey}&response=${captchaToken}&remoteip=${ip}`,
  });
  
  const verifyData = await verifyRes.json();
  if (!verifyData.success) {
    return { success: false, error: "Verifikasi keamanan gagal. Anda terdeteksi sebagai bot." };
  }

  // 3. Rate Limiting Check (15 Minutes)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  // Check if this IP submitted the SAME STATUS in the last 15 mins
  const { data: recentReports, error: countError } = await supabase
    .from("reports")
    .select("id, created_at")
    .eq("ip_address", ip)
    .eq("status", status)
    .gte("created_at", fifteenMinutesAgo)
    .limit(1);

  if (countError) {
    return { success: false, error: "Terjadi kesalahan pada server saat mengecek rate limit." };
  }

  if (recentReports && recentReports.length > 0) {
    return { success: false, error: "Terlalu banyak permintaan dari jaringan Anda. Harap tunggu 15 menit sebelum melapor lagi." };
  }

  // 4. Insert into Supabase
  const { error: insertError } = await supabase.from("reports").insert([
    {
      status,
      lat,
      lng,
      details,
      ip_address: ip,
    },
  ]);

  if (insertError) {
    return { success: false, error: "Gagal menyimpan laporan ke database." };
  }

  return { success: true };
}

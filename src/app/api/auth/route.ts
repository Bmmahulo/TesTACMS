import { NextRequest, NextResponse } from "next/server";
import { DASHBOARD_COOKIE, validDashboardKeyConfigured } from "@/lib/access";
import { isLocalFallbackEnabled, isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  return Response.json({
    requiresKey: validDashboardKeyConfigured(),
    dashboardReady: validDashboardKeyConfigured() || process.env.NODE_ENV !== "production",
    databaseConfigured: isSupabaseConfigured,
    localFallbackEnabled: isLocalFallbackEnabled,
  });
}

export async function POST(request: NextRequest) {
  const expected = process.env.ACAMS_DASHBOARD_KEY;
  if (!expected && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Dashboard access is disabled until ACAMS_DASHBOARD_KEY is configured." }, { status: 503 });
  }
  if (!expected) return Response.json({ authenticated: true, requiresKey: false });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("key" in body) || body.key !== expected) {
    return Response.json({ error: "Invalid dashboard key" }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true, requiresKey: true });
  response.cookies.set(DASHBOARD_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.delete(DASHBOARD_COOKIE);
  return response;
}
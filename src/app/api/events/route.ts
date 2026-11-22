import { NextRequest } from "next/server";
import { dashboardAuthorized, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { listLocalEvents } from "@/lib/local-store";

export async function GET(request: NextRequest) {
  if (!dashboardAuthorized(request)) return unauthorized();
  const params = request.nextUrl.searchParams;
  if (!supabase && isLocalFallbackEnabled) {
    const status = params.get("status");
    const source = params.get("source");
    return Response.json(listLocalEvents(status === "GRANTED" || status === "DENIED" ? status : null, ["PIN", "RFID", "MOCK_RFID", "DASHBOARD", "WEB_REMOTE", "GATEWAY"].includes(source ?? "") ? source : null));
  }
  if (!supabase) return databaseUnavailable();
  let query = supabase.from("access_events").select("*").order("created_at", { ascending: false }).limit(100);
  const status = params.get("status");
  const source = params.get("source");
  if (status === "GRANTED" || status === "DENIED") query = query.eq("status", status);
  if (source && ["PIN", "RFID", "MOCK_RFID", "DASHBOARD", "WEB_REMOTE", "GATEWAY"].includes(source)) query = query.eq("source", source);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
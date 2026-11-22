import { NextRequest } from "next/server";
import { dashboardAuthorized, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { getLocalStatus } from "@/lib/local-store";

export async function GET(request: NextRequest) {
  if (!dashboardAuthorized(request)) return unauthorized();
  if (!supabase && isLocalFallbackEnabled) return Response.json(getLocalStatus());
  if (!supabase) return databaseUnavailable();
  const [{ data: heartbeat, error: heartbeatError }, { data: command, error: commandError }] = await Promise.all([
    supabase.from("gateway_heartbeats").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("unlock_commands").select("id, status, pulse_ms, created_at, executed_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (heartbeatError || commandError) return Response.json({ error: heartbeatError?.message ?? commandError?.message }, { status: 500 });
  const heartbeatAgeMs = heartbeat ? Date.now() - new Date(heartbeat.updated_at).getTime() : null;
  return Response.json({ heartbeat, heartbeatAgeMs, online: heartbeatAgeMs !== null && heartbeatAgeMs < 30000, latestCommand: command });
}
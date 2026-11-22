import { NextRequest } from "next/server";
import { dashboardAuthorized, dashboardKeyUnavailable, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { createLocalCommand } from "@/lib/local-store";

export async function POST(request: NextRequest) {
  if (!process.env.ACAMS_DASHBOARD_KEY && process.env.NODE_ENV === "production") return dashboardKeyUnavailable();
  if (!dashboardAuthorized(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const requestedBy = typeof body?.requested_by === "string" && body.requested_by.trim() ? body.requested_by.trim().slice(0, 80) : "Lab dashboard";
  if (!supabase && isLocalFallbackEnabled) return Response.json({ command: createLocalCommand(requestedBy), mode: "local" }, { status: 201 });
  if (!supabase) return databaseUnavailable();
  const { data: command, error: commandError } = await supabase.from("unlock_commands").insert({ requested_by: requestedBy, pulse_ms: 2000, status: "PENDING" }).select("*").single();
  if (commandError) return Response.json({ error: commandError.message }, { status: 500 });
  const { error: eventError } = await supabase.from("access_events").insert({
    event_type: "REMOTE_UNLOCK",
    source: "DASHBOARD",
    credential_value: requestedBy,
    status: "QUEUED",
    process_time_ms: null,
    command_id: command.id,
  });
  if (eventError) {
    await supabase.from("unlock_commands").delete().eq("id", command.id);
    return Response.json({ error: eventError.message }, { status: 500 });
  }
  return Response.json({ command }, { status: 201 });
}
import { NextRequest } from "next/server";
import { gatewayAuthorized, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { claimLocalCommand } from "@/lib/local-store";

export async function GET(request: NextRequest) {
  if (!gatewayAuthorized(request)) return unauthorized();
  if (!supabase && isLocalFallbackEnabled) return Response.json({ command: claimLocalCommand(), mode: "local" });
  if (!supabase) return databaseUnavailable();
  const { data: pending, error: findError } = await supabase.from("unlock_commands").select("id, requested_by, pulse_ms, status, created_at").eq("status", "PENDING").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (findError) return Response.json({ error: findError.message }, { status: 500 });
  if (!pending) return Response.json({ command: null });
  const { data, error } = await supabase.from("unlock_commands").update({ status: "SENT" }).eq("id", pending.id).eq("status", "PENDING").select("id, requested_by, pulse_ms, status, created_at").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ command: data });
}
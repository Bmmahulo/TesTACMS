import { NextRequest } from "next/server";
import { gatewayAuthorized, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { completeLocalCommand } from "@/lib/local-store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  if (!gatewayAuthorized(request)) return unauthorized();
  const { id } = await params;
  if (!supabase && isLocalFallbackEnabled) {
    const command = completeLocalCommand(id);
    if (!command) return Response.json({ error: "Command not found or not in SENT state" }, { status: 409 });
    return Response.json({ ok: true, command, mode: "local" });
  }
  if (!supabase) return databaseUnavailable();
  const { data, error } = await supabase.rpc("complete_unlock_command", { command_id_input: id });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const command = Array.isArray(data) ? data[0] : data;
  if (!command) return Response.json({ error: "Command not found or not in SENT state" }, { status: 409 });
  return Response.json({ ok: true, command });
}
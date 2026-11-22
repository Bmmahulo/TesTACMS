import { NextRequest } from "next/server";
import { gatewayAuthorized, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { heartbeatSchema } from "@/lib/validation";
import { setLocalHeartbeat } from "@/lib/local-store";

export async function POST(request: NextRequest) {
  if (!gatewayAuthorized(request)) return unauthorized();
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid heartbeat" }, { status: 400 });
  if (!supabase && isLocalFallbackEnabled) {
    const heartbeat = setLocalHeartbeat({
      device_id: parsed.data.device_id,
      ip_address: parsed.data.ip_address ?? null,
      wifi_rssi: parsed.data.wifi_rssi ?? null,
      uart_ok: parsed.data.uart_ok,
      i2c_ok: parsed.data.i2c_ok,
      rfid_ok: parsed.data.rfid_ok,
      esp32_ok: parsed.data.esp32_ok,
      solenoid_state: parsed.data.solenoid_state,
    });
    return Response.json({ ok: true, heartbeat, mode: "local" });
  }
  if (!supabase) return databaseUnavailable();
  const { data, error } = await supabase.from("gateway_heartbeats").upsert({ ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "device_id" }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, heartbeat: data });
}
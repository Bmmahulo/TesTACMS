import { NextRequest } from "next/server";
import { gatewayAuthorized, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { gatewayEventSchema } from "@/lib/validation";
import { addLocalEvent, listLocalCredentials } from "@/lib/local-store";

export async function POST(request: NextRequest) {
  if (!gatewayAuthorized(request)) return unauthorized();
  const parsed = gatewayEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid event" }, { status: 400 });
  const event = parsed.data;
  let status = event.status;
  if (!supabase && isLocalFallbackEnabled) {
    if (process.env.GATEWAY_VALIDATE_CREDENTIALS === "true" && status === "GRANTED" && event.credential_value && ["PIN", "RFID", "MOCK_RFID"].includes(event.source)) {
      const type = event.source === "PIN" ? "PIN" : "RFID";
      const value = type === "RFID" ? event.credential_value.toUpperCase() : event.credential_value;
      const authorized = listLocalCredentials().some((credential) => credential.active && credential.type === type && credential.value === value);
      if (!authorized) status = "DENIED";
    }
    const localEvent = addLocalEvent({
      ...event,
      credential_value: event.credential_value ?? null,
      process_time_ms: event.process_time_ms ?? null,
      status,
    });
    return Response.json({ ok: true, event: localEvent, mode: "local" }, { status: 201 });
  }
  if (!supabase) return databaseUnavailable();
  if (process.env.GATEWAY_VALIDATE_CREDENTIALS === "true" && status === "GRANTED" && event.credential_value && (event.source === "PIN" || event.source === "RFID" || event.source === "MOCK_RFID")) {
    const type = event.source === "PIN" ? "PIN" : "RFID";
    const value = type === "RFID" ? event.credential_value.toUpperCase() : event.credential_value;
    const { data, error } = await supabase.from("credentials").select("id").eq("type", type).eq("value", value).eq("active", true).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) status = "DENIED";
  }
  const { data, error } = await supabase.from("access_events").insert({ ...event, status }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, event: data });
}
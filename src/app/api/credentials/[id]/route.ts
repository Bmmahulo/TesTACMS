import { NextRequest } from "next/server";
import { dashboardAuthorized, dashboardKeyUnavailable, unauthorized } from "@/lib/access";
import { databaseUnavailable, isLocalFallbackEnabled, supabase } from "@/lib/supabase";
import { credentialPatchSchema } from "@/lib/validation";
import { deleteLocalCredential, listLocalCredentials, updateLocalCredential } from "@/lib/local-store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!process.env.ACAMS_DASHBOARD_KEY && process.env.NODE_ENV === "production") return dashboardKeyUnavailable();
  if (!dashboardAuthorized(request)) return unauthorized();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return Response.json({ error: "Invalid request body" }, { status: 400 });
  const partial = credentialPatchSchema.safeParse(body);
  if (!partial.success || Object.keys(partial.data ?? {}).length === 0) {
    return Response.json({ error: partial.success ? "No fields to update" : partial.error.issues[0]?.message }, { status: 400 });
  }
  if (!supabase && isLocalFallbackEnabled) {
    const current = listLocalCredentials().find((credential) => credential.id === id);
    const updates = { ...partial.data };
    if ((updates.type ?? current?.type) === "RFID" && updates.value) updates.value = updates.value.toUpperCase();
    const result = updateLocalCredential(id, updates);
    if (!result) return Response.json({ error: "Credential not found" }, { status: 404 });
    if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
    return Response.json(result.data);
  }
  if (!supabase) return databaseUnavailable();
  const updates = { ...partial.data };
  if (updates.type === "RFID" && updates.value) updates.value = updates.value.toUpperCase();
  const { data, error } = await supabase.from("credentials").update(updates).eq("id", id).select("*").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "Credential not found" }, { status: 404 });
  return Response.json(data);
}

export async function DELETE(request: NextRequest, { params }: Context) {
  if (!process.env.ACAMS_DASHBOARD_KEY && process.env.NODE_ENV === "production") return dashboardKeyUnavailable();
  if (!dashboardAuthorized(request)) return unauthorized();
  const { id } = await params;
  if (!supabase && isLocalFallbackEnabled) {
    if (!deleteLocalCredential(id)) return Response.json({ error: "Credential not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  }
  if (!supabase) return databaseUnavailable();
  const { error } = await supabase.from("credentials").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return new Response(null, { status: 204 });
}
import type { NextRequest } from "next/server";

export const DASHBOARD_COOKIE = "acams_dashboard_session";

export function gatewayAuthorized(request: NextRequest) {
  const expected = process.env.ESP32_API_KEY;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-acams-api-key") === expected;
}

export function dashboardAuthorized(request: NextRequest) {
  const expected = process.env.ACAMS_DASHBOARD_KEY;
  if (!expected) return process.env.NODE_ENV !== "production";
  return request.cookies.get(DASHBOARD_COOKIE)?.value === expected;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function dashboardKeyUnavailable() {
  return Response.json({ error: "Set ACAMS_DASHBOARD_KEY before enabling dashboard controls." }, { status: 503 });
}

export function validDashboardKeyConfigured() {
  return Boolean(process.env.ACAMS_DASHBOARD_KEY);
}
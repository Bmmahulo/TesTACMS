"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  DoorOpen,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import type { AccessEvent, Credential, GatewayStatus } from "@/lib/types";

const demoCredentials: Credential[] = [
  { id: "demo-1", label: "Lab lead", type: "PIN", value: "1111", active: true, created_at: new Date().toISOString() },
  { id: "demo-2", label: "Research bench A", type: "PIN", value: "2222", active: true, created_at: new Date().toISOString() },
  { id: "demo-3", label: "RFID test card 01", type: "RFID", value: "FA1C6AE7", active: true, created_at: new Date().toISOString() },
  { id: "demo-4", label: "RFID test card 02", type: "RFID", value: "C9A28E9A", active: false, created_at: new Date().toISOString() },
];

const demoEvents: AccessEvent[] = [
  { id: "e1", event_type: "ACCESS_ATTEMPT", source: "RFID", credential_value: "FA1C6AE7", status: "GRANTED", process_time_ms: 184, created_at: new Date(Date.now() - 23000).toISOString() },
  { id: "e2", event_type: "ACCESS_ATTEMPT", source: "PIN", credential_value: "••••", status: "DENIED", process_time_ms: 312, created_at: new Date(Date.now() - 68000).toISOString() },
  { id: "e3", event_type: "ACCESS_ATTEMPT", source: "MOCK_RFID", credential_value: "C9A28E9A", status: "GRANTED", process_time_ms: 201, created_at: new Date(Date.now() - 156000).toISOString() },
  { id: "e4", event_type: "ACCESS_ATTEMPT", source: "PIN", credential_value: "••••", status: "GRANTED", process_time_ms: 268, created_at: new Date(Date.now() - 266000).toISOString() },
  { id: "e5", event_type: "ACCESS_ATTEMPT", source: "RFID", credential_value: "A42D903B", status: "DENIED", process_time_ms: 197, created_at: new Date(Date.now() - 438000).toISOString() },
];

const demoGateway: GatewayStatus = {
  heartbeat: { device_id: "acams-gateway-01", ip_address: "192.168.1.84", wifi_rssi: -54, uart_ok: true, i2c_ok: true, rfid_ok: true, esp32_ok: true, solenoid_state: "LOCKED", updated_at: new Date(Date.now() - 6000).toISOString() },
  heartbeatAgeMs: 6000,
  online: true,
  latestCommand: null,
};

type AuthState = "checking" | "locked" | "ready" | "unavailable";
type OutcomeFilter = "ALL" | "GRANTED" | "DENIED";
type SourceFilter = "ALL" | "PIN" | "RFID" | "DASHBOARD" | "GATEWAY";

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(date));
}

function relativeTime(date: string | null | undefined) {
  if (!date) return "No heartbeat yet";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  return seconds < 5 ? "Just now" : `${seconds}s ago`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export default function Dashboard() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [needsKey, setNeedsKey] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [dashboardKey, setDashboardKey] = useState("");
  const [credentials, setCredentials] = useState<Credential[]>(demoCredentials);
  const [events, setEvents] = useState<AccessEvent[]>(demoEvents);
  const [gateway, setGateway] = useState<GatewayStatus>(demoGateway);
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [credentialType, setCredentialType] = useState<"PIN" | "RFID">("RFID");
  const [newCredential, setNewCredential] = useState({ label: "", value: "" });
  const [busy, setBusy] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    const results = await Promise.allSettled([
      requestJson<Credential[]>("/api/credentials"),
      requestJson<AccessEvent[]>("/api/events"),
      requestJson<GatewayStatus>("/api/status"),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      if (failed.reason instanceof Error && failed.reason.message.includes("Supabase is not configured")) setDemoMode(true);
      else setNotice(failed.reason instanceof Error ? failed.reason.message : "Unable to refresh data.");
    } else {
      const [credentialResult, eventResult, gatewayResult] = results as [PromiseFulfilledResult<Credential[]>, PromiseFulfilledResult<AccessEvent[]>, PromiseFulfilledResult<GatewayStatus>];
      setCredentials(credentialResult.value);
      setEvents(eventResult.value);
      setGateway(gatewayResult.value);
      setDemoMode(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    requestJson<{ requiresKey: boolean; dashboardReady: boolean; databaseConfigured: boolean; localFallbackEnabled: boolean }>("/api/auth")
      .then((state) => {
        if (!active) return;
        setNeedsKey(state.requiresKey);
        setLocalMode(state.localFallbackEnabled);
        setDatabaseReady(state.databaseConfigured || state.localFallbackEnabled);
        if (!state.databaseConfigured && !state.localFallbackEnabled) setLoading(false);
        if (!state.dashboardReady) setAuth("unavailable");
        else if (!state.requiresKey) setAuth("ready");
        else setAuth("locked");
      })
      .catch(() => setAuth("unavailable"));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (auth !== "ready" || !databaseReady) return;
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
    };
  }, [auth, databaseReady, outcomeFilter, sourceFilter]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestJson("/api/auth", { method: "POST", body: JSON.stringify({ key: dashboardKey }) });
      setAuth("ready");
      setDashboardKey("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function triggerUnlock() {
    setUnlockBusy(true);
    setNotice("");
    try {
      await requestJson("/api/unlock", { method: "POST", body: JSON.stringify({ requested_by: "Lab dashboard" }) });
      setNotice("Unlock queued. The gateway will pulse the relay for 2 seconds.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unlock request failed.");
    } finally {
      setUnlockBusy(false);
    }
  }

  async function addCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await requestJson("/api/credentials", {
        method: "POST",
        body: JSON.stringify({ label: newCredential.label, type: credentialType, value: credentialType === "RFID" ? newCredential.value.toUpperCase().trim() : newCredential.value.trim(), active: true }),
      });
      setNewCredential({ label: "", value: "" });
      setNotice("Credential added.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to add credential.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCredential(credential: Credential) {
    try {
      await requestJson(`/api/credentials/${credential.id}`, { method: "PATCH", body: JSON.stringify({ active: !credential.active }) });
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update credential.");
    }
  }

  async function deleteCredential(credential: Credential) {
    if (!window.confirm(`Delete ${credential.label} (${credential.value})?`)) return;
    try {
      const response = await fetch(`/api/credentials/${credential.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Unable to delete credential.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to delete credential.");
    }
  }

  const activeCount = credentials.filter((credential) => credential.active).length;
  const grantedCount = events.filter((event) => event.status === "GRANTED").length;
  const deniedCount = events.filter((event) => event.status === "DENIED").length;
  const systemOnline = gateway.online && gateway.heartbeat?.esp32_ok;
  const visibleEvents = events.filter((event) => {
    const outcomeMatches = outcomeFilter === "ALL" || event.status === outcomeFilter;
    const sourceMatches = sourceFilter === "ALL" || (sourceFilter === "DASHBOARD" ? event.source === "DASHBOARD" || event.source === "WEB_REMOTE" : event.source === sourceFilter);
    return outcomeMatches && sourceMatches;
  });

  if (auth === "checking") return <main className="screen-state"><div className="loader-mark"><Activity size={21} /></div><p>Connecting to access control...</p></main>;
  if (auth === "unavailable") return <main className="screen-state"><div className="state-panel"><ShieldCheck size={26} /><h1>Console locked</h1><p>Set <code>ACAMS_DASHBOARD_KEY</code> on the server before opening this deployment.</p></div></main>;
  if (auth === "locked") return (
    <main className="login-screen">
      <div className="login-aside"><span className="brand-mark">A<span>1</span></span><div><p className="eyebrow">LAB ACCESS SYSTEM</p><h1>Secure entry.<br />Clear records.</h1><p className="login-copy">ACAMS V1 control surface for the instrument lab gateway.</p></div><div className="login-foot"><span className="led led-good" /> Gateway console / v1.0</div></div>
      <form className="login-form" onSubmit={login}><p className="eyebrow">OPERATOR SESSION</p><h2>Sign in</h2><p className="muted">Enter the dashboard key configured by your system administrator.</p><label htmlFor="dashboard-key">Dashboard key</label><input id="dashboard-key" autoComplete="current-password" type="password" value={dashboardKey} onChange={(event) => setDashboardKey(event.target.value)} required /><button className="button button-primary login-submit" disabled={busy}>{busy ? "Verifying..." : "Open console"}<ArrowUpRight size={16} /></button>{notice && <p className="form-error">{notice}</p>}</form>
    </main>
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#overview" aria-label="ACAMS home"><span className="brand-mark">A<span>1</span></span><span className="brand-name">ACAMS<small>LAB SYSTEMS</small></span></a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-links"><a className="nav-link active" href="#overview"><Activity size={17} />Overview<span className="nav-indicator" /></a><a className="nav-link" href="#events"><Clock3 size={17} />Access events</a><a className="nav-link" href="#credentials"><KeyRound size={17} />Credentials</a></nav>
        <div className="sidebar-device"><div className="device-icon"><Radio size={18} /></div><div><span className="tiny-label">GATEWAY</span><strong>{gateway.heartbeat?.device_id ?? "Not connected"}</strong><span className="device-state"><i className={`led ${systemOnline ? "led-good" : "led-off"}`} />{systemOnline ? "Online" : "Offline"}</span></div></div>
        <div className="sidebar-bottom"><span className="build-mark">ACAMS V1 <b>·</b> LAB BUILD</span><button className="quiet-icon" title="Sign out" onClick={async () => { if (needsKey) await fetch("/api/auth", { method: "DELETE" }); setAuth(needsKey ? "locked" : "ready"); }}><LogOut size={15} /></button></div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar"><div className="breadcrumb">CONTROL ROOM <span>/</span> <b>OVERVIEW</b></div><div className="topbar-right"><span className={`connection-pill ${systemOnline ? "connected" : "disconnected"}`}><i className={`led ${systemOnline ? "led-good" : "led-off"}`} />{systemOnline ? "GATEWAY ONLINE" : "GATEWAY OFFLINE"}</span><button className="quiet-icon refresh-button" title="Refresh data" onClick={() => void refresh()}><RefreshCw size={16} /></button><div className="avatar">OP</div></div></header>

        {(demoMode || localMode) && <div className="demo-banner"><CircleAlert size={16} /><span><b>{localMode ? "Local mode" : "Preview mode"}</b> · {localMode ? "Live data is kept in server memory and clears when the dev server restarts." : "Sample values shown. Configure Supabase to enable persistent data."}</span></div>}
        <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase()} <span>·</span> INSTRUMENT LAB</p><h1>Access overview</h1><p className="heading-sub">Monitor entry activity and manage the lab gateway.</p></div><div className="heading-meta"><span className="sync-icon"><RefreshCw size={13} /></span><span>Auto-refresh <b>5 sec</b></span><span className="heading-divider" /><span>{loading ? "Syncing..." : `Updated ${formatTime(new Date().toISOString())}`}</span></div></div>

        <section className="metrics-row" aria-label="Access metrics"><Metric label="GRANTED IN FEED" value={String(grantedCount).padStart(2, "0")} detail={<><ArrowUpRight size={13} /> Authorized</>} icon={<BadgeCheck size={16} />} tone="green" /><Metric label="DENIED IN FEED" value={String(deniedCount).padStart(2, "0")} detail={<><ArrowDownRight size={13} /> Blocked</>} icon={<CircleAlert size={16} />} tone="red" /><Metric label="ACTIVE CREDENTIALS" value={String(activeCount).padStart(2, "0")} detail={<>{credentials.length - activeCount} inactive</>} icon={<Fingerprint size={16} />} tone="blue" /><Metric label="GATEWAY RSSI" value={gateway.heartbeat?.wifi_rssi != null ? `${Math.abs(gateway.heartbeat.wifi_rssi)} dBm` : "—"} detail={<><Wifi size={13} /> Wi-Fi signal</>} icon={<Activity size={16} />} tone="amber" /></section>

        <section className="control-grid" aria-label="Gateway controls">
          <div className="unlock-panel"><div className="panel-topline"><div><p className="eyebrow">REMOTE CONTROL</p><h2>Solenoid access</h2></div><span className="control-lock"><LockKeyhole size={17} /></span></div><div className="unlock-main"><div className="door-graphic"><DoorOpen size={32} strokeWidth={1.5} /><span className="door-ring" /></div><div><span className="tiny-label">LOCK STATE</span><strong>{gateway.heartbeat?.solenoid_state ?? "UNKNOWN"}</strong><p>{gateway.online ? `Gateway heartbeat ${relativeTime(gateway.heartbeat?.updated_at)}` : "Waiting for gateway heartbeat"}</p></div></div><button className="button button-unlock" onClick={triggerUnlock} disabled={unlockBusy || demoMode}><LockKeyhole size={16} />{unlockBusy ? "Queueing command..." : "Trigger 2s solenoid unlock"}<ArrowUpRight size={15} /></button><div className="unlock-foot"><span><i className="led led-good" /> Normally open relay</span><span>GPIO 27 <b>·</b> 2,000 ms</span></div>{gateway.latestCommand && <div className="command-status"><span>Latest command <b>{gateway.latestCommand.status}</b></span><span>{relativeTime(gateway.latestCommand.created_at)}</span></div>}</div>
          <div className="health-panel"><div className="panel-topline"><div><p className="eyebrow">HARDWARE TELEMETRY</p><h2>Gateway health</h2></div><span className={`health-state ${systemOnline ? "health-up" : "health-down"}`}><i className={`led ${systemOnline ? "led-good" : "led-off"}`} />{systemOnline ? "ALL SYSTEMS NOMINAL" : "NO SIGNAL"}</span></div><div className="health-list"><HealthRow name="ESP32 gateway" ok={Boolean(gateway.heartbeat?.esp32_ok)} detail={gateway.heartbeat?.ip_address ?? "No IP reported"} /><HealthRow name="UART bridge" ok={Boolean(gateway.heartbeat?.uart_ok)} detail="Serial2 · 9600 baud" /><HealthRow name="RFID reader" ok={Boolean(gateway.heartbeat?.rfid_ok)} detail="MFRC522 · SPI" /><HealthRow name="I²C display" ok={Boolean(gateway.heartbeat?.i2c_ok)} detail="LCD · 400 kHz" /></div><div className="health-foot"><span><Wifi size={14} /> RSSI <b>{gateway.heartbeat?.wifi_rssi ?? "—"}{gateway.heartbeat?.wifi_rssi != null ? " dBm" : ""}</b></span><span>Last seen <b>{relativeTime(gateway.heartbeat?.updated_at)}</b></span></div></div>
        </section>

        <section className="content-grid">
          <div className="events-panel" id="events"><div className="section-heading"><div><p className="eyebrow">DOOR ACTIVITY</p><h2>Recent access events <span className="count-badge">{visibleEvents.length}</span></h2></div><button className="text-button" onClick={() => void refresh()}>View latest <ArrowUpRight size={14} /></button></div><div className="filter-bar"><div className="segmented" role="group" aria-label="Filter by outcome">{(["ALL", "GRANTED", "DENIED"] as OutcomeFilter[]).map((filter) => <button key={filter} className={outcomeFilter === filter ? "selected" : ""} onClick={() => setOutcomeFilter(filter)}>{filter === "ALL" ? "All outcomes" : filter}</button>)}</div><label className="source-select"><span className="sr-only">Filter by source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="ALL">All sources</option><option value="PIN">PIN</option><option value="RFID">RFID</option><option value="DASHBOARD">Dashboard</option></select><ChevronDown size={13} /></label></div><div className="table-wrap"><table><thead><tr><th>RESULT</th><th>CREDENTIAL / ID</th><th>SOURCE</th><th>TIME</th><th>RECORDED</th></tr></thead><tbody>{visibleEvents.length === 0 ? <tr><td className="empty-cell" colSpan={5}>No events match these filters.</td></tr> : visibleEvents.map((event) => <tr key={event.id}><td><span className={`result-tag ${event.status === "GRANTED" || event.status === "EXECUTED" ? "result-granted" : event.status === "DENIED" ? "result-denied" : "result-queued"}`}><i />{event.status}</span></td><td className="credential-cell">{event.credential_value || "—"}</td><td><span className="source-tag">{event.source}</span></td><td className="timing-cell">{event.process_time_ms == null ? "—" : `${event.process_time_ms} ms`}</td><td className="time-cell">{formatTime(event.created_at)}</td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing latest {visibleEvents.length} events</span><span><span className="live-dot" /> LIVE FEED</span></div></div>

          <div className="credential-panel" id="credentials"><div className="section-heading credential-title"><div><p className="eyebrow">ACCESS DIRECTORY</p><h2>Credentials <span className="count-badge">{credentials.length}</span></h2></div><span className="credential-icon"><KeyRound size={16} /></span></div><form className="credential-form" onSubmit={addCredential}><div className="form-row"><label>Credential type</label><div className="type-switch"><button type="button" className={credentialType === "RFID" ? "active" : ""} onClick={() => setCredentialType("RFID")}><Radio size={14} /> RFID UID</button><button type="button" className={credentialType === "PIN" ? "active" : ""} onClick={() => setCredentialType("PIN")}><KeyRound size={14} /> PIN code</button></div></div><div className="form-row"><label htmlFor="credential-label">Lab label</label><input id="credential-label" placeholder="e.g. Sample cabinet" value={newCredential.label} onChange={(event) => setNewCredential({ ...newCredential, label: event.target.value })} required maxLength={80} /></div><div className="form-row"><label htmlFor="credential-value">{credentialType === "RFID" ? "Card UID" : "PIN code"}</label><input id="credential-value" placeholder={credentialType === "RFID" ? "FA1C6AE7" : "4-digit minimum"} value={newCredential.value} onChange={(event) => setNewCredential({ ...newCredential, value: credentialType === "RFID" ? event.target.value.replace(/\s/g, "").toUpperCase() : event.target.value.replace(/\D/g, "") })} inputMode={credentialType === "PIN" ? "numeric" : "text"} maxLength={credentialType === "PIN" ? 12 : 20} required /></div><button className="button button-add" disabled={busy || demoMode}><Plus size={16} />Add credential</button>{demoMode && <p className="form-hint">Connect Supabase to make changes.</p>}</form><div className="credential-list-head"><span>REGISTERED</span><span>{credentials.length} TOTAL</span></div><div className="credential-list">{credentials.map((credential) => <div className={`credential-item ${credential.active ? "" : "inactive"}`} key={credential.id}><div className={`credential-symbol ${credential.type === "RFID" ? "rfid-symbol" : "pin-symbol"}`}>{credential.type === "RFID" ? <Radio size={15} /> : <KeyRound size={15} />}</div><div className="credential-info"><strong>{credential.label}</strong><span>{credential.type} <b>·</b> {credential.value}</span></div><button className={`status-toggle ${credential.active ? "is-active" : ""}`} aria-label={`${credential.active ? "Deactivate" : "Activate"} ${credential.label}`} title={credential.active ? "Active. Click to deactivate" : "Inactive. Click to activate"} disabled={demoMode} onClick={() => void toggleCredential(credential)}><span /></button><button className="delete-button" title="Delete credential" disabled={demoMode} onClick={() => void deleteCredential(credential)}><Trash2 size={14} /></button></div>)}</div></div>
        </section>
        {notice && <div className="toast" role="status"><CircleCheck size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
        <footer className="page-footer"><span>ACAMS V1 <b>·</b> ACCESS CONTROL &amp; ASSET MANAGEMENT</span><span>LAB INTERNAL <b>·</b> {gateway.heartbeat?.device_id ?? "GATEWAY UNPAIRED"}</span></footer>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: React.ReactNode; icon: React.ReactNode; tone: string }) {
  return <article className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-content"><span className="tiny-label">{label}</span><strong>{value}</strong><span className={`metric-detail detail-${tone}`}>{detail}</span></div><span className="metric-mark" /></article>;
}

function HealthRow({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return <div className="health-row"><span className={`health-check ${ok ? "ok" : "bad"}`}>{ok ? <CircleCheck size={15} /> : <CircleAlert size={15} />}</span><span className="health-name">{name}</span><span className="health-detail">{detail}</span><span className={`health-result ${ok ? "ok-text" : "bad-text"}`}>{ok ? "OK" : "DOWN"}</span></div>;
}
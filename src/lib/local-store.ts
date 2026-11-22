import type { AccessEvent, Credential, GatewayStatus } from "@/lib/types";

export type LocalCommand = {
  id: string;
  requested_by: string;
  pulse_ms: number;
  status: "PENDING" | "SENT" | "COMPLETED";
  created_at: string;
  executed_at: string | null;
};

type LocalStore = {
  credentials: Credential[];
  events: AccessEvent[];
  heartbeat: NonNullable<GatewayStatus["heartbeat"]> | null;
  commands: LocalCommand[];
};

const seedCredentials: Credential[] = [
  { id: "local-pin-1111", label: "Lab PIN 01", type: "PIN", value: "1111", active: true, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "local-pin-2222", label: "Lab PIN 02", type: "PIN", value: "2222", active: true, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "local-pin-3333", label: "Lab PIN 03", type: "PIN", value: "3333", active: true, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "local-rfid-fa1c6ae7", label: "RFID test card 01", type: "RFID", value: "FA1C6AE7", active: true, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "local-rfid-c9a28e9a", label: "RFID test card 02", type: "RFID", value: "C9A28E9A", active: true, created_at: "2026-01-01T00:00:00.000Z" },
];

declare global {
  var __acamsLocalStore: LocalStore | undefined;
}

function getStore(): LocalStore {
  if (!globalThis.__acamsLocalStore) {
    globalThis.__acamsLocalStore = {
      credentials: seedCredentials.map((credential) => ({ ...credential })),
      events: [],
      heartbeat: null,
      commands: [],
    };
  }
  return globalThis.__acamsLocalStore;
}

export function listLocalCredentials() {
  return [...getStore().credentials].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addLocalCredential(input: Omit<Credential, "id" | "created_at">) {
  const store = getStore();
  if (store.credentials.some((credential) => credential.type === input.type && credential.value === input.value)) {
    return { error: "That credential already exists." as const };
  }
  const credential: Credential = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  store.credentials.unshift(credential);
  return { data: credential };
}

export function updateLocalCredential(id: string, updates: Partial<Omit<Credential, "id" | "created_at">>) {
  const store = getStore();
  const credential = store.credentials.find((entry) => entry.id === id);
  if (!credential) return null;
  if (updates.type && updates.value && store.credentials.some((entry) => entry.id !== id && entry.type === updates.type && entry.value === updates.value)) {
    return { error: "That credential already exists." as const };
  }
  Object.assign(credential, updates);
  return { data: credential };
}

export function deleteLocalCredential(id: string) {
  const store = getStore();
  const index = store.credentials.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  store.credentials.splice(index, 1);
  return true;
}

export function setLocalHeartbeat(input: Omit<NonNullable<GatewayStatus["heartbeat"]>, "updated_at">) {
  const heartbeat = { ...input, updated_at: new Date().toISOString() };
  getStore().heartbeat = heartbeat;
  return heartbeat;
}

export function addLocalEvent(input: Omit<AccessEvent, "id" | "created_at"> & { created_at?: string; command_id?: string | null }) {
  const event: AccessEvent = {
    id: crypto.randomUUID(),
    event_type: input.event_type,
    source: input.source,
    credential_value: input.credential_value,
    status: input.status,
    process_time_ms: input.process_time_ms,
    created_at: input.created_at ?? new Date().toISOString(),
  };
  const store = getStore();
  store.events.unshift(event);
  if (store.events.length > 500) store.events.length = 500;
  if (input.command_id) {
    const command = store.commands.find((entry) => entry.id === input.command_id);
    if (command) (event as AccessEvent & { command_id?: string }).command_id = command.id;
  }
  return event;
}

export function listLocalEvents(status?: string | null, source?: string | null) {
  return getStore().events.filter((event) => (!status || event.status === status) && (!source || event.source === source)).slice(0, 100);
}

export function createLocalCommand(requestedBy: string) {
  const command: LocalCommand = {
    id: crypto.randomUUID(),
    requested_by: requestedBy,
    pulse_ms: 2000,
    status: "PENDING",
    created_at: new Date().toISOString(),
    executed_at: null,
  };
  getStore().commands.push(command);
  addLocalEvent({ event_type: "REMOTE_UNLOCK", source: "DASHBOARD", credential_value: requestedBy, status: "QUEUED", process_time_ms: null, command_id: command.id });
  return command;
}

export function claimLocalCommand() {
  const command = getStore().commands.find((entry) => entry.status === "PENDING");
  if (!command) return null;
  command.status = "SENT";
  return { ...command };
}

export function completeLocalCommand(id: string) {
  const store = getStore();
  const command = store.commands.find((entry) => entry.id === id && entry.status === "SENT");
  if (!command) return null;
  command.status = "COMPLETED";
  command.executed_at = new Date().toISOString();
  for (const event of store.events) {
    if ((event as AccessEvent & { command_id?: string }).command_id === id) event.status = "EXECUTED";
  }
  return { ...command };
}

export function getLocalStatus(): GatewayStatus {
  const heartbeat = getStore().heartbeat;
  const latestCommand = [...getStore().commands].reverse()[0] ?? null;
  const heartbeatAgeMs = heartbeat ? Date.now() - new Date(heartbeat.updated_at).getTime() : null;
  return {
    heartbeat,
    heartbeatAgeMs,
    online: heartbeatAgeMs !== null && heartbeatAgeMs < 30000,
    latestCommand: latestCommand ? { id: latestCommand.id, status: latestCommand.status, pulse_ms: latestCommand.pulse_ms, created_at: latestCommand.created_at, executed_at: latestCommand.executed_at } : null,
  };
}
import { z } from "zod";

export const credentialSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(["PIN", "RFID"]),
  value: z.string().trim().min(1).max(32),
  active: z.boolean().default(true),
}).superRefine((credential, context) => {
  if (credential.type === "PIN" && !/^\d{4,12}$/.test(credential.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "PIN must contain 4 to 12 digits." });
  }
  if (credential.type === "RFID" && !/^(?:[0-9A-F]{2}){4,10}$/.test(credential.value.toUpperCase())) {
    context.addIssue({ code: "custom", path: ["value"], message: "RFID UID must be 8 to 20 hexadecimal characters." });
  }
});

export const credentialPatchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["PIN", "RFID"]).optional(),
  value: z.string().trim().min(1).max(32).optional(),
  active: z.boolean().optional(),
}).superRefine((credential, context) => {
  if (!credential.value || !credential.type) return;
  if (credential.type === "PIN" && !/^\d{4,12}$/.test(credential.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "PIN must contain 4 to 12 digits." });
  }
  if (credential.type === "RFID" && !/^(?:[0-9A-F]{2}){4,10}$/.test(credential.value.toUpperCase())) {
    context.addIssue({ code: "custom", path: ["value"], message: "RFID UID must be 8 to 20 hexadecimal characters." });
  }
});

export const heartbeatSchema = z.object({
  device_id: z.string().trim().min(1).max(80),
  ip_address: z.string().trim().max(64).nullable().optional(),
  wifi_rssi: z.number().int().min(-120).max(0).nullable().optional(),
  uart_ok: z.boolean(),
  i2c_ok: z.boolean(),
  rfid_ok: z.boolean(),
  esp32_ok: z.boolean().default(true),
  solenoid_state: z.enum(["LOCKED", "UNLOCKED", "UNKNOWN"]).default("LOCKED"),
});

export const gatewayEventSchema = z.object({
  event_type: z.enum(["ACCESS_ATTEMPT", "REMOTE_UNLOCK", "DIAGNOSTIC"]).default("ACCESS_ATTEMPT"),
  source: z.enum(["PIN", "RFID", "MOCK_RFID", "WEB_REMOTE", "DASHBOARD", "GATEWAY"]),
  credential_value: z.string().trim().max(80).nullable().optional(),
  status: z.enum(["GRANTED", "DENIED", "QUEUED", "EXECUTED"]),
  process_time_ms: z.number().int().min(0).max(600000).nullable().optional(),
});
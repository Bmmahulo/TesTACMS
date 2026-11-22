export type Credential = {
  id: string;
  label: string;
  type: "PIN" | "RFID";
  value: string;
  active: boolean;
  created_at: string;
};

export type AccessEvent = {
  id: string;
  event_type: "ACCESS_ATTEMPT" | "REMOTE_UNLOCK" | "DIAGNOSTIC";
  source: "PIN" | "RFID" | "MOCK_RFID" | "DASHBOARD" | "WEB_REMOTE";
  credential_value: string | null;
  status: "GRANTED" | "DENIED" | "QUEUED" | "EXECUTED";
  process_time_ms: number | null;
  created_at: string;
};

export type GatewayStatus = {
  heartbeat: {
    device_id: string;
    ip_address: string | null;
    wifi_rssi: number | null;
    uart_ok: boolean;
    i2c_ok: boolean;
    rfid_ok: boolean;
    esp32_ok: boolean;
    solenoid_state: "LOCKED" | "UNLOCKED" | "UNKNOWN";
    updated_at: string;
  } | null;
  heartbeatAgeMs: number | null;
  online: boolean;
  latestCommand: {
    id: string;
    status: "PENDING" | "SENT" | "COMPLETED";
    pulse_ms: number;
    created_at: string;
    executed_at: string | null;
  } | null;
};
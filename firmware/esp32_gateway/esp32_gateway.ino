#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <cstring>

const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// Set this to the PC's Wi-Fi IPv4 address, not localhost/127.0.0.1.
const char *API_BASE = "http://192.168.0.5:3000";
// Leave empty when ESP32_API_KEY is unset on the dev server.
const char *API_KEY = "";
const char *DEVICE_ID = "acams-gateway-01";

constexpr int RELAY_PIN = 27;
constexpr int RELAY_PULSE_MS = 2000;
constexpr int UART_RX_PIN = 16;
constexpr int UART_TX_PIN = 17;
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 10000;
constexpr unsigned long COMMAND_POLL_INTERVAL_MS = 3000;

unsigned long lastHeartbeatMs = 0;
unsigned long lastCommandPollMs = 0;
bool solenoidUnlocked = false;
bool uartOk = false;
bool i2cOk = false;
bool rfidOk = false;

String endpoint(const char *path) {
  return String(API_BASE) + path;
}

bool beginRequest(HTTPClient &http, WiFiClient &client, const String &url) {
  if (!http.begin(client, url)) return false;
  if (strlen(API_KEY) > 0) http.addHeader("x-acams-api-key", API_KEY);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  return true;
}

void postJson(const char *path, const String &body) {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClient client;
  HTTPClient http;
  if (!beginRequest(http, client, endpoint(path))) return;
  const int status = http.POST(body);
  if (status < 200 || status >= 300) {
    Serial.printf("POST %s failed: %d %s\n", path, status, http.getString().c_str());
  }
  http.end();
}

void pulseSolenoid(int pulseMs = RELAY_PULSE_MS) {
  pulseMs = constrain(pulseMs, 100, 10000);
  digitalWrite(RELAY_PIN, HIGH);
  solenoidUnlocked = true;
  delay(pulseMs);
  digitalWrite(RELAY_PIN, LOW);
  solenoidUnlocked = false;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  const String body = String("{\"device_id\":\"") + DEVICE_ID +
    "\",\"ip_address\":\"" + WiFi.localIP().toString() +
    "\",\"wifi_rssi\":" + String(WiFi.RSSI()) +
    ",\"uart_ok\":" + String(uartOk ? "true" : "false") +
    ",\"i2c_ok\":" + String(i2cOk ? "true" : "false") +
    ",\"rfid_ok\":" + String(rfidOk ? "true" : "false") +
    ",\"esp32_ok\":true,\"solenoid_state\":\"" +
    (solenoidUnlocked ? "UNLOCKED" : "LOCKED") + "\"}";
  postJson("/api/gateway/heartbeat", body);
}

void sendGatewayEvent(const String &eventType, const String &source, const String &value, const String &status, unsigned long elapsedMs) {
  StaticJsonDocument<256> document;
  document["event_type"] = eventType;
  document["source"] = source;
  if (value.length()) document["credential_value"] = value;
  else document["credential_value"] = nullptr;
  document["status"] = status;
  document["process_time_ms"] = elapsedMs;
  String body;
  serializeJson(document, body);
  postJson("/api/gateway/events", body);
}

void pollCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  WiFiClient client;
  HTTPClient http;
  if (!beginRequest(http, client, endpoint("/api/gateway/commands/next"))) return;
  const int status = http.GET();
  if (status == HTTP_CODE_OK) {
    StaticJsonDocument<512> document;
    const DeserializationError error = deserializeJson(document, http.getString());
    if (!error && !document["command"].isNull()) {
      const String commandId = document["command"]["id"].as<String>();
      const int pulseMs = document["command"]["pulse_ms"] | RELAY_PULSE_MS;
      http.end();
      pulseSolenoid(pulseMs);
      postJson((String("/api/gateway/commands/") + commandId + "/ack").c_str(), "{}");
      return;
    }
  } else if (status < 0) {
    Serial.printf("Command poll failed: %s\n", http.errorToString(status).c_str());
  }
  http.end();
}

void handleControllerMessage(const String &line) {
  if (line == "UNLOCK") {
    pulseSolenoid();
    return;
  }

  // Controller diagnostics: DIAG,<UART|I2C|RFID>,<OK|FAIL>
  if (line.startsWith("DIAG,")) {
    const int separator = line.indexOf(',', 5);
    if (separator < 0) return;
    const String subsystem = line.substring(5, separator);
    const String result = line.substring(separator + 1);
    const bool ok = result == "OK";
    if (subsystem == "UART") uartOk = ok;
    else if (subsystem == "I2C") i2cOk = ok;
    else if (subsystem == "RFID") rfidOk = ok;
    else return;
    sendGatewayEvent("DIAGNOSTIC", "GATEWAY", subsystem + String("=") + result, "EXECUTED", 0);
    return;
  }

  // Controller access event: EVENT,<PIN|RFID|MOCK_RFID>,<value>,<GRANTED|DENIED>,<ms>
  if (!line.startsWith("EVENT,")) return;
  const int first = line.indexOf(',', 6);
  const int second = line.indexOf(',', first + 1);
  const int third = line.indexOf(',', second + 1);
  if (first < 0 || second < 0 || third < 0) return;
  const String source = line.substring(6, first);
  const String value = line.substring(first + 1, second);
  const String result = line.substring(second + 1, third);
  const unsigned long elapsedMs = line.substring(third + 1).toInt();
  if ((source == "PIN" || source == "RFID" || source == "MOCK_RFID") && (result == "GRANTED" || result == "DENIED")) {
    sendGatewayEvent("ACCESS_ATTEMPT", source, value, result, elapsedMs);
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
  uartOk = true;
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.printf("\nGateway online: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (Serial2.available()) {
    String line = Serial2.readStringUntil('\n');
    line.trim();
    handleControllerMessage(line);
  }

  const unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    sendHeartbeat();
  }
  if (now - lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollMs = now;
    pollCommand();
  }
}
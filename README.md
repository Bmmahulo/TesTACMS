# ACAMS V1

Access Control and Asset Management System for a lab entry point. The Next.js App Router application provides an operator console, Supabase-backed persistent data when configured, and a development-only in-memory API for ESP32-over-Wi-Fi testing without a database.

## Hardware map

- ATmega328P: 4x4 keypad rows `9, 8, 7, 6`; columns `5, 4, 3, 2`; MFRC522 `SS=10`, `RST=A2`; 16x2 I2C LCD at `0x27` or `0x3F` on 400 kHz; green LED `A0`, red LED `A1`; UART `9600` baud.
- ESP32: UART2 RX `GPIO16`, TX `GPIO17`; Normally Open relay input `GPIO27`; drive the 12 V solenoid for a 2,000 ms pulse.
- The relay interface must be appropriately isolated and rated for the solenoid. Do not connect a 12 V solenoid directly to an ESP32 GPIO.

## Supabase setup

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/schema.sql`](supabase/schema.sql). It creates the four tables, constraints, indexes, RLS policies (no public policies), the transactional command-completion function, and seed credentials: PINs `1111`, `2222`, `3333`, plus RFID UIDs `FA1C6AE7` and `C9A28E9A`.
3. In Project Settings > API, copy the project URL and `service_role` key. The service-role key is server-only and bypasses RLS; never use it in browser code or expose it in firmware.
4. Copy `env.example` to `.env.local` and set the variables below. Use distinct, high-entropy values for the dashboard and gateway secrets. `.env.local` is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public identifier only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access; keep secret |
| `ESP32_API_KEY` | Shared secret sent by the ESP32 in `x-acams-api-key` |
| `ACAMS_DASHBOARD_KEY` | Operator sign-in key; session cookie is HTTP-only, secure in production, and same-site strict |
| `GATEWAY_VALIDATE_CREDENTIALS` | Optional server-side check of active PIN/RFID rows for gateway `GRANTED` events (`true`/`false`) |

Without Supabase variables in development, the app uses shared process memory for credentials, events, heartbeats, and unlock commands. The test credentials are seeded locally; changes are lost when the development server restarts. Production does not enable this fallback and fails closed if Supabase or the dashboard key is missing. Keep the Supabase service-role key and ESP32 API key in server environment variables only.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` listens on all network interfaces at port `3000`. On the PC, open `http://localhost:3000`. To find the PC's Wi-Fi IPv4 address, run `ipconfig` in PowerShell and look under the connected Wi-Fi adapter for `IPv4 Address`; this PC currently reports `192.168.0.5`, which may change. Open `http://<YOUR_PC_LOCAL_IP>:3000` from the ESP32 and other devices on the same trusted LAN. Allow Node.js on private networks in Windows Firewall if needed. Do not expose this development server or its plain-HTTP API to the public internet.

No database setup is required for local testing. The UI refreshes from the in-memory APIs, and a gateway heartbeat changes the displayed hardware status. To require a shared gateway key, add `ESP32_API_KEY=<same-random-value-as-firmware>` to `.env.local` and restart the dev server; otherwise local development accepts gateway requests without the header. Typecheck and production build:

```bash
npm run typecheck
npm run build
```

## GitHub repository and push

1. On GitHub, choose **New repository**, set the repository name and visibility, and create it **empty**. Do not initialize it with a README, `.gitignore`, or license because this project already has local files.
2. In PowerShell, run these commands from the project directory. The explicit `Set-Location` matters: this workspace currently sits under a separate user-profile Git root, so initialize this project as its own repository rather than staging the parent folder.

```powershell
Set-Location "C:\Users\PACKARD BELL R32\Desktop\AcamsWeB"
git init -b main
git add .
git status --short
git commit -m "Initial ACAMS V1 application"
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_NEW_REPO>.git
git push -u origin main
```

Review `git status --short` before committing. `.gitignore` excludes `node_modules`, `.next`, all `.env*` files, and build output. The non-secret `env.example` template is safe to commit. If `origin` already exists, use `git remote set-url origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_NEW_REPO>.git` instead of `git remote add origin`. GitHub may prompt you to authenticate using your configured credential manager or browser; do not put a personal access token in the remote URL.

## Vercel deployment

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New Project**, import the repository, and keep the Next.js framework preset.
3. Add all required environment variables from `env.example` in Project Settings > Environment Variables. `NEXT_PUBLIC_SUPABASE_URL` can be exposed; keep all secret variables unprefixed with `NEXT_PUBLIC_`.
4. Deploy. Redeploy after changing environment variables.
5. The included ESP32 sketch is intentionally for trusted-LAN localhost testing over plain HTTP. Before using a Vercel deployment, switch the firmware to HTTPS with certificate validation and configure the production API URL; never send the gateway secret over public plain HTTP.

## Docker

Create `.env` using the variables in `env.example`, then run:

```bash
docker compose up --build
```

The app is available at `http://localhost:3000`; PostgreSQL remains hosted by Supabase. The image uses Next.js standalone output and does not bundle local secrets.

## API summary

ESP32 routes compare `x-acams-api-key` server-side with `ESP32_API_KEY` whenever configured. In local development without a configured key, requests are allowed for same-LAN testing; production does not enable the in-memory fallback:

- `POST /api/gateway/heartbeat` upserts gateway IP, RSSI, and UART/I2C/RFID/ESP32/solenoid health.
- `POST /api/gateway/events` records access/diagnostic events and can optionally verify active credentials.
- `GET /api/gateway/commands/next` claims one pending command by atomically changing it to `SENT`.
- `POST /api/gateway/commands/:id/ack` completes the command and its linked event transactionally.

Operator endpoints are protected by the dashboard session: `POST /api/unlock`; credential `GET`/`POST` and `PATCH`/`DELETE /api/credentials/:id`; `GET /api/events`; and `GET /api/status`. RFID UIDs are normalized to uppercase. Credential values are unique per credential type.

## ESP32 firmware

Open [`firmware/esp32_gateway.ino`](firmware/esp32_gateway.ino) in Arduino IDE with the ESP32 board package and ArduinoJson installed. Set `WIFI_SSID`, `WIFI_PASSWORD`, and `API_BASE` to `http://<YOUR_PC_LOCAL_IP>:3000` (currently `http://192.168.0.5:3000` on this PC). Set `API_KEY` to the same value as `ESP32_API_KEY` if configured; otherwise leave it empty. The sketch uses plain HTTP only for trusted-LAN testing. Configure HTTPS with certificate validation before using a hosted deployment.

The controller can send `UNLOCK\n` over UART2 to pulse the relay. Optional event lines use:

```text
EVENT,PIN,1111,GRANTED,142
EVENT,RFID,FA1C6AE7,DENIED,209
```

The event line is a simple CSV protocol; keep values comma-free. The gateway also polls commands every three seconds, pulses the relay for the command's bounded `pulse_ms` (normally 2,000), and acknowledges completion over HTTP. Heartbeats are sent every ten seconds. Configure heartbeat subsystem flags to reflect actual self-tests for the final hardware build. `GPIO27` is driven HIGH during the pulse and LOW otherwise; verify that this matches the polarity of your relay module before connecting the solenoid.

## Operational notes

- `GET /api/gateway/commands/next` marks a command `SENT` before returning it, preventing duplicate claims across concurrent polls. Add a recovery procedure for commands stranded in `SENT` if the gateway loses power mid-pulse.
- Rotate gateway and dashboard keys if firmware or operator credentials are exposed. Avoid committing `.env.local` or embedding secrets in public repositories.
- Validate relay polarity and solenoid power separately on a current-limited bench supply before connecting the lock hardware.
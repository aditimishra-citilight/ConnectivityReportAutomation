# Connectivity Report — Server / API Specification

Living reference for the **Connectivity Report automation** (30 min / 24 hr / 48 hr
connected‑vs‑disconnected counts per project). **Each server has its OWN base URL, API
paths, `cityId`s and `userId` — they are NOT uniform.** This file is updated as the user
provides each server's captured calls (one at a time).

> Pattern to reuse: same approach as `D:\NDMC UPTIME REPORT API` (auto‑login via API →
> capture `JSESSIONID` → POST data calls → build styled Excel with ExcelJS).

---

## 0. Common concepts

- **Auth:** `POST <base>/login` (or `/smartlight/login`), form‑urlencoded
  `username=admin&password=<YOUR_PASSWORD>` → server returns a **`JSESSIONID`** cookie
  used on all subsequent calls. *(Creds same on all servers so far. Move to env vars /
  prompt for real automation — do not commit.)*
- **List‑data call** returns EVERY device with a `last_update` timestamp.
- **Connectivity definition (the core logic):** count devices by how recently they
  reported, relative to "now":
  - **Connected (30 min)** = `last_update >= now − 30 min`
  - **Connected (24 hr)**  = `last_update >= now − 24 hr`
  - **Connected (48 hr)**  = `last_update >= now − 48 hr`
  - **Disconnected** = Total − Connected
  - **Meter** connectivity uses the `meterTime` field (unix seconds). Stale values like
    `946578600` (=2000‑01‑01) or far‑future = meter not reporting = disconnected.
  - *(Pending final user confirmation that this matches the manual count.)*
- **`deviceType` values:** `1` = CCMS, `2` = ILC (individual pole/lamp controllers),
  `10` = gateway (via `getDeviceList_V2`).

### Device record fields (from velociti `getListViewData_v1` response)
```
name            "D-R1-42035"
switch_location "CHAINAGE NO: 91; POLE NO: L4"
last_update     "2026-06-25 15:16:12"   <-- panel/CCMS connectivity basis
meterTime       1782236210 | "null"     <-- meter connectivity basis (unix s)
switchstatus    1 | 0
fixtureWattage  "210"
current, voltage, pf, powerData, temperature, model, POLE NO
moduleId        "3cc1f60500042035"
gtwInfo         { rssi: -101, snr: 8, gtw_id: "7076fffffe052753" }
```

---

## Server A — NDMC  (smartlight)   ✅ captured

- **Base:** `https://smartlight.citilight.co:446`  (note `/smartlight/` path prefix)
- **Login:** `POST /smartlight/login`
- **List data:** `POST /smartlight/getListViewData_v1`
  body: `{cityId, deviceType:"1", zoneName:"0", wardName:"0", streetName:"0", userId:"10"}`
- **Geography:** `GET /smartlight/getCityGeography?userId=10`
- **userId:** `10`
- Confirmed connectivity = `getListViewData_v1` per zone (NOT `ulb_group_wise_connect.php`).
- Raw cURLs: see `captures/ndmc.txt`
- **Zones → cityId** (from NDMC uptime repo):
  | Zone | cityId |
  |---|---|
  | SP | 2 |
  | City | 3 |
  | Civil Lines | 4 |
  | Karol Bagh | 5 |
  | Narela | 6 |
  | Rohini | 7 |
- Sheet's NDMC tab referenced `http://app.citilight.co./admin/ulb_group_wise_connect.php`
  (a ULB group‑wise connectivity view). **TODO:** confirm whether NDMC connectivity is
  read from `getListViewData_v1` (per zone) or that `ulb_group_wise_connect.php` page.

---

## Server B — VELOCITI  (GC BOT, KG BOT, Nalanda, Bhopal, JD, Puri)   ✅ captured

- **Base:** `https://velociti.citilight.co:444`
- **Login:** `POST /login`  (form: `username=admin&password=<YOUR_PASSWORD>`)
- **List data:** `POST /getListViewData_v1`
  body: `{cityId, deviceType:"1"|"2", zoneName:"0", wardName:"0", streetName:"0", userId:"101"}`
  - `deviceType:"1"` = CCMS view, `deviceType:"2"` = ILC view
- **Geography (city list):** `GET /getCityGeography?userId=101`
- **userId:** `101`
- **cityId map** (from geography; ⚠ some truncated in capture, verify live):
  | Project | cityName | cityId |
  |---|---|---|
  | GC BOT | GCBOT | **11** |
  | Bhopal | BHOPAL | **48** |
  | Nalanda | NALANDA UNIVERSITY | **31** |
  | JD | JD PUNE | **57** |
  | KG BOT | KG BOT | ? (truncated — get live) |
  | Puri | PURI | ? (truncated — get live) |
  - Also present on this server: BATHINDA, KDMC (42), DEHRADUN, IRCON, JAIPUR, etc.
- Raw cURLs: see `captures/velociti.txt`

---

## Server C — KDMC   (103.248.31.109)   ✅ captured

- **Base:** `http://103.248.31.109:8080`  (plain HTTP; use `--insecure` equivalent /
  `rejectUnauthorized:false` if redirected to TLS)
- **Login:** `POST /login`
- **List data:** `POST /getListViewData_v1`
  body: `{cityId:"2", deviceType:"1"|"2", zoneName:"0", wardName:"0", streetName:"0", userId:"10"}`
- **Geography:** `GET /getCityGeography?userId=10`
- **Gateway list:** `POST /getDeviceList_V2`
  body: `{cityId:2, deviceType:"10", zoneName:"0", wardName:"0", streetName:"0", userId:"10"}`
- **cityId:** `2`   **userId:** `10`
- **deviceType:** 1 = CCMS, 2 = ILC, 10 = gateway
- Raw cURLs: see `captures/kdmc.txt`

---

## Server D — BHATINDA  (dc.citilight.co)   ✅ captured

- **Base:** `https://dc.citilight.co`
- **Login:** `POST /login` (form: `username=admin&password=<YOUR_PASSWORD>`)
- **List data:** `POST /getListViewData_v1`
  body: `{cityId:"52", deviceType:"1"|"2", zoneName:"0", wardName:"0", streetName:"0", userId:"1"}`
  - Only `deviceType:"2"` (ILC) was captured; CCMS = `"1"` (confirm Bhatinda has CCMS).
- **Gateway list:** `POST /getDeviceList_V2`
  body: `{cityId:52, deviceType:"10", zoneName:"0", wardName:"0", streetName:"0", userId:"1"}`
- **cityId:** `52`   **userId:** `1`
- **Geography:** not captured — likely `GET /getCityGeography?userId=1` (fetch live).
- Raw cURLs: see `captures/bhatinda.txt`

---

## Open questions (to resolve before/while building)

1. Confirm connectivity = `last_update` window count (panels) + `meterTime` (meters).
2. Per velociti project: count CCMS (type 1), ILC (type 2), or both? Which maps to each
   row in the existing sheet.
3. NDMC: `getListViewData_v1` per zone vs the `ulb_group_wise_connect.php` page.
4. Output format: replicate existing sheet layout vs clean consolidated summary.

## Design requirements (from user)

- **Dynamic reference time:** connectivity is computed from the moment the user runs it
  (or a user‑supplied timestamp) — NOT a static/hardcoded time. Windows (30 min / 24 hr /
  48 hr) are measured backward from that `now`.
- **Extensible / config‑driven:** adding a future city must be trivial — one config entry
  `{name, base, cityId, userId, deviceTypes, paths, tls}`; no code edits. A single
  CITIES array drives login + fetch + report.

## Per‑server quick params

| Server | Base | cityId | userId | TLS |
|---|---|---|---|---|
| NDMC | smartlight.citilight.co:446 (`/smartlight/...`) | 2–7 (per zone) | 10 | https |
| Velociti | velociti.citilight.co:444 | 11,48,31,57,KGBOT?,PURI? | 101 | https |
| KDMC | 103.248.31.109:8080 | 2 | 10 | http |
| Bhatinda | dc.citilight.co | 52 | 1 | https |

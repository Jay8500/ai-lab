# LIS — results, devices and the connector

## How results flow
```
Register (tests from the lab's catalogue)  →  Labels (barcode = token + tube letter, e.g. SRS-1019-004-E)
   →  Analyzer reads the tube  →  Lab Connector  →  device-ingest  →  test_results (status 'entered', source 'device')
   →  or a technician types values in Results (status 'entered', source 'manual')
   →  Lab admin / Pathologist: Verify & create report  →  PDF (jsPDF) uploaded as the visit report
   →  existing flow: Ready → WhatsApp / tracking / AI explanation; exact values saved for trends
```

## Data
- `tenants.test_catalog[].params[]` — `{ key, name, unit, type: number|text|option, options, low, high, low_f, high_f, decimals, formula, section }`,
  plus `sample` (tube) and `department`. Standard templates: `src/app/core/test-templates.ts` (labs must review ranges).
- `visits.tests` keeps only `{ code, name, price, tat_hours, sample }` (see `orderedTest`).
- `test_results` — one row per visit + test: `values { KEY: { v, n, flag } }`, `status pending|entered|verified`, `source manual|device`.
  Trigger `test_results_guard`: only `lab_owner` or staff titled **Pathologist** can verify (`can_verify_results()`); changing a
  verified result sends it back to `entered`. Removing a test from a visit deletes its unverified results.
- `lab_devices` — settings, `mapping [{ device_code, test_code, param_key }]`, `key_hash` (SHA-256; key shown once via `rotate_device_key`).
- `device_messages` — every message received (raw, summary, status matched|partial|unmatched|error, simulated).

## device-ingest (edge function)
`POST {SUPABASE_URL}/functions/v1/device-ingest` with `Authorization: Bearer sadev_…` and the raw message as `text/plain`
(ASTM E1394 / LIS2-A2 or HL7 v2 ORU^R01) — or JSON `{ results: [{ sample, code, value, unit?, flag? }] }`.
- ASTM: STX/ETX framing and checksums are stripped; sample id = `O` record field 3 (or 4); results from `R` records (`^^^CODE`, value, unit, flag).
- HL7: sample id = `OBR-3` (or `OBR-2` / `SPM-2`); results from `OBX` (code = OBX-3.1, value OBX-5, unit OBX-6, flag OBX-8).
- Sample id → visit token (regex `[A-Z]{1,5}-\d{4}-\d{3}`, tube suffix ignored). Codes → mapping, else a parameter key equal to the code.
- Flags from the lab's ranges (female overrides), else the analyzer's H/L/N/A flag. Verified results are never overwritten.
- The simulator in Devices calls the same function with the signed-in admin's token + `{ device_id, simulate: true, message }`.

## Lab Connector (to build — needs a real analyzer)
Small Windows service per lab PC: config = device key + port (COMx + baud, or TCP host/port, or a watched folder).
- ASTM over serial: answer ENQ with ACK, ACK each frame, collect until EOT, POST the message, retry with backoff when offline.
- TCP: same framing on a socket (analyzer is usually the client; connector listens on the configured port).
- Logs locally; never stores results — AI-Lab is the source of truth.
Test with the vendor's interface manual and the Devices → message log.

# Departments — configurable lab setup (planned, not built)

Idea from a lab technician (2026-10-19): a diagnostic centre is several departments — pathology sections, radiology,
microbiology, histopathology, sample collection, outsourcing — each with its own process. **Each lab admin configures which
departments they run**, and that drives patient registration, collection, worklists, reporting and the patient portal.

## Today (what exists and what limits us)
| Today | Limit for departments |
|---|---|
| `tenants.test_catalog` jsonb — `{ code, name, price, tat_hours, params[], sample, department }` | `department` is free text; no department settings |
| `visits.status` — one status per visit (collected → in_lab → verified → ready → delivered) | a visit with an X-ray + CBP has two different progresses |
| `visits.report_path` — one PDF per visit | radiology and pathology need separate reports / signers |
| `test_results` — one row per visit + test (values jsonb, entered/verified) | ✅ already per test — reuse for values, culture, narrative |
| `profiles.title` (Pathologist, Lab technician…) | no department scoping for worklists / sign-off |
| `test_bookings` — date + morning/afternoon/evening | radiology needs exact appointment slots per machine |
| `lab_devices` — analyzer mapping by test code | ✅ fits; devices can belong to a department |

## Design (additive — nothing existing breaks)

### 1. Lab setup (lab admin → new "Lab setup" page; also in Admin → lab editor)
```
tenants.departments jsonb   -- the lab's departments, seeded with defaults, switched on/off by the lab admin
[{ key: 'haem', name: 'Haematology', kind: 'pathology', active: true, signer_titles: ['Pathologist'], sort: 1 },
 { key: 'bio',  name: 'Biochemistry', kind: 'pathology', ... },
 { key: 'micro', name: 'Microbiology', kind: 'microbiology', signer_titles: ['Microbiologist','Pathologist'] },
 { key: 'histo', name: 'Histopathology', kind: 'histopathology' },
 { key: 'xray', name: 'X-ray', kind: 'radiology', signer_titles: ['Radiologist'] },
 { key: 'usg',  name: 'Ultrasound', kind: 'radiology' }, { key: 'ecg', name: 'ECG / Cardiology', kind: 'radiology' },
 { key: 'out',  name: 'Outsourced', kind: 'outsourced' }]
```
`kind` decides the workflow: `pathology` (values + ranges — today's flow) · `microbiology` (culture + antibiotic table) ·
`histopathology` (written report) · `radiology` (appointment + narrative report) · `outsourced` (send to partner lab).

Test catalogue items gain: `department` (key, not free text) and, by kind:
- radiology: `modality`, `duration_min`, `prep` (e.g. "full bladder", "6 h fasting"), `needs_appointment`
- outsourced: `partner_lab_id`, partner TAT
- narrative tests: `template_id`

Staff: `profiles.departments text[]` (null = all) — drives worklists; new titles Radiologist, Radiographer, Microbiologist,
Phlebotomist / Sample collector. Verify / sign-off allowed for `signer_titles` of that department (+ lab admin).

New lab tables:
- `lab_resources` — rooms / machines for appointments (X-ray room, USG-1, CT): department, open hours, slot minutes.
- `report_templates` — narrative templates per test (sections: Findings, Impression…), editable by the lab.
- `reference_labs` — outsourcing partners (name, contact, TAT).

### 2. Per-test progress: `visit_items`
```
visit_items(id, tenant_id, visit_id, test_code, department, kind,
            status,            -- pathology: ordered → collected → received → in_progress → entered → verified → reported
                               -- radiology: scheduled → arrived → scanned → reported
                               -- outsourced: ordered → sent → received_back → reported
            sample_barcode, collected_at, collected_by, rejected_reason,
            scheduled_at, resource_id,                       -- radiology appointment
            sent_to, sent_at,                                -- outsourcing
            report_id)                                       -- which report it is printed on
```
- Backfilled from `visits.tests`; `test_results` stays the store for values / culture / narrative content (keyed visit + test).
- **`visits.status` stays** as the summary, maintained by a trigger from its items (e.g. ready when every item is reported),
  so the dashboard, tracking page, WhatsApp and AI keep working unchanged.

### 3. Several reports per visit: `visit_reports`
`visit_reports(id, visit_id, department, kind, path, signed_by, signed_at)` — pathology combined PDF, each radiology study its
own PDF with the radiologist's signature. `visits.report_path` keeps pointing at the latest / combined one for compatibility;
the patient page lists all reports.

### 4. How it changes each screen
| Screen | Change |
|---|---|
| **Registration** (front desk + online booking) | test picker grouped by department tabs; radiology tests ask for a slot on a resource; prep instructions on the receipt; outsourced tests show the longer TAT |
| **Sample collection** (new) | collection desk queue; scan tube barcode → collected time + phlebotomist; reject & recollect; **home-collection** assignment to a collector with a simple phone list |
| **Worklists** | Results screen filtered by the user's departments; radiology worklist by appointment time |
| **Reporting** | pathology = today's values screen · microbiology = organism + S/I/R antibiotic grid, interim/final · histopathology & radiology = template editor (Findings / Impression) · sign-off by department signers |
| **Patient portal / tracking** | per-test progress ("CBP ready · USG Abdomen scheduled 4 pm"); several report PDFs |
| **Bookings** | radiology tests book a real slot from `lab_resources` availability |
| **Devices** | a device belongs to a department; ingest unchanged (by test code) |
| **AI** | explanations per report; trends unchanged (values) |

## Build phases
| # | Phase | Depends on |
|---|---|---|
| D1 | **Lab setup + departments** (config page, department on tests, staff departments) and **grouped registration** | — |
| D2 | **visit_items** (per-test progress, summary trigger) + department worklists + per-test status on the patient page | D1 |
| D3 | **Sample collection** desk + home-collection assignment + rejection | D2 |
| D4 | **Radiology**: resources & appointments, narrative templates, radiologist sign-off, separate report (`visit_reports`) | D2 |
| D5 | **Microbiology** (culture & sensitivity) and **histopathology** (narrative) | D2, D4 templates |
| D6 | **Outsourcing** to reference labs | D2 |
| later | PACS / DICOM image viewing for radiology | D4 |

Rule: every phase ships behind the lab's own settings — a lab that only does pathology sees no change.

# ArbeitMgmt · Quick Visit Report

**Working local-first development beta, not a production subscription or an app-store release.** A constrained experiment for independent property-care providers in Austria who already send customer work updates. Demand, pricing and profitability are hypotheses, not validated findings.

## Run locally

Node **22.12 or newer** (tested with 22.21.1). No runtime dependencies, accounts, API keys or payment secrets are needed.

```powershell
npm ci --ignore-scripts
npm run build
npm run preview
# Open http://127.0.0.1:42870
```

`npm run dev` serves the source on the same address. `npm run build` creates an offline-ready **beta** in `dist`. `npm run preview` serves that build, loopback-only; it does not deploy anything. Set `$env:PORT='42872'` to choose another port. Do not change origins (including localhost vs 127.0.0.1 or port) without exporting a backup: browser records belong to one origin.

This development environment lacked Node, so a portable official Node 22.21.1 Windows x64 distribution was downloaded into ignored `.tools` and checked against the official `SHASUMS256.txt`. No machine-wide installation occurred. On this worktree only, commands can use:

```powershell
$env:PATH = "$pwd\.tools\node-v22.21.1-win-x64;$env:PATH"
& .\.tools\node-v22.21.1-win-x64\npm.cmd run build
& .\.tools\node-v22.21.1-win-x64\npm.cmd run preview
```

## Implemented

- Initial language selection, changeable in settings: **English, Austrian German, Polish, Turkish, Romanian**. Interface and report-template text only; user content is never translated.
- Create visits with a short job reference and optional client/site; capture typed notes under work completed, observations and outstanding items.
- Import JPEG/PNG/WebP or use the device's camera file picker where supported. Originals are preserved separately from resized, re-encoded report copies. HEIC is rejected with a visible error.
- Notes/photos default to **internal**. Each requires explicit inclusion in the client report. Metadata fields are labelled client-visible. Saved note originals and edit histories remain internal. Photo caption/visibility changes retain history.
- One save persists the whole editor atomically, including new notes and selected photos. Quota errors retain the unsaved form. Unsaved-navigation warnings and optimistic revision checks prevent silent data loss between tabs.
- Exact paginated preview and on-device A4 PDF generation, with file download and feature-detected Web Share file handoff. No recipient account. Unsupported sharing offers save-and-attach instead.
- IndexedDB records; offline app-shell caching; local capture, preview and PDF downloads without a network after the shell is ready. Persistent-storage request, full JSON backup/replace-restore, individual item/visit deletion and erase-all.
- 14-day local beta trial, no payment details or automatic charge. After expiry, **no new visits**, while existing visits remain editable and exportable, including full backups.

Typing is always available. There is no app-level dictation: browser speech recognition can use cloud services, so it was deliberately omitted. Users may choose their own keyboard dictation under their OS provider's terms. No conversations are recorded by this app.

## Platform and data safety

The first target is **Android Chrome as an installable web app**, chosen to validate one small workflow without native build/signing infrastructure or paid services. Manifest PNG icons and a service worker are included. Install/add-to-Home-screen is offered by the browser; it is **not native Play Store readiness**. Real Android installation, camera orientation/file formats, download locations, low-memory behavior and recipient-app sharing are release acceptance tasks. iOS/Safari are not yet accepted platforms.

The local server intentionally listens only on `127.0.0.1`. HTTPS is required outside localhost for service workers and supported sharing. There has been no public deployment. Do not expose a server or publish a store build without explicit approval.

**Storage is not guaranteed permanent.** IndexedDB survives ordinary reloads/browser restarts in the tested desktop browser. Browser policies, storage pressure/eviction, clearing site data, private browsing and device loss can erase records. A successful persistence request reduces some eviction risk; it is not a backup or device-loss protection. Installation is not a backup. The app does not sync to any cloud.

Use a locked, encrypted device and a private browser profile; this app does not encrypt IndexedDB or its backups or add an app PIN. Anyone with access to that profile may read records. The runtime has no third-party scripts, external fonts, analytics, ads, account system, location or microphone access. Its network requests fetch same-origin static app assets only.

**Back up regularly** in Settings. A full backup contains *all* original photos (including source metadata), internal notes and revision history. It is intentionally labelled **unencrypted/private**, with a confirmation before download. Never send it to a client. Store it in a secure location separate from the device and periodically verify restoration. “Download requested” is not a claim that the OS saved the file successfully.

Restore validates the supported schema before an atomic replacement of all records/settings; it never merges. Export current data before restoring. Beta limits: 500 visits, 50 notes and 50 photos per visit, 6 MB and 40 megapixels per input image, 6,000 characters per note, 1,000 edits per item, **60 MB of serialized records total**, 80 MB backup-file import. The total-record limit preserves a restorable full-backup path. These are beta resource limits, not subscription tiers.

Deleting data here does not retract previously exported backups or shared reports. Collect minimal personal data, avoid people/identifiers in photos unless necessary and appropriately permitted, and check recipient addresses in the sharing app.

### PDF privacy and Unicode

`clientReport()` constructs an allowlisted projection with only selected notes/photos and client-visible visit fields. The renderer never receives originals, internal items, file names or edit histories.

The preview displays exactly the JPEG page bytes embedded in the PDF. Photo copies and pages are re-rendered with Canvas, stripping source EXIF/embedded metadata. The PDF has no text layer, attachments, annotations or document metadata stream. Private visual details **inside a selected photo** are still visible: preview every report yourself. Never claim these records are court-proof or certified evidence; timestamps use the editable device clock.

Canvas uses the device's Arial/sans-serif font stack for Unicode. Automated browser checks and visual inspection cover Austrian German, Polish, Turkish and Romanian characters on Windows Edge. Font availability and visual quality still require Android testing and fluent human language review. **Raster text is not selectable/searchable and the PDF is not accessibility-tagged**; an accessible HTML transcript is included in the preview, but is not a substitute for an accessible PDF attachment. Tagged/vector PDF export is a release accessibility decision, not a completed feature.

## Subscription: deliberately not production-ready

Proposed price: **EUR 2.99/month including applicable VAT**. No annual plan. The 14-day trial requires no payment method; it never becomes a paid subscription automatically. No checkout, fake-success checkout or paid entitlement switch exists. Purchase is explicitly unavailable.

Local browser time/settings can be changed or cleared; they are **not secure subscription enforcement**. Selling this beta is blocked. `BUILD_CHANNEL=production npm run build` deliberately fails. The normal build remains visibly labelled beta; this guard is an accidental-release check, not DRM.

A real launch needs an approved billing/provider choice, explicit post-trial purchase and cancellation flow, receipts/tax treatment, secure verified entitlements, a documented offline/grace policy that retains existing-record access, and real sandbox/device testing. None is configured, and no payment has been accepted or secret requested. Do not add a client-side paid/unlock flag as a shortcut.

## Languages and provisional fifth option

English, Austrian German, Polish and Turkish are user-required. **Romanian is provisional**, not a proven buyer/workforce ranking. Secondary search results pointed to Statistics Austria's [Migration & Integration 2025 press release](https://www.statistik.at/fileadmin/announcement/2025/07/20250716MigrationIntegration2025EN.pdf), suggesting relevance of Romanian residents. Direct primary-source retrieval was denied during the initial environment setup, so its specific figures and sector/buyer relevance were **not independently verified**. No demographic count is claimed here.

Keep Romanian provisional until evidence from actual Austrian property-care providers supports or changes the choice. All translations are implementation drafts; **fluent human review in all five languages remains a release prerequisite**. Interface localization is not speech recognition, content translation or approval for bilingual reports.

## Verification

```powershell
npm test
npm run build
npm run test:e2e
```

Browser tests use installed **Microsoft Edge** through Playwright, a 390×844 mobile-sized viewport, and port 42871 (`TEST_PORT` overrides it). They do not download another browser or use production data. For another development OS with Chromium, adjust `channel` in the Playwright configuration and the persistent-context test before running. All data is synthetic.

Tests cover model/privacy projection and trial boundaries; language-key parity; backup validation; PDF cross-reference offsets; actual IndexedDB/browser-profile restart; offline reload/capture/PDF download; real PDF parser acceptance, page images and absence of attachments/metadata; all five language templates; backup download/erase/restore; cross-tab conflicts; trial-expired export; invalid images and storage/quota error feedback; HTML escaping; long multi-page output; and feature-detected share/cancel/fallback behavior.

Latest local run (27 October 2026): **10 Node tests passed, beta build passed, 12 Edge browser tests passed**. The production-channel rejection test passed. The PDF test also checks that original JPEG comment metadata and a distinct private photo are absent, while embedded report page bytes exactly match the preview. Manifest PNG dimensions and offline caching are checked, as is visible failure when offline setup never confirms readiness. German/Romanian full-resolution report pages and Polish/Turkish mobile preview screenshots were visually inspected for the included Latin diacritics; this was not fluent human translation review or Android acceptance. `npm audit --omit=optional` reported zero known advisories for the installed development dependency set at the time of this run.

The Web Share test intercepts the API to inspect the actual PDF `File`; **it does not prove delivery through a real recipient app**. Offline behavior is tested with browser network access disabled, not only a UI indicator. Images/screenshots and traces are generated under ignored `test-results`.

Build output and runtime dependencies are separate: only dev/test packages are installed. The app itself is dependency-free. The local server is a development server, not a production hosting recommendation.

## Before any external beta / paid release

1. Real Android Chrome install/restart/offline/camera/PDF-download/share acceptance, including rotated photos, low storage and interruption during save. Test a genuine restore onto another device/profile. Verify all five language glyphs on device.
2. Fluent localization review; accessibility review (including raster PDF limitations); validate practical limits with real provider workflows using consented, minimal data.
3. Validate willingness to pay and unit economics; choose billing and secure entitlement architecture with explicit money/security approval. No real payments yet.
4. Establish real business identity and obtain appropriate Austrian business-registration, tax/VAT/SVS, consumer/B2B classification, privacy/GDPR roles and retention, terms/liability and insurance advice. Assess processor agreements for any later services, accessibility obligations and CRA applicability. In-app development disclosures are **not professionally reviewed legal compliance**.
5. Threat-model device/profile access and unencrypted backups; decide whether this risk posture is acceptable for actual customer data or whether encryption/native storage is required. Review dependencies and update policy before distribution.
6. Approve an HTTPS beta distribution/hosting plan and release channel explicitly. No app-store submission or public deployment has been authorised.

### Practical backlog (not launch claims)

- **Next:** real-device acceptance; human language review; privacy/legal/business review; validate fifth language and buyer demand.
- **Before monetisation:** secure billing/entitlements and offline policy; explicit purchase/cancellation; verify actual VAT economics.
- **Before broader release:** accessible PDF alternative, stable version/migration policy, user-visible safe update notification, backup encryption decision, Android memory/performance profiling.
- **Deliberately deferred:** cloud sync/archive, teams, accounting/invoicing, signatures, video, location/employee tracking, paid cloud AI/transcription/translation, diagnosis, customer accounts/portals and marketplaces.

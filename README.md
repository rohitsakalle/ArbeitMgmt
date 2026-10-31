# ArbeitMgmt · Quick Visit Report

**Working local-first development beta, not a production subscription or an app-store release.** A constrained experiment for independent property-care providers in Austria who already send customer work updates. Demand, pricing and profitability are hypotheses, not validated findings.

## Run locally

Node **22.12 or newer** (tested with 22.21.1). No accounts, API keys or payment secrets are needed. Pinned PDF-generation/preview libraries and the embedded font are packaged locally; no CDN or remote font request is used.

```powershell
npm ci --ignore-scripts
npm run build
npm run preview
# Open http://127.0.0.1:42870
```

`npm run dev` serves the source on the same address and prepares local PDF runtime assets. `npm run build` prepares these assets and creates an offline-ready **beta** in `dist`. `npm run prepare:runtime` prepares them separately when needed. `npm run preview` serves the build, loopback-only; it does not deploy anything. Set `$env:PORT='42872'` to choose another port. Do not change origins (including localhost vs 127.0.0.1 or port) without exporting a backup: browser records belong to one origin.

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
- Exact paginated preview rendered from the actual generated PDF, with selectable/searchable embedded-font Unicode text, described photos in content order, file download and feature-detected Web Share file handoff. No recipient account. Unsupported sharing offers save-and-attach instead. The PDF remains **untagged, not certified accessible/PDF-UA**.
- IndexedDB records; offline app-shell caching; local capture, preview and PDF downloads without a network after the shell is ready. Persistent-storage request, full JSON backup/replace-restore, individual item/visit deletion and erase-all.
- 14-day local beta trial, no payment details or automatic charge. After expiry, **no new visits**, while existing visits remain editable and exportable, including full backups.

Typing is always available. There is no app-level dictation: browser speech recognition can use cloud services, so it was deliberately omitted. Users may choose their own keyboard dictation under their OS provider's terms. No conversations are recorded by this app.

## Platform and data safety

The first target is now a **native-installable Android debug beta using Capacitor**, while retaining the Android Chrome/PWA beta. See [Android build/install instructions, integration and limitations](docs/ANDROID.md). The APK packages offline assets, app-private atomic saved records, system camera/document pickers and safe content-URI PDF save/share; no server or recipient account is needed. It is **not a Play Store release or production subscription**. Browser and native datasets are separate: use a private backup/restore to transfer records. iOS/Safari are not accepted platforms.

No authorised physical Android device is available; `adb devices -l` lists none before emulator setup. Physical camera, restart/offline, save/restore, recipient-app delivery, performance and accessibility remain **blocked acceptance tasks**, with consent-first steps in [the Android acceptance checklist](docs/ANDROID-ACCEPTANCE.md). Desktop tests and emulator tests are distinct from physical acceptance.

The local server intentionally listens only on `127.0.0.1`. HTTPS is required outside localhost for service workers and supported sharing. There has been no public deployment. Do not expose a server or publish a store build without explicit approval.

**Storage is not guaranteed permanent.** IndexedDB survives ordinary reloads/browser restarts in the tested desktop browser. Browser policies, storage pressure/eviction, clearing site data, private browsing and device loss can erase records. A successful persistence request reduces some eviction risk; it is not a backup or device-loss protection. Installation is not a backup. The app does not sync to any cloud.

In Android, saved records instead use atomic app-private no-backup files with snapshot/visit conflict checks. App data and full backups are not encrypted by ArbeitMgmt. Uninstall/clear-data/device loss can erase them. Save typing before switching apps: unsaved drafts are not process-death durable. Camera/photo import commits editor changes first and retains an idempotent recovery token. Native PDF/backup saves report provider-write completion; share feedback reports chooser opening, not recipient delivery. Large base64 snapshots still need device memory profiling.

Use a locked, encrypted device and a private browser profile; this app does not encrypt IndexedDB or its backups or add an app PIN. Anyone with access to that profile may read records. The runtime has no externally hosted scripts/fonts, analytics, ads, account system, location or microphone access. Its network requests fetch same-origin static app assets only. Locally bundled pdfmake and PDF.js are third-party code; review updates and their notices before distribution.

**Back up regularly** in Settings. A full backup contains *all* original photos (including source metadata), internal notes and revision history. It is intentionally labelled **unencrypted/private**, with a confirmation before download. Never send it to a client. Store it in a secure location separate from the device and periodically verify restoration. “Download requested” is not a claim that the OS saved the file successfully.

Restore validates the supported schema before an atomic replacement of all records/settings; it never merges. Export current data before restoring. Beta limits: 500 visits, 50 notes and 50 photos per visit, 6 MB and 40 megapixels per input image, 6,000 characters per note, 1,000 edits per item, **60 MB of serialized records total**, 80 MB backup-file import. The total-record limit preserves a restorable full-backup path. These are beta resource limits, not subscription tiers.

Deleting data here does not retract previously exported backups or shared reports. Collect minimal personal data, avoid people/identifiers in photos unless necessary and appropriately permitted, and check recipient addresses in the sharing app.

### PDF privacy and Unicode

`clientReport()` constructs an allowlisted projection with only selected notes/photos and client-visible visit fields. The renderer never receives originals, internal items, file names or edit histories.

PDF export now uses pdfmake with embedded, subsetted Roboto fonts rather than image-only pages. PDF.js renders the actual resulting bytes into the preview, so there is not a second approximate layout. Photos are re-encoded with Canvas both on import **and again on export**, stripping source EXIF/embedded metadata even from restored report images. No original files, internal items, file names or revision histories reach the PDF definition. There are no attachments or annotations. The document title is the localized report-template title; creator/producer are static app/library names, and library-generated creation/standard metadata is not certified provenance. No private item is used for metadata.

Private visual details **inside a selected photo** are still visible: preview every report yourself. Never claim these records are court-proof or certified evidence; timestamps use the editable device clock.

Text is now **selectable/searchable**, with tested extraction of Austrian German, Polish, Turkish and Romanian characters. Fonts no longer depend on device-installed Arial. Font cmap checks cover every translated string and target-language diacritics in regular and bold; unsupported selected characters (for example some emoji/scripts) stop export visibly instead of silently substituting missing glyphs. Original notes are preserved; changing a client-facing copy records the prior text internally. Internal unsupported text never reaches PDF validation.

Each included photo now requires a user-written description before export. The numbered description precedes the image in visual/content order; it is never fabricated from the original filename. Uncaptioned internal photos do not block export, and existing records are not rewritten on upgrade. The PDF is **not tagged**, has no semantic figure alt-tags, and is **not claimed PDF/UA-compliant or certified accessible**. Selectable text and ordered captions improve access but are not enough to establish screen-reader usability. Tagged structure, real TalkBack/PDF-reader evaluation, font/rendering checks on Android and accessibility review remain release gates. The HTML transcript is still available in the preview.

Roboto is redistributed under SIL OFL 1.1 with the authors' notice; pdfmake uses MIT and PDF.js Apache-2.0. See [the bundled-code/font notices](licenses/README.md). Generated vendor assets and licensing notices are packaged/cacheable locally; no paid services or cloud PDF conversion are used.

## Subscription: deliberately not production-ready

Proposed price: **EUR 2.99/month including applicable VAT**. No annual plan. The 14-day trial requires no payment method; it never becomes a paid subscription automatically. No checkout, fake-success checkout or paid entitlement switch exists. Purchase is explicitly unavailable.

Local browser time/settings can be changed or cleared; they are **not secure subscription enforcement**. Selling this beta is blocked. `BUILD_CHANNEL=production npm run build` deliberately fails. The normal build remains visibly labelled beta; this guard is an accidental-release check, not DRM.

A real launch needs an approved billing/provider choice, explicit post-trial purchase and cancellation flow, receipts/tax treatment, secure verified entitlements, a documented offline/grace policy that retains existing-record access, and real sandbox/device testing. None is configured, and no payment has been accepted or secret requested. Do not add a client-side paid/unlock flag as a shortcut.

## Languages and provisional fifth option

English, Austrian German, Polish and Turkish are user-required. **Romanian is provisional**, not a proven buyer/workforce ranking. Secondary search results pointed to Statistics Austria's [Migration & Integration 2025 press release](https://www.statistik.at/fileadmin/announcement/2025/07/20250716MigrationIntegration2025EN.pdf), suggesting relevance of Romanian residents. Direct primary-source retrieval was denied during the initial environment setup, so its specific figures and sector/buyer relevance were **not independently verified**. No demographic count is claimed here.

Keep Romanian provisional until evidence from actual Austrian property-care providers supports or changes the choice. All translations are implementation drafts; **fluent human review in all five languages remains a release prerequisite**. Interface localization is not speech recognition, content translation or approval for bilingual reports. Locale-aware number/currency/date formatters are shared by the UI and report. UI/report headings are translated, report field labels are separate from form-help text (not extracted by splitting a translated sentence), placeholder/key completeness is checked, and switching language never rewrites stored notes.

## Verification

```powershell
npm test
npm run build
npm run test:e2e
```

Browser tests use installed **Microsoft Edge** through Playwright, a 390×844 mobile-sized viewport, and port 42871 (`TEST_PORT` overrides it). They do not download another browser or use production data. For another development OS with Chromium, adjust `channel` in the Playwright configuration and the persistent-context test before running. All data is synthetic.

Tests cover model/privacy projection and trial boundaries; translation-key/placeholder/formatting and font-glyph completeness; backup validation; actual IndexedDB/browser-profile restart; offline reload/capture/PDF download with locally cached libraries/font/worker; real PDF text extraction and content order in all five templates; pixel-exact preview re-rendering of the saved PDF; no private data in extracted text/metadata or attachments; backup download/erase/restore; cross-tab conflicts; trial-expired export; invalid images and storage/quota error feedback; HTML escaping; long multi-page output; caption/unsupported-glyph errors; and feature-detected share/cancel/fallback behavior.

The initial image-only beta passed 10 Node + 12 Edge checks before its initial check-in. The selectable-text revision adds checks for target-language text extraction, embedded-font coverage, actual-PDF preview fidelity, required captions, restored-JPEG metadata stripping and explicit unsupported-glyph handling. Results must be from the current revision, not inferred from the initial raster pipeline. Screenshots/traces use synthetic data only. Automated extraction/visual review is **not fluent human translation review, physical Android acceptance or PDF/UA certification**.

Latest selectable-text run (27 October 2026): **14 Node tests passed, beta build passed, 15 Edge browser tests passed (29 total)**. This includes fresh PDF rendering matching every preview pixel, no external HTTP requests/CSP violations in the core workflow, and real offline export with the bundled libraries/font/worker. Turkish/Romanian full-resolution pages were visually inspected in addition to five-language text-extraction/font checks. `npm audit --omit=optional` reported **zero known advisories** at this run; upstream deprecation warnings remain documented in the notices and are not an assurance of safety.

Android revision (31 October 2026): **18 Node + 15 Edge + 3 Android emulator tests passed**, clean dependency install/debug APK build and app lint passed; an actual emulator force-stop/relaunch preserved saved records. Android 16/API 36, WebView 133, networking disabled; picker/share intents were intercepted, not delivered to a physical recipient. APK SHA/version, host cleanup, six moderate **developer-tool** advisories (zero app-runtime audit findings), warnings and precise outstanding checks are in [the Android guide](docs/ANDROID.md). All physical-device checks remain unperformed.

The Web Share test intercepts the API to inspect the actual PDF `File`; **it does not prove delivery through a real recipient app**. Offline behavior is tested with browser network access disabled, not only a UI indicator. Images/screenshots and traces are generated under ignored `test-results`.

PDF generation/preview runtime packages and development test packages are pinned in the manifest/lockfile. `npm ci --ignore-scripts` followed by the build prepares local assets without executing package installation hooks. Vendor output and `dist` are generated/ignored rather than manually vendored source; notices are included in the build. The local server is a development server, not a production hosting recommendation.

## Before any external beta / paid release

1. Real native Android APK install/restart/offline/camera/PDF-save/share acceptance, including rotated photos, low storage and interruption during save; separately accept the retained PWA. Test a genuine restore onto another device/profile. Verify all five language glyphs on device.
2. Fluent localization review; accessibility review (including missing PDF tags/semantic alt-text despite selectable Unicode text); validate practical limits with real provider workflows using consented, minimal data.
3. Validate willingness to pay and unit economics; choose billing and secure entitlement architecture with explicit money/security approval. No real payments yet.
4. Establish real business identity and obtain appropriate Austrian business-registration, tax/VAT/SVS, consumer/B2B classification, privacy/GDPR roles and retention, terms/liability and insurance advice. Assess processor agreements for any later services, accessibility obligations and CRA applicability. In-app development disclosures are **not professionally reviewed legal compliance**.
5. Threat-model device/profile access and unencrypted backups; decide whether this risk posture is acceptable for actual customer data or whether encryption/native storage is required. Review dependencies and update policy before distribution.
6. Approve an HTTPS beta distribution/hosting plan and release channel explicitly. No app-store submission or public deployment has been authorised.

### Practical backlog (not launch claims)

- **Next:** real-device acceptance; human language review; privacy/legal/business review; validate fifth language and buyer demand.
- **Before monetisation:** secure billing/entitlements and offline policy; explicit purchase/cancellation; verify actual VAT economics.
- **Before broader release:** tagged PDF/reader accessibility acceptance, stable version/migration policy, user-visible safe update notification, backup encryption decision, Android memory/performance profiling.
- **Deliberately deferred:** cloud sync/archive, teams, accounting/invoicing, signatures, video, location/employee tracking, paid cloud AI/transcription/translation, diagnosis, customer accounts/portals and marketplaces.

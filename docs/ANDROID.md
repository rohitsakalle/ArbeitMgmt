# Android debug beta

ArbeitMgmt now has a Capacitor **8.5.3** Android container, preserving the separate web/PWA beta. App ID `at.arbeitmgmt.beta`; version `0.2.0-beta`, version code `1`; minimum Android API **24**, compile/target API **36**, required Android System WebView **130 or newer**. These are build requirements, not a claim of acceptance on every Android version/device.

## Build locally

Use Node 22.12+, JDK 21, Android SDK platform 36 and build-tools 35.0.0. Install official tooling only in your own development environment, after reviewing its license terms. No Android Studio, paid account, server, API key or production signing key is needed.

```powershell
npm ci --ignore-scripts
npm run android:build
# APK: android\app\build\outputs\apk\debug\app-debug.apk
Get-FileHash android\app\build\outputs\apk\debug\app-debug.apk -Algorithm SHA256
```

`android:build` rebuilds web assets, runs `cap sync android`, then Gradle `assembleDebug`, `testDebugUnitTest` and `lintDebug`. `android:sync` alone only packages assets: it does not create an APK. The Android test suite is instrumented; empty host-side Gradle test tasks are not Android acceptance evidence.

`scripts/android-build.js` uses `JAVA_HOME` and `ANDROID_HOME` if supplied; otherwise it finds the portable JDK under `.tools\java` and SDK under `.tools\android-sdk`. Gradle state, Android user state and the standard generated **debug-only** keystore are confined to ignored `.tools`. Environment variables are process-local. Losing that key prevents installing an update over an earlier debug installation; **export/verify a backup first**, rather than uninstalling and losing records. Do not share the key or reuse it for release signing.

This worktree's portable Node:

```powershell
$env:PATH = "$pwd\.tools\node-v22.21.1-win-x64;$env:PATH"
& .\.tools\node-v22.21.1-win-x64\npm.cmd run android:build
```

The Gradle wrapper JAR SHA-256 was checked against the official Gradle checksum:
`7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172`.
The distribution SHA-256 is pinned in `android\gradle\wrapper\gradle-wrapper.properties`.

Official local tooling provenance:

| Tool | Source / verification |
|---|---|
| Temurin JDK 21.0.12.1+1 Windows x64 | Eclipse Adoptium API and official `adoptium/temurin21-binaries` release; archive SHA-256 `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e` matched the published checksum. Distribution license notices stay with the ignored JDK. |
| Android command-line tools 19.0 | `https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip`; archive SHA-1 `54a582f3bf73e04253602f2d1c80bd5868aac115` matched Google's HTTPS repository manifest. |
| SDK/platform-tools/emulator/system image | Google's SDK manager 19.0 fetched official SDK packages and license notices. SDK terms were accepted for local development; no paid account or machine-wide installation. Latest tools 23 bootstrapped a new metrics-capable CLI during inspection, so subsequent setup used pinned standalone 19.0 instead; no `android init` or repository agent customization was run. |
| Gradle 8.14.3 / Android Gradle Plugin 8.13.0 | Official Gradle distribution with checksum pin; Google Maven/Maven Central dependencies. Capacitor-generated versions retained; do not upgrade Gradle alone without compatibility checks. |

Tool archives, SDKs, Gradle state, private keys, copied assets and APK/AAB files are **not checked into Git**. Native Capacitor code is MIT; Android/AndroidX and embedded PDF/font notices retain upstream licenses. Generated `THIRD-PARTY-NOTICES.txt` is bundled with local web assets. Tooling licenses do not establish product/legal/store approval.

## Native behavior and limitations

Saved records use one versioned JSON snapshot in Android's **no-backup app-private directory**, written with `AtomicFile` and a snapshot compare-and-swap version. Each visit also retains revision checks. A failed write is not presented as saved; a corrupt store is not silently replaced with an empty database. Native and browser stores are deliberately separate: move data using an explicit private backup/export and validated restore, not by changing the origin or assuming browser records migrate automatically.

Core assets, PDF libraries, fonts and worker are inside the APK at the stable packaged origin `https://localhost`; native offline readiness does not depend on a service-worker download. Capture, persistence and actual PDF generation still require WebView acceptance rather than assuming desktop APIs work. WebView file/content navigation is disabled; external navigation is blocked; cleartext traffic is disabled. Android automatic cloud/device-transfer backups are excluded. System screen capture/task screenshots are blocked with `FLAG_SECURE`; this is not encryption or protection from a compromised/unlocked device.

The system document picker imports JPEG/PNG/WebP without broad media/storage permissions. Camera capture delegates to a device camera app with a narrowly scoped writable FileProvider URI; the app does not request camera, microphone or location runtime permissions. Missing/denied camera/file access is an explicit failure; cancellation is not success. Device camera apps have their own permission behavior.

Before opening the camera/photo picker, the editor commits typed edits. Pending original bytes and an import token remain app-private; recovery is idempotent across relaunch, preventing a duplicate if Android stops the process after a visit save but before acknowledgement. An interrupted or invalid pending import can be explicitly discarded in Settings. Unsupported/oversized images never silently become a report photo. The 6 MB/40 megapixel limits still apply; some modern camera photos exceed them.

**Save changes before leaving the app.** Unsaved typing is not promised to survive Android process death. Saved snapshots survive ordinary process restart; uninstall, clear-data, storage/media failure or device loss can erase them. Atomic snapshots and local trial dates are not tamper-proof, encryption, certified evidence or a backup. Large base64 photo collections and full-snapshot bridge transfers require real-device memory/performance testing; 60 MB is a logical beta cap, not a proven smooth performance threshold on every device.

PDF save and private backup export use Android `ACTION_CREATE_DOCUMENT`; the app reports success only after writing/closing the selected provider stream. A provider or recipient can have its own network dependency: choose local storage for offline tests. Restore uses `ACTION_OPEN_DOCUMENT`, bounds file size and validates the schema before replacing all saved records.

PDF sharing uses `ACTION_SEND`, MIME `application/pdf`, a `content://at.arbeitmgmt.beta.fileprovider/...` URI, ClipData and **read-only** temporary grant. Only the already-previewed report blob goes through this path; backups cannot use this share method. FileProvider exposes only dedicated temporary report/camera directories, not the record store. Original-photo export is an explicit separate internal action. A share chooser opening is **not confirmed recipient delivery**; cancellation inside a recipient app may not be observable by the sender.

Temporary exports remain in app cache to allow recipient reads; they are cleaned on a later app launch after 24 hours. Erase-all also removes pending/temp local files, but cannot recall recipient/exported copies. Reports are untagged selectable Unicode PDFs, **not certified accessible/PDF-UA**.

## Install and smoke-test safely

Only install on a device/emulator selected explicitly. A physical owner must approve the installation and any debugging prompt. Stop on `unauthorized`; do not bypass trust prompts.

```powershell
adb devices -l
adb -s APPROVED_SERIAL install -r android\app\build\outputs\apk\debug\app-debug.apk
adb -s APPROVED_SERIAL shell am start -n at.arbeitmgmt.beta/.MainActivity
```

No server, ADB reverse, public URL or recipient account is needed for this native APK. Sideloading a debug build is **not publishing to Play**. No physical device is currently accepted.

For an explicitly approved emulator/device, run:

```powershell
$env:ANDROID_SERIAL='APPROVED_SERIAL'
node scripts\android-build.js --instrumented
```

The instrumented checks cover native atomic reopen/stale-write behavior; packaged WebView/bridge startup; native record persistence; actual Unicode PDF generation, parser extraction and private-item exclusion; file-provider scope; PDF read-only share URI; save/import callbacks; and cancellation/error handling. File/camera/share intent interception checks API behavior, **not actual recipient delivery or physical camera quality**.

Test genuine airplane-mode cold start, normal close, process kill/relaunch, large/rotated photos, actual provider save/restore, recipient app, accessibility and device storage pressure using [the physical acceptance checklist](ANDROID-ACCEPTANCE.md). Keep all data synthetic.

## Release remains blocked

This is free-to-test debug packaging, with no purchase/payment configuration. Price remains EUR **2.99/month including applicable VAT**, 14-day **no-card/no-auto-charge** trial, explicit purchase only. Production Play digital subscriptions require Play Billing, verified entitlements and sandbox/device acceptance, not a web payment workaround or a client-side unlock flag. Existing records remain editable/exportable after trial expiry. Both web production builds and Gradle release tasks fail deliberately.

Real-device acceptance, fluent review of all five drafted languages (Romanian provisional), tagged-PDF/accessibility review, real business/legal/privacy/consumer/tax details, dependency review, release signing and Play account/listing/testing requirements remain external gates. No store upload, production signing, public deployment or spending occurred.

`npm audit --omit=optional` on the Android dependency tree reports **six moderate development-tool advisories**, through Capacitor CLI's glob/minimatch/rimraf and xcode/uuid dependencies. These are not embedded app-runtime dependencies; the production-only audit is recorded separately. Do not force the suggested incompatible CLI downgrade or override incompatible dependency majors just to hide the report. Review an upstream supported CLI update before broader distribution.

## Recorded validation — 31 October 2026

**Debug APK built and installed on an emulator, not a physical phone.** Final APK:

`android\app\build\outputs\apk\debug\app-debug.apk`

Size **6,320,958 bytes**; SHA-256
`611fd5082109252fabdda0b44179869eb0e041dc33bc4f7388660247abceff4d`.
App `at.arbeitmgmt.beta`, `0.2.0-beta` / code `1`; packaged web asset hash `5c27291753b0b67e`.
APK v2 signature verification passed; it is a standard **debug** identity, not release signing.

- Clean `npm ci --ignore-scripts` and `npm run android:build` passed. App lint: **0 errors, 17 warnings** (scaffold unused resources/icon configuration and available version notices, not a claim of zero risks). Upstream Capacitor carries its own lint baseline; it is not evidence of a complete security review.
- **18 Node tests and 15 desktop Edge workflow tests passed.** An earlier Edge-language test stalled during the interrupted tooling run; its isolated rerun and subsequent full 15-test rerun passed.
- **3 Android instrumented tests passed** on Google's Android **16 / API 36 x86_64 emulator**, System WebView **133.0.6943.137**, with emulator Wi-Fi and mobile data disabled. Actual packaged UI/native bridge, 3 MB atomic snapshot reopen/CAS, Unicode PDF generation/preview/parser privacy, file-provider scope/read-only share intent, save/import callbacks, picker cancellation and positive photo import/recovery were exercised. System picker/share intents were intercepted with test-controlled URIs: this does **not** prove real camera capture, actual provider UI or recipient handoff.
- The APK/test APK were also directly installed onto that isolated emulator and `am instrument` passed all 3 tests. An external force-stop/relaunch changed the app process and preserved saved records byte-for-byte; the Turkish relaunched accessibility tree displayed the saved synthetic visit. `scripts\android-restart-smoke.js` checks the new process and snapshot; it does not itself assert the UI tree or recipient delivery.
- `npm audit --omit=dev --omit=optional`: **0 known app-runtime advisories**; full developer audit: **6 moderate advisories**, described above. No forced incompatible downgrade or silent override.
- `adb devices -l` before emulator creation: **no physical devices**. No physical phone was installed on, trusted, configured or erased. Physical acceptance, fluent language review and tagged-PDF/reader accessibility remain **NOT RUN**.

Gradle tears down its instrumented installations. To reproduce the external process check on a **dedicated synthetic emulator only**, retain the fixtures through a direct instrumented run:

```powershell
$env:ANDROID_USER_HOME="$pwd\.tools\android-user"
$env:ANDROID_SERIAL='emulator-5580' # Replace with your own isolated emulator serial.
adb -s $env:ANDROID_SERIAL install -r android\app\build\outputs\apk\debug\app-debug.apk
adb -s $env:ANDROID_SERIAL install -r android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk
adb -s $env:ANDROID_SERIAL shell am instrument -w at.arbeitmgmt.beta.test/androidx.test.runner.AndroidJUnitRunner
node scripts\android-restart-smoke.js
```

### Host/device safety and cleanup

No elevation, machine-wide PATH/install/configuration, firewall exception, antivirus/SmartScreen change, trust-store change, physical USB debugging approval, wireless ADB or public deployment was performed. Existing Windows Hypervisor Platform was usable; no virtualisation/security setting was changed. Only the newly created test emulator had networking disabled, APKs installed and its app force-stopped.

ADB initially generated its ordinary host key pair in the default user Android directory. The unchanged task-generated pair was identified from setup timestamps and moved into ignored `.tools\android-user` after daemon shutdown; key contents were not read or logged. The debug signing key and test key remain local ignored tooling, never Git. Set process-local `ANDROID_USER_HOME` for future SDK/ADB work; do not override an existing user's trust keys.

Task-owned emulator, loopback ADB daemon and earlier local preview server were stopped by their known tool handles/process IDs. No task listeners remained on ports **5037, 5580, 5581, 42870 or 42871** at cleanup. Tooling/cache/APK files stay local and ignored for reproducibility; no unrelated process or user data was deleted. Development tools and a debuggable APK still carry risks; this is not a guarantee that a device cannot be compromised.

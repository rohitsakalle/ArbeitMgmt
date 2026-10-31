# Physical Android acceptance — not yet performed

## Current evidence

On 27 October 2026 this Windows environment had no `adb` on PATH, no executable at the standard local Android SDK/platform-tools locations, and no present device identifiable as Android/ADB/Pixel/Galaxy in the read-only Windows device check. **No authorised physical Android device was accessible for testing.** This does not prove that no phone is attached under an unrecognised name. No phone was installed on, configured, trusted, erased or otherwise changed.

The automated checks use **desktop Edge with a narrow viewport**, not Android hardware. They establish desktop persistence, offline/PDF behavior and file-handoff API contracts only. An emulator, mobile viewport, intercepted sharing API or desktop browser is not a pass for this checklist.

## Native APK acceptance (current primary target)

The initial PWA procedure below is retained for the web beta. For the native Android app, use [the Android debug build/install guide](ANDROID.md): build `npm run android:build`, obtain owner approval, select the exact authorised serial, install the debug APK with `adb -s APPROVED_SERIAL install -r`, then start `at.arbeitmgmt.beta/.MainActivity`. No server, browser installation, HTTPS hosting or USB reverse is needed. Export and verify any existing native backup before an update/signature change; never uninstall or clear real data as a troubleshooting shortcut.

Record APK SHA-256, version code/name, Android and **System WebView** versions rather than Chrome alone. Native rows additionally require:

- System camera and document-picker cancellation/permission denial, imported names/EXIF orientation, 6 MB/40 MP limits and descriptive captions; no broad storage/microphone/location permission.
- Type before camera launch; confirm saved text survives process kill during the external activity. Finish/recover or explicitly discard the pending photo on relaunch without duplicates, partial inclusion or private-item changes.
- Offline cold app launch with Wi-Fi/mobile data off and USB disconnected; saved records and actual PDF preview/save must work using local file providers. Native readiness means assets are packaged, not a service-worker cache.
- Force-stop only this consented synthetic app using `adb -s APPROVED_SERIAL shell am force-stop at.arbeitmgmt.beta`; relaunch offline and compare saved originals/history. Unsaved typing is explicitly not promised to survive.
- Real `ACTION_CREATE_DOCUMENT` save completion and JSON restore from local files; use a second consenting device for device-loss recovery. Do not treat intercepted test intents as a real provider UI pass.
- Share into an actual tester-controlled recipient app; confirm that the received `content://` PDF contains only included items and has no originals/private data. Chooser opening is not delivery. FileProvider must not expose the record store.
- Verify native hardware-back unsaved warning, keyboard/edge insets, large text, TalkBack and a real PDF reader. Screen capture is blocked intentionally; record observations rather than bypassing it.

**Every physical-device row remains NOT RUN.** Emulator evidence, when recorded in the Android guide, does not change this status.

## Safe local connection, after owner approval

Use only a device whose owner explicitly approves testing, Chrome site storage, sample photographs, any home-screen installation and the temporary USB debugging connection. Do not use real customer data or photograph people.

1. Install official Android SDK Platform Tools in a user-owned tooling folder if needed; do not make machine-wide changes or install anything on the phone without permission. Connect the approved device. Ask its owner to enable USB debugging and accept that computer only if they agree. Stop if ADB reports `unauthorized`; never work around the device's authorisation prompt.
2. Build and start the app on the development computer:

   ```powershell
   npm ci --ignore-scripts
   npm run build
   npm run preview
   # Loopback only: http://127.0.0.1:42870
   ```

3. Inspect the available device(s), then select the owner's exact serial instead of an implicit default. The `reverse` command changes the approved device's temporary USB port forwarding; run it only with their consent:

   ```powershell
   adb devices -l
   adb -s APPROVED_SERIAL reverse tcp:42870 tcp:42870
   ```

4. On the device, have the owner open **Chrome** at `http://localhost:42870`. USB reverse forwards the phone's loopback to the computer; it does not expose a server on the LAN or internet and requires no public hosting or certificate. Chrome treats loopback as a secure context. This setup is a development transport, **not a real HTTPS distribution or Play Store test**.
5. Keep that exact phone origin for the entire test. A different hostname/port is a separate dataset. Wait for **Offline app ready**, not just a disconnected-network indicator. If setup fails or never confirms readiness, record failure instead of claiming offline support.

## Acceptance sequence

Record device make/model, Android version, Chrome version, build hash (printed by the build command), date, tester, and consent. Use a clean test profile or export/verify any existing app data first. Never clear a user's unrelated Chrome data.

| Area | Procedure and required evidence |
|---|---|
| Setup/localization | Select each of EN/de-AT/PL/TR/provisional RO. Check labels, wrapping, keyboard focus, large text/zoom, price `EUR 2.99` formatted for that locale, and no missing translations. User notes must remain byte-for-byte unchanged after switching languages. Fluent review is a separate gate. |
| Capture/privacy | Create `SYNTHETIC ANDROID GARDEN`. Add one note in each section, plus an internal sentinel `PRIVATE_ANDROID_NOTE`. Edit a note; verify its original/history remain visible only in the editor. Newly captured/imported photos and notes must be internal by default. |
| Camera and formats | With owner permission, photograph a synthetic sheet in portrait and landscape, import JPEG/PNG/WebP, cancel both pickers, and try an unsupported format/oversized image. Confirm orientation, legibility, no duplicate imports, no unexpected permissions and clear errors. HEIC is intentionally rejected. Never silently omit a selected file. |
| Inclusion/captions | Include only one note/photo; add a descriptive caption explaining the visible work/result. Blank captions on included photos must stop preview with a translated message, without losing the saved visit. An internal uncaptioned photo must not block export. |
| Actual PDF | Save the PDF and open it in a real device PDF reader. Search/select/copy `Österreich · Zażółć gęślą jaźń · İstanbul ışık · Brașov curățat`. Verify every selected item, readable pagination, caption before its image, no clipped text and **no private sentinel/original filename/history/EXIF**. Compare every preview page to the saved file. This is selectable text, **not proof of tagged/PDF-UA compliance**. |
| Real share | Using only tester-controlled recipients, share the PDF into an actually installed app. Inspect the received attachment in that app, not merely the share-sheet appearance. Check MIME/name/content, cancel the share and try an unavailable target. No recipient account is required by ArbeitMgmt; external apps have their own rules. Do not send to real clients. |
| Offline cold start | After readiness, close the app, enable airplane mode and disconnect USB (to make the reverse transport inaccessible). Reopen the same URL or approved home-screen shortcut. Existing records must load. Create/edit notes, import a test photo, preview and save a searchable PDF **before any reconnect**. Record any Chrome download/share restrictions separately. |
| Restart/durability | Close Chrome normally and reboot the device only with owner permission. Reopen offline and verify records and originals/history. Unsaved drafts are not promised to survive process termination: interrupt a save on synthetic data and verify it is either wholly saved or reported unconfirmed, never silently partially saved. |
| Backup/recovery | Export a full private backup, verify a nonempty file actually exists, and restore it into a separate consenting test browser profile/device. Confirm included/internal flags, originals/history, languages, dates and counts. Invalid backups must not replace good data. Backups are unencrypted; store them securely and delete test copies only with approval. |
| Low resources | On an approved test device/profile, use a realistically large synthetic visit. Observe memory, long reports and storage pressure. Never fill a user's device or clear unrelated data. Save failures must remain explicit and preserve the unsaved editor. Record performance/page count/file size rather than assuming success from desktop. |
| Install/update | With owner approval, use Chrome's install/add-to-Home-screen menu; record what it actually offers. Reopen offline after a cold start. A new build should wait while old tabs remain open; save first, close all app windows, reopen online to install the new shell, then repeat offline checks without losing records. |
| Accessibility | Check TalkBack navigation of forms, checkboxes, errors, transcript and the saved PDF in a real reader. Check large font settings and touch targets. Document missing tags/alt semantics and reader-specific issues; do not infer screen-reader suitability from successful text extraction alone. |
| Expired trial | In a dedicated synthetic test profile, use an expired trial fixture. No new visits; existing records must remain editable and downloadable as PDF/full backup. No automatic charge, fake checkout or paid unlock. |

## Result record and cleanup

Current status for **every physical-device row: NOT RUN — device access blocked**. Enter PASS/FAIL/BLOCKED with the exact steps, expected/observed result, screenshots or synthetic PDF/backup where useful, and any recipient-app/reader version. Do not mark the entire platform accepted if one critical capture/privacy/persistence/offline/export check fails.

After testing, and only with the owner's permission:

```powershell
adb -s APPROVED_SERIAL reverse --remove tcp:42870
```

Ask the owner to revoke USB debugging trust/disable debugging if it was enabled only for this test, remove the test shortcut/site data if desired, and delete or securely keep synthetic exports. Do not erase other apps, profiles or data. No production publishing, paid infrastructure or app-store submission is part of this procedure.

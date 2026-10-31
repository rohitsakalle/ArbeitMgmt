package at.arbeitmgmt.beta;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.app.Activity;
import android.app.Instrumentation.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.test.espresso.intent.Intents;
import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.FileOutputStream;
import java.io.InputStream;

@RunWith(AndroidJUnit4.class)
public class NativeSmokeTest {
    @Test public void atomicRecordsSurviveReopenAndRejectStaleWrites() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        File directory = new File(context.getCacheDir(), "synthetic-record-test");
        assertTrue(directory.exists() || directory.mkdir());
        RecordRepository repository = new RecordRepository(directory);
        long version = repository.read().getLong("version");
        String text = "Łódź İstanbul Brașov Österreich " + "x".repeat(3 * 1024 * 1024);
        JSONArray visits = new JSONArray().put(new JSONObject().put("synthetic", text));
        repository.write(version, JSONObject.NULL, visits);
        RecordRepository reopened = new RecordRepository(directory);
        assertEquals(text, reopened.read().getJSONArray("visits").getJSONObject(0).getString("synthetic"));
        try {
            reopened.write(version, JSONObject.NULL, new JSONArray());
            fail("Stale snapshot must not overwrite data");
        } catch (IllegalStateException expected) { assertEquals("conflict", expected.getMessage()); }
        assertEquals(version + 1, reopened.read().getLong("version"));
        assertTrue(new File(directory, "records-v1.json").delete());
        assertTrue(directory.delete());
    }

    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        // evaluateJavascript scripts have an opaque base; app modules use the packaged HTTPS origin.
        String resolved = script.replace("import('/src/", "import('https://localhost/src/");
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(resolved, value -> {
            result.set(value); latch.countDown();
        }));
        assertTrue("WebView response timeout", latch.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitForUi(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline = System.currentTimeMillis() + 30000;
        while (!"true".equals(evaluate(scenario, "!!document.querySelector('#setup, #new-visit')"))) {
            assertTrue("Packaged UI failed to load", System.currentTimeMillis() < deadline);
            Thread.sleep(250);
        }
    }

    private JSONObject awaitResult(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline = System.currentTimeMillis() + 90000;
        String result;
        do {
            Thread.sleep(500);
            result = evaluate(scenario, "window.__nativeSmoke");
            assertTrue("Native operation smoke timeout", System.currentTimeMillis() < deadline);
        } while (result == null || result.equals("null"));
        return new JSONObject(result);
    }

    @Test public void packagedWebViewUsesNativeBridgeAndGeneratesPrivateUnicodePdfOffline() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForUi(scenario);
            String script = """
                window.__nativeSmoke = null;
                (async () => {
                  const {isAndroid, native} = await import('/src/platform.js');
                  if (!isAndroid) throw Error('Not native Android');
                  const {NativeStore} = await import('/src/native-storage.js');
                  const {newVisit,newNote,updateNote,clientReport} = await import('/src/model.js');
                  const store = await new NativeStore(native).open();
                  if (!(await store.settings())) await store.saveSettings({language:'tr',trialStartedAt:new Date().toISOString(),lastBackupAt:null});
                  for(const prior of await store.visits()) if(prior.reference === 'SYNTHETIC Österreich Łódź İstanbul Brașov') await store.deleteVisit(prior);
                  const v = newVisit('SYNTHETIC Österreich Łódź İstanbul Brașov');
                  v.notes.push(newNote('PRIVATE-SMOKE-SENTINEL'));
                  v.notes.push(updateNote(newNote('Public'), 'Public ı Ą ș', 'completed', 'client'));
                  await store.saveVisit(v);
                  const reopened = new NativeStore(native);
                  const saved = (await reopened.visits()).find(x => x.id === v.id);
                  if (!saved || saved.notes[0].originalText !== 'PRIVATE-SMOKE-SENTINEL') throw Error('Persistence failed');
                  const report = clientReport(saved, 'tr');
                  if (JSON.stringify(report).includes('PRIVATE-SMOKE-SENTINEL')) throw Error('Private projection leak');
                  const {renderReport} = await import('/src/pdf.js');
                  const pdf = await renderReport(report);
                  const {getDocument} = await import('/src/vendor/pdf.mjs');
                  const parsed = await getDocument({data:new Uint8Array(await pdf.blob.arrayBuffer()),isEvalSupported:false}).promise;
                  let text = '';
                  for(let i=1;i<=parsed.numPages;i++) text += (await (await parsed.getPage(i)).getTextContent()).items.map(x=>x.str||'').join(' ');
                  if (text.includes('PRIVATE-SMOKE-SENTINEL') || !text.includes('İstanbul') || !text.includes('Brașov')) throw Error('PDF privacy/Unicode failed: '+text);
                  if (!pdf.pages.length || pdf.blob.size < 1000) throw Error('Actual preview/PDF missing');
                  await parsed.destroy();
                  // Retained only on the synthetic emulator for the external force-stop/relaunch check.
                  window.__nativeSmoke = {ok:true, bytes:pdf.blob.size, pages:pdf.pages.length};
                })().catch(error => { window.__nativeSmoke = {error:String(error),stack:error.stack}; });
                """;
            evaluate(scenario, script);
            JSONObject data = awaitResult(scenario);
            assertTrue(data.toString(), data.optBoolean("ok"));
            assertTrue(data.getInt("bytes") > 1000);
        }
    }

    @Test public void saveImportShareAndPickerCancellationUseScopedUris() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        File folder = new File(context.getCacheDir(), "exports/synthetic-intents");
        assertTrue(folder.exists() || folder.mkdirs());
        File saved = new File(folder, "synthetic.pdf");
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", saved);
        Intents.init();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            waitForUi(scenario);
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_OK, new Intent().setData(uri)));
            intending(hasAction(Intent.ACTION_CHOOSER)).respondWith(new ActivityResult(Activity.RESULT_CANCELED, null));
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_CANCELED, null));
            evaluate(scenario, """
                window.__nativeSmoke = null;
                (async () => {
                  const {native,saveNativeFile} = await import('/src/platform.js');
                  await saveNativeFile(new Blob(['%PDF-1.7\\nSYNTHETIC CLIENT ONLY'], {type:'application/pdf'}), 'synthetic.pdf');
                  await saveNativeFile(new Blob(['%PDF-1.7\\nSYNTHETIC CLIENT ONLY'], {type:'application/pdf'}), 'shared.pdf', true);
                  try { await native.pickPhoto({camera:false,visitId:crypto.randomUUID()}); throw Error('Cancel looked successful'); }
                  catch(error) { if(error.code !== 'CANCELLED') throw error; }
                  if ((await native.pendingPhoto()).data) throw Error('Cancelled photo remains pending');
                  try { await native.exportFile({data:btoa('PRIVATE'),mime:'application/json',name:'private.json',share:true}); throw Error('Private backup share accepted'); }
                  catch(error) { if(error.message !== 'nativeFailed') throw error; }
                  window.__nativeSmoke = {ok:true};
                })().catch(error => {window.__nativeSmoke = {error:String(error),stack:error.stack};});
                """);
            JSONObject result = awaitResult(scenario);
            assertTrue(result.toString(), result.optBoolean("ok"));
            assertEquals("%PDF-1.7\nSYNTHETIC CLIENT ONLY", new String(java.nio.file.Files.readAllBytes(saved.toPath()), StandardCharsets.UTF_8));
            Intent chooser = Intents.getIntents().stream().filter(i -> Intent.ACTION_CHOOSER.equals(i.getAction())).findFirst().orElseThrow();
            Intent send = chooser.getParcelableExtra(Intent.EXTRA_INTENT);
            assertEquals(Intent.ACTION_SEND, send.getAction());
            assertEquals("application/pdf", send.getType());
            assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, send.getFlags() &
                (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
            Uri shared = send.getParcelableExtra(Intent.EXTRA_STREAM);
            assertEquals("content", shared.getScheme());
            assertEquals(context.getPackageName() + ".fileprovider", shared.getAuthority());
            try (InputStream input = context.getContentResolver().openInputStream(shared)) {
                assertEquals("%PDF-1.7\nSYNTHETIC CLIENT ONLY", new String(input.readAllBytes(), StandardCharsets.UTF_8));
            }
            assertEquals(shared, send.getClipData().getItemAt(0).getUri());
            try {
                FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider",
                    new File(context.getNoBackupFilesDir(), "records-v1.json"));
                fail("Record store must never have a share URI");
            } catch (IllegalArgumentException expected) { /* Outside allowlisted roots. */ }

            File backup = new File(folder, "synthetic.json");
            String json = "{\"synthetic\":\"PRIVATE BACKUP Łódź\"}";
            try (FileOutputStream output = new FileOutputStream(backup)) { output.write(json.getBytes(StandardCharsets.UTF_8)); }
            Uri backupUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", backup);
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_OK, new Intent().setData(backupUri)));
            evaluate(scenario, """
                window.__nativeSmoke=null;
                import('/src/platform.js').then(async ({native}) => {
                  const result = await native.importBackup();
                  window.__nativeSmoke = {ok:JSON.parse(result.text).synthetic === 'PRIVATE BACKUP Łódź'};
                }).catch(error => {window.__nativeSmoke={error:String(error)};});
                """);
            assertTrue(awaitResult(scenario).toString(), awaitResult(scenario).optBoolean("ok"));
            assertTrue(backup.delete());
            File photo = new File(folder, "original.png");
            android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(64, 64, android.graphics.Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(android.graphics.Color.GREEN);
            try (FileOutputStream output = new FileOutputStream(photo)) {
                assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output));
            }
            bitmap.recycle();
            Uri photoUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", photo);
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new ActivityResult(Activity.RESULT_OK, new Intent().setData(photoUri)));
            evaluate(scenario, """
                window.__nativeSmoke=null;
                (async () => {
                  const {native} = await import('/src/platform.js');
                  const {NativeStore} = await import('/src/native-storage.js');
                  const {newVisit} = await import('/src/model.js');
                  const store = new NativeStore(native);
                  const visit = newVisit('SYNTHETIC PHOTO PICKER');
                  await store.saveVisit(visit);
                  await native.pickPhoto({camera:false,visitId:visit.id});
                  const deadline=Date.now()+15000;
                  let saved;
                  do {
                    await new Promise(resolve=>setTimeout(resolve,200));
                    saved=(await store.visits()).find(v=>v.id===visit.id);
                    if(Date.now()>deadline) throw Error('UI pending-photo recovery timeout');
                  } while(saved.photos.length !== 1 || (await native.pendingPhoto()).data);
                  const photo=saved.photos[0];
                  if(photo.visibility !== 'internal' || photo.originalName !== 'original.png' ||
                     !photo.originalData.startsWith('data:image/png;base64,') ||
                     !photo.reportImage.startsWith('data:image/jpeg;base64,') || saved.revision !== 2) throw Error('Original/privacy/recovery failed');
                  await store.deleteVisit(saved);
                  window.__nativeSmoke={ok:true};
                })().catch(error=>{window.__nativeSmoke={error:String(error),stack:error.stack};});
                """);
            JSONObject photoResult = awaitResult(scenario);
            assertTrue(photoResult.toString(), photoResult.optBoolean("ok"));
            assertTrue(photo.delete());
        } finally {
            Intents.release();
            assertTrue(!saved.exists() || saved.delete());
            assertTrue(!folder.exists() || folder.delete());
        }
    }
}

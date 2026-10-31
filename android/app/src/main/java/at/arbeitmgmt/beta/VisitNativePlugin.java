package at.arbeitmgmt.beta;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import android.util.Base64;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@CapacitorPlugin(name = "VisitNative")
public class VisitNativePlugin extends Plugin {
    private RecordRepository records;
    private static final int PHOTO_LIMIT = 6 * 1024 * 1024;
    private static final int FILE_LIMIT = 80 * 1024 * 1024;

    @Override public void load() {
        records = new RecordRepository(getContext().getNoBackupFilesDir());
        try {
            cleanOldExports();
        } catch (Exception error) {
            Log.e("ArbeitMgmt", "Temporary export cleanup failed", error);
            notifyListeners("nativeError", new JSObject(), true);
        }
    }

    private void fail(PluginCall call, Exception error) {
        String message = error.getMessage();
        if (!"conflict".equals(message) && !"limitReached".equals(message) && !"invalidPhoto".equals(message)) {
            message = "nativeFailed";
        }
        Log.e("ArbeitMgmt", "Native operation failed: " + error.getClass().getSimpleName());
        if (call != null) call.reject(message, message);
        else notifyListeners("nativeError", new JSObject(), true);
    }

    @PluginMethod public void readRecords(PluginCall call) {
        try { call.resolve(JSObject.fromJSONObject(records.read())); }
        catch (Exception error) { fail(call, error); }
    }

    @PluginMethod public void writeRecords(PluginCall call) {
        try {
            records.write(call.getData().getLong("expectedVersion"),
                call.getData().get("settings"), call.getData().getJSONArray("visits"));
            call.resolve();
        } catch (Exception error) { fail(call, error); }
    }

    private File cameraFile(String token) throws Exception {
        if (!token.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("invalidPhoto");
        return new File(directory("camera"), token + ".jpg");
    }

    private File directory(String name) throws Exception {
        File directory = new File(getContext().getCacheDir(), name);
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("nativeFailed");
        return directory;
    }

    private AtomicFile photoRequest() {
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "photo-request.json"));
    }

    private JSONObject readRequest() throws Exception {
        return new JSONObject(new String(photoRequest().readFully(), StandardCharsets.UTF_8));
    }

    private void writeRequest(JSONObject data) throws Exception {
        AtomicFile file = photoRequest();
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(data.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
        } catch (Exception error) {
            if (output != null) file.failWrite(output);
            throw error;
        }
    }

    @PluginMethod public void pickPhoto(PluginCall call) {
        try {
            if (photoRequest().getBaseFile().exists()) throw new IllegalStateException("nativeFailed");
            String token = UUID.randomUUID().toString();
            boolean camera = Boolean.TRUE.equals(call.getBoolean("camera"));
            String visitId = call.getString("visitId");
            if (visitId == null || !visitId.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("invalidPhoto");
            writeRequest(new JSONObject().put("visitId", visitId).put("token", token).put("camera", camera));
            Intent intent;
            if (camera) {
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", cameraFile(token));
                intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
                intent.setClipData(ClipData.newRawUri("Photo", uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } else {
                intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/jpeg", "image/png", "image/webp" });
            }
            try { startActivityForResult(call, intent, "photoResult"); }
            catch (Exception error) { clearPhoto(); throw error; }
        } catch (Exception error) { fail(call, error); }
    }

    private byte[] readLimited(InputStream input, int limit) throws Exception {
        if (input == null) throw new IllegalArgumentException("nativeFailed");
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = source.read(buffer)) != -1) {
                if (output.size() + count > limit) throw new IllegalArgumentException("limitReached");
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    @ActivityCallback private void photoResult(PluginCall call, ActivityResult result) {
        execute(() -> {
            try {
                if (result.getResultCode() != Activity.RESULT_OK) {
                    clearPhoto();
                    if (call != null) call.reject("Cancelled", "CANCELLED");
                    return;
                }
                JSONObject request = readRequest();
                boolean camera = request.getBoolean("camera");
                String token = request.getString("token");
                Uri uri = camera ? Uri.fromFile(cameraFile(token)) :
                    (result.getData() == null ? null : result.getData().getData());
                if (uri == null) throw new IllegalArgumentException("invalidPhoto");
                String mime = camera ? "image/jpeg" : getContext().getContentResolver().getType(uri);
                if (!"image/jpeg".equals(mime) && !"image/png".equals(mime) && !"image/webp".equals(mime)) {
                    throw new IllegalArgumentException("invalidPhoto");
                }
                byte[] bytes = readLimited(getContext().getContentResolver().openInputStream(uri), PHOTO_LIMIT);
                if (bytes.length == 0) throw new IllegalArgumentException("invalidPhoto");
                AtomicFile incoming = new AtomicFile(new File(getContext().getNoBackupFilesDir(), "incoming-photo"));
                FileOutputStream output = null;
                try {
                    output = incoming.startWrite();
                    output.write(bytes);
                    incoming.finishWrite(output);
                } catch (Exception error) {
                    if (output != null) incoming.failWrite(output);
                    throw error;
                }
                String name = "photo-" + token + ("image/jpeg".equals(mime) ? ".jpg" : "image/png".equals(mime) ? ".png" : ".webp");
                if (!camera) {
                    try (android.database.Cursor cursor = getContext().getContentResolver().query(uri,
                        new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
                    }
                }
                request.put("mime", mime).put("name", name.substring(0, Math.min(255, name.length())));
                request.put("ready", true);
                writeRequest(request);
                if (call != null) call.resolve();
                notifyListeners("photoReady", new JSObject());
            } catch (Exception error) {
                try { clearPhoto(); } catch (Exception cleanup) { Log.e("ArbeitMgmt", "Photo cleanup failed", cleanup); }
                fail(call, error);
            }
        });
    }

    @PluginMethod public void pendingPhoto(PluginCall call) {
        try {
            if (!photoRequest().getBaseFile().exists()) { call.resolve(new JSObject()); return; }
            JSONObject request = readRequest();
            if (!request.optBoolean("ready")) { call.resolve(new JSObject().put("interrupted", true)); return; }
            byte[] bytes = new AtomicFile(new File(getContext().getNoBackupFilesDir(), "incoming-photo")).readFully();
            if (bytes.length > PHOTO_LIMIT) throw new IllegalArgumentException("limitReached");
            call.resolve(JSObject.fromJSONObject(request).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)));
        } catch (Exception error) { fail(call, error); }
    }

    private void clearPhoto() throws Exception {
        if (photoRequest().getBaseFile().exists()) {
            JSONObject request = readRequest();
            File camera = cameraFile(request.getString("token"));
            if (camera.exists() && !camera.delete()) throw new IllegalStateException("nativeFailed");
        }
        new AtomicFile(new File(getContext().getNoBackupFilesDir(), "incoming-photo")).delete();
        photoRequest().delete();
    }

    @PluginMethod public void acknowledgePhoto(PluginCall call) {
        try {
            if (photoRequest().getBaseFile().exists() && !readRequest().getString("token").equals(call.getString("token"))) {
                throw new IllegalStateException("conflict");
            }
            clearPhoto();
            call.resolve();
        } catch (Exception error) { fail(call, error); }
    }

    @PluginMethod public void discardPhoto(PluginCall call) {
        try { clearPhoto(); call.resolve(); }
        catch (Exception error) { fail(call, error); }
    }

    @PluginMethod public void clearTransientFiles(PluginCall call) {
        try {
            clearPhoto();
            cleanExports(true);
            call.resolve();
        } catch (Exception error) { fail(call, error); }
    }

    @PluginMethod public void exportFile(PluginCall call) {
        try {
            String mime = call.getString("mime");
            boolean share = Boolean.TRUE.equals(call.getBoolean("share"));
            if (!"application/pdf".equals(mime) && !"application/json".equals(mime) &&
                !"image/jpeg".equals(mime) && !"image/png".equals(mime) && !"image/webp".equals(mime)) {
                throw new IllegalArgumentException("nativeFailed");
            }
            if (share && !"application/pdf".equals(mime)) throw new IllegalArgumentException("nativeFailed");
            String name = call.getString("name", "export").replaceAll("[^\\p{L}\\p{N}._-]", "_");
            if (name.length() > 160) name = name.substring(name.length() - 160);
            if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "export";
            String encoded = call.getString("data");
            if (encoded == null || encoded.length() > FILE_LIMIT * 4L / 3 + 4) throw new IllegalArgumentException("limitReached");
            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length > FILE_LIMIT) throw new IllegalArgumentException("limitReached");
            File folder = new File(directory("exports"), UUID.randomUUID().toString());
            if (!folder.mkdir()) throw new IllegalStateException("nativeFailed");
            File file = new File(folder, name);
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
            call.getData().remove("data");
            call.getData().put("staged", folder.getName() + "/" + name);
            if (share) {
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent intent = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri);
                intent.setClipData(ClipData.newRawUri(name, uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(Intent.createChooser(intent, null));
                        call.resolve();
                    } catch (Exception error) { fail(call, error); }
                });
            } else {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime).addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(call, intent, "saveResult");
            }
        } catch (Exception error) { fail(call, error); }
    }

    @ActivityCallback private void saveResult(PluginCall call, ActivityResult result) {
        execute(() -> {
            try {
                if (call == null) throw new IllegalStateException("nativeFailed");
                File root = directory("exports");
                File file = new File(root, call.getString("staged")).getCanonicalFile();
                if (!file.getPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IllegalArgumentException("nativeFailed");
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null && result.getData().getData() != null) {
                    try (InputStream source = new java.io.FileInputStream(file);
                         OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                        if (output == null) throw new IllegalStateException("nativeFailed");
                        byte[] buffer = new byte[16384];
                        int count;
                        while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
                        output.flush();
                    }
                    deleteExport(file);
                    call.resolve();
                } else {
                    deleteExport(file);
                    call.reject("Cancelled", "CANCELLED");
                }
            } catch (Exception error) { fail(call, error); }
        });
    }

    private void deleteExport(File file) throws Exception {
        if (file.exists() && !file.delete()) throw new IllegalStateException("nativeFailed");
        if (!file.getParentFile().delete()) throw new IllegalStateException("nativeFailed");
    }

    private void cleanOldExports() throws Exception {
        cleanExports(false);
    }

    private void cleanExports(boolean all) throws Exception {
        File[] folders = directory("exports").listFiles();
        if (folders == null) throw new IllegalStateException("nativeFailed");
        for (File folder : folders) {
            if (!all && System.currentTimeMillis() - folder.lastModified() <= 24 * 60 * 60 * 1000L) continue;
            File[] files = folder.listFiles();
            if (files == null) throw new IllegalStateException("nativeFailed");
            for (File file : files) if (!file.delete()) throw new IllegalStateException("nativeFailed");
            if (!folder.delete()) throw new IllegalStateException("nativeFailed");
        }
    }

    @PluginMethod public void importBackup(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "application/octet-stream" });
            startActivityForResult(call, intent, "backupResult");
        } catch (Exception error) { fail(call, error); }
    }

    @ActivityCallback private void backupResult(PluginCall call, ActivityResult result) {
        execute(() -> {
            try {
                if (result.getResultCode() != Activity.RESULT_OK) {
                    if (call != null) call.reject("Cancelled", "CANCELLED");
                    return;
                }
                if (call == null || result.getData() == null || result.getData().getData() == null) throw new IllegalStateException("nativeFailed");
                byte[] bytes = readLimited(getContext().getContentResolver().openInputStream(result.getData().getData()), FILE_LIMIT);
                call.resolve(new JSObject().put("text", new String(bytes, StandardCharsets.UTF_8)));
            } catch (Exception error) { fail(call, error); }
        });
    }

    @PluginMethod public void background(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().moveTaskToBack(true); call.resolve(); });
    }

    void hardwareBack() { notifyListeners("hardwareBack", new JSObject()); }
}

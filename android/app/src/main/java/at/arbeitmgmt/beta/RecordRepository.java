package at.arbeitmgmt.beta;

import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

final class RecordRepository {
    private final AtomicFile file;

    RecordRepository(File directory) {
        file = new AtomicFile(new File(directory, "records-v1.json"));
    }

    synchronized JSONObject read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) {
            return new JSONObject().put("version", 0).put("settings", JSONObject.NULL).put("visits", new JSONArray());
        }
        JSONObject data = new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
        if (data.getLong("version") < 0 || !data.has("settings")) throw new IllegalStateException("storageUnavailable");
        data.getJSONArray("visits");
        return data;
    }

    synchronized void write(long expected, Object settings, JSONArray visits) throws Exception {
        long current = read().getLong("version");
        if (expected != current) throw new IllegalStateException("conflict");
        byte[] bytes = new JSONObject().put("version", current + 1).put("settings", settings)
            .put("visits", visits).toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 80 * 1024 * 1024) throw new IllegalArgumentException("limitReached");
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(bytes);
            file.finishWrite(output);
        } catch (Exception error) {
            if (output != null) file.failWrite(output);
            throw error;
        }
    }
}

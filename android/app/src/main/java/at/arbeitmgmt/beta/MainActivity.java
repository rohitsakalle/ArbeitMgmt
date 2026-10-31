package at.arbeitmgmt.beta;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.BridgeWebViewClient;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VisitNativePlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().getSettings().setAllowFileAccess(false);
        bridge.getWebView().getSettings().setAllowContentAccess(false);
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public boolean shouldOverrideUrlLoading(android.webkit.WebView view, android.webkit.WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                if (!"https".equals(uri.getScheme()) || !"localhost".equals(uri.getHost())) {
                    android.util.Log.w("ArbeitMgmt", "Blocked navigation outside packaged app");
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE,
            android.view.WindowManager.LayoutParams.FLAG_SECURE);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                PluginHandle handle = bridge.getPlugin("VisitNative");
                if (handle != null) ((VisitNativePlugin) handle.getInstance()).hardwareBack();
            }
        });
    }
}

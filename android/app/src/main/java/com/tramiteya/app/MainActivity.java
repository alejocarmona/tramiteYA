package com.tramiteya.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Interceptar navegación: cuando PSE/banco redirige a apptramiteya.web.app,
        // redirigir al WebView local para no perder el bridge de Capacitor.
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    String host = url.getHost();

                    if (host != null && host.contains("apptramiteya.web.app")) {
                        // Extraer query params y redirigir a origen local de Capacitor
                        String query = url.getQuery();
                        String localUrl = "https://localhost/" + (query != null ? "?" + query : "");
                        view.loadUrl(localUrl);
                        return true;
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();

        // Ejecutar navegación en JavaScript: si no está en el catálogo, ir al catálogo
        // Si ya está en el catálogo, minimizar la app
        webView.evaluateJavascript(
            "(function() {" +
            "  var list = document.getElementById('screen-list');" +
            "  var form = document.getElementById('screen-form');" +
            "  var status = document.getElementById('screen-status');" +
            "  if (!list) return 'exit';" +
            "  var onList = list && !list.classList.contains('hidden');" +
            "  if (onList) return 'minimize';" +
            "  if (typeof cleanOrderUrl === 'function') cleanOrderUrl();" +
            "  [list, form, status].forEach(function(x) { if(x) x.classList.add('hidden'); });" +
            "  list.classList.remove('hidden');" +
            "  window.scrollTo({top:0});" +
            "  return 'navigated';" +
            "})()",
            value -> {
                if (value != null && value.contains("minimize")) {
                    moveTaskToBack(true);
                }
                // "navigated" = ya navegamos al catálogo en JS, no hacer nada más
                // "exit" = fallback si no encontramos el DOM
            }
        );
    }
}

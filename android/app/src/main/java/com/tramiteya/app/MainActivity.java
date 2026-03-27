package com.tramiteya.app;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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

package nl.voerapp;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

/**
 * Toont de app (HTML/JS uit assets) in een WebView. Alle gegevens staan lokaal in SQLite;
 * de app heeft geen internettoegang nodig.
 */
public class MainActivity extends Activity {

    private static final int REQUEST_SAVE = 1;
    private static final int REQUEST_OPEN_BACKUP = 2;
    private static final int REQUEST_PICK_FILE = 3;
    private static final Charset UTF8 = Charset.forName("UTF-8");

    private WebView webView;
    private Database db;
    private String pendingSaveContent;
    private ValueCallback<Uri[]> pendingFileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new Database(this);

        getWindow().setStatusBarColor(Color.parseColor("#2f6f4f"));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(false);
        webView.setWebChromeClient(new WebChromeClient() {
            // Nodig voor <input type="file"> (foto van de hond kiezen)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingFileCallback = null;
                    toast("Geen app gevonden om een foto te kiezen");
                    return false;
                }
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Alleen de ingebouwde pagina's; nooit naar buiten navigeren
                return !url.startsWith("file:///android_asset/");
            }
        });
        webView.addJavascriptInterface(new Bridge(), "VoerNative");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Na middernacht of na een tijdje in de achtergrond opnieuw tonen
        js("window.voerResume && voerResume()");
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("window.voerBack ? voerBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) {
                    MainActivity.super.onBackPressed();
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        db.close();
        super.onDestroy();
    }

    private void js(final String script) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(script, null);
            }
        });
    }

    private void toast(String message) {
        js("window.voerToast && voerToast(" + JSONObject.quote(message) + ")");
    }

    // ---------- Bestanden opslaan en openen (via de systeemkiezer, geen opslagrechten nodig) ----------

    private void startSave(final String filename, final String mimeType, String content) {
        pendingSaveContent = content;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType);
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(intent, REQUEST_SAVE);
                } catch (ActivityNotFoundException e) {
                    toast("Opslaan wordt niet ondersteund op dit toestel");
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_FILE) {
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                pendingFileCallback = null;
            }
            return;
        }
        Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;

        if (requestCode == REQUEST_SAVE) {
            String content = pendingSaveContent;
            pendingSaveContent = null;
            if (uri == null) {
                return;
            }
            if (content == null) {
                // App is tussendoor door Android afgesloten
                toast("Opslaan mislukt, probeer het opnieuw");
                return;
            }
            try {
                OutputStream out = getContentResolver().openOutputStream(uri, "wt");
                try {
                    out.write(content.getBytes(UTF8));
                } finally {
                    out.close();
                }
                toast("Bestand opgeslagen");
            } catch (Exception e) {
                toast("Opslaan mislukt: " + e.getMessage());
            }
        } else if (requestCode == REQUEST_OPEN_BACKUP && uri != null) {
            try {
                InputStream in = getContentResolver().openInputStream(uri);
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                try {
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) != -1) {
                        buffer.write(chunk, 0, n);
                    }
                } finally {
                    in.close();
                }
                db.importBackup(new String(buffer.toByteArray(), UTF8));
                js("window.voerReload && voerReload()");
                toast("Back-up teruggezet");
            } catch (Exception e) {
                toast("Terugzetten mislukt: " + e.getMessage());
            }
        }
    }

    /** Methodes die de JavaScript-code aanroept. Antwoorden zijn JSON-tekst. */
    private class Bridge {

        private String ok() {
            return "{\"ok\":true}";
        }

        private String error(Exception e) {
            try {
                return new JSONObject().put("error", String.valueOf(e.getMessage())).toString();
            } catch (Exception ignored) {
                return "{\"error\":\"Onbekende fout\"}";
            }
        }

        @JavascriptInterface
        public String getData(String from, String to) {
            try {
                return db.getData(from, to).toString();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String setFed(long dogId, long mealId, String date, boolean fed) {
            try {
                db.setFed(dogId, mealId, date, fed);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String addItem(String type, String name) {
            try {
                db.addItem(type, name);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String renameItem(String type, long id, String name) {
            try {
                db.renameItem(type, id, name);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String toggleActive(String type, long id) {
            try {
                db.toggleActive(type, id);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String moveItem(String type, long id, int direction) {
            try {
                db.moveItem(type, id, direction);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String deleteItem(String type, long id) {
            try {
                db.deleteItem(type, id);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String getDog(long id) {
            try {
                return db.getDog(id).toString();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String updateDog(long id, String name, String sex, String birthDate) {
            try {
                db.updateDog(id, name, emptyToNull(sex), emptyToNull(birthDate));
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String setDogPhoto(long id, String photo) {
            try {
                db.setDogPhoto(id, emptyToNull(photo));
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String addWeight(long dogId, String date, double weight, String note) {
            try {
                db.addWeight(dogId, date, weight, note);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String addVaccination(long dogId, String date, String name, String nextDate, String note) {
            try {
                db.addVaccination(dogId, date, name, emptyToNull(nextDate), note);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String deleteRecord(String type, long id) {
            try {
                db.deleteRecord(type, id);
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String getReminders() {
            try {
                return db.getReminders().toString();
            } catch (Exception e) {
                return error(e);
            }
        }

        private String emptyToNull(String value) {
            return value == null || value.trim().isEmpty() ? null : value.trim();
        }

        @JavascriptInterface
        public String saveFile(String filename, String mimeType, String content) {
            startSave(filename, mimeType, content);
            return ok();
        }

        @JavascriptInterface
        public String exportBackup() {
            try {
                startSave("voer-app-backup-" + Database.today() + ".json", "application/json", db.exportBackup());
                return ok();
            } catch (Exception e) {
                return error(e);
            }
        }

        @JavascriptInterface
        public String importBackup() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    try {
                        startActivityForResult(intent, REQUEST_OPEN_BACKUP);
                    } catch (ActivityNotFoundException e) {
                        toast("Openen wordt niet ondersteund op dit toestel");
                    }
                }
            });
            return ok();
        }
    }
}

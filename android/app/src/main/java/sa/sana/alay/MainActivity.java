package sa.sana.alay;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * تطبيق «سنا الآي»: نافذة تعرض موقع المقرأة مباشرة، فكل تحديث في الموقع يظهر فورًا
 * دون تحديث التطبيق.
 * رابط الموقع يُقرأ من android/site-url.txt في المستودع: لو تغيَّر رابط الموقع يكفي تعديل
 * ذلك الملف، فتنتقل كل التطبيقات المثبَّتة للرابط الجديد بنفسها.
 */
public class MainActivity extends Activity {
    private static final String DEFAULT_SITE = "https://sana-alay-abq5.onrender.com/";
    private static final String CONFIG_URL = "https://raw.githubusercontent.com/Rehab1Sama/Aheeeer/main/android/site-url.txt";
    private String site;
    private String host;
    private static final int FILE_REQ = 1001;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences("sana", MODE_PRIVATE);
        site = prefs.getString("site", DEFAULT_SITE);
        host = Uri.parse(site).getHost();
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                // صفحات الموقع داخل التطبيق، وما سواها (واتساب، تيليجرام، اتصال…) في تطبيقه
                if ((scheme.equals("https") || scheme.equals("http")) && host != null && host.equals(u.getHost())) return false;
                openExternal(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQ);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.setDownloadListener((url, userAgent, contentDisposition, mimetype, length) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                Toast.makeText(this, "لتنزيل الملف افتحي الموقع من المتصفح", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.addRequestHeader("User-Agent", userAgent);
                String name = URLUtil.guessFileName(url, contentDisposition, mimetype);
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, "جارٍ التنزيل…", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                openExternal(Uri.parse(url));
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(site);
        refreshSiteUrl(prefs);
    }

    /** يقرأ رابط الموقع الحالي من المستودع؛ إن تغيَّر يحفظه وينتقل إليه */
    private void refreshSiteUrl(SharedPreferences prefs) {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(CONFIG_URL).openConnection();
                c.setConnectTimeout(6000);
                c.setReadTimeout(6000);
                c.setUseCaches(false);
                if (c.getResponseCode() != 200) return;
                String line;
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                    line = r.readLine();
                }
                if (line == null) return;
                final String fresh = line.trim();
                if (!fresh.startsWith("https://") || fresh.equals(site)) return;
                final String freshHost = Uri.parse(fresh).getHost();
                if (freshHost == null || freshHost.isEmpty()) return;
                prefs.edit().putString("site", fresh).apply();
                runOnUiThread(() -> {
                    site = fresh;
                    host = freshHost;
                    web.loadUrl(fresh);
                });
            } catch (Exception ignored) {
                // بلا إنترنت أو تعذَّر الوصول: يبقى الرابط المحفوظ
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "لا يوجد تطبيق يفتح هذا الرابط", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_REQ && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}

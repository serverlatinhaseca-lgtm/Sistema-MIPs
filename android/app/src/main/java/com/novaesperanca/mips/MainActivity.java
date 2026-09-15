package com.novaesperanca.mips;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Wrapper WebView do Portal MIPs (uso interno, rede local). */
@SuppressWarnings("deprecation") // startActivityForResult/onBackPressed: sem androidx, API do framework
public class MainActivity extends Activity {

    // IP fixo do servidor na LAN: dispensa qualquer configuração de DNS no celular.
    private static final String HOME_URL = "http://192.168.0.143/";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_CAMERA = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);

        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            private boolean handleUrl(String url) {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false; // navega dentro do app
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "Sem app para abrir este link", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                openChooser();
                return true;
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setMimeType(mimeType);
                    req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                    req.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType));
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                            URLUtil.guessFileName(url, contentDisposition, mimeType));
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(req);
                    Toast.makeText(MainActivity.this, "Baixando arquivo...", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Falha no download", Toast.LENGTH_SHORT).show();
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
    }

    private void openChooser() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            return;
        }
        launchChooser();
    }

    private void launchChooser() {
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "mips_" + System.currentTimeMillis() + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);

            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (cameraUri != null) {
                camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            }

            Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
            gallery.addCategory(Intent.CATEGORY_OPENABLE);
            gallery.setType("image/*");

            Intent chooser = Intent.createChooser(gallery, "Enviar imagem");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            startActivityForResult(chooser, REQ_FILE_CHOOSER);
        } catch (Exception e) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
            Toast.makeText(this, "Não foi possível abrir a câmera/galeria", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                launchChooser();
            } else {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                }
                Toast.makeText(this, "Permissão da câmera negada", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE_CHOOSER || fileCallback == null) {
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()}; // galeria
            } else if (cameraUri != null) {
                results = new Uri[]{cameraUri}; // câmera
            }
        }
        fileCallback.onReceiveValue(results);
        fileCallback = null;
        cameraUri = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}

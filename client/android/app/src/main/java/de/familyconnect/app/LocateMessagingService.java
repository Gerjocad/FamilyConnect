package de.familyconnect.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * „Wo bist du?“ automatisch beantworten: Fragt ein Admin (oder fragen Eltern ein Kind), schickt der Server eine
 * stille Daten-Nachricht { type: locate_auto, id, secret, from }. Hier wird – auch bei geschlossener App – einmal der
 * Standort geholt und an den Server gemeldet; danach sieht die Person „Mama hat deinen Standort abgerufen“.
 * Klappt es nicht (kein „Immer erlauben“, kein GPS), meldet die App das, und der Server fragt ganz normal nach.
 * Alle anderen Nachrichten laufen unverändert an das Push-Plugin von Capacitor weiter.
 */
public class LocateMessagingService extends MessagingService {

    private static final String TAG = "FamilyConnectLocate";
    static final String PREFS = "familyconnect-locate";
    private static final String CHANNEL = "familyconnect";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"locate_auto".equals(data.get("type"))) {
            super.onMessageReceived(message);
            return;
        }
        String server = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("server", null);
        String id = data.get("id");
        String secret = data.get("secret");
        String from = data.get("from") != null ? data.get("from") : "Jemand";
        if (server == null || id == null || secret == null) return;  // ohne Server-Adresse fragt der Server später normal
        try {
            JSONObject body = new JSONObject();
            body.put("secret", secret);
            Location location = currentLocation();
            if (location == null) {
                body.put("failed", true);
                post(server + "/api/locate/auto/" + id, body);
                return;
            }
            body.put("lat", location.getLatitude());
            body.put("lon", location.getLongitude());
            body.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            if (post(server + "/api/locate/auto/" + id, body)) {
                showNotice(from + " hat deinen Standort abgerufen", "Automatisch über „Wo bist du?“", "/standort/" + id);
            }
        } catch (Exception e) {
            Log.w(TAG, "Automatische Antwort fehlgeschlagen", e);
        }
    }

    /** Einmal den aktuellen Standort (höchstens 20 s warten); null ohne Berechtigung „Immer erlauben“ */
    private Location currentLocation() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!(fine || coarse) || !background) return null;
        try {
            CurrentLocationRequest request = new CurrentLocationRequest.Builder()
                .setPriority(fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setDurationMillis(20_000)
                .setMaxUpdateAgeMillis(60_000)
                .build();
            return Tasks.await(LocationServices.getFusedLocationProviderClient(this).getCurrentLocation(request, null), 22, TimeUnit.SECONDS);
        } catch (SecurityException e) {
            return null;
        } catch (Exception e) {
            Log.w(TAG, "Kein Standort", e);
            return null;
        }
    }

    private static boolean post(String url, JSONObject body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = connection.getResponseCode();
            try (InputStream in = code < 400 ? connection.getInputStream() : connection.getErrorStream()) {
                if (in != null) while (in.read() != -1) { /* Antwort lesen, damit die Verbindung sauber endet */ }
            }
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.w(TAG, "Senden fehlgeschlagen", e);
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** Hinweis für die Person, dass ihr Standort abgerufen wurde (Antippen öffnet die Abfrage in der App) */
    private void showNotice(String title, String text, String path) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Familie", NotificationManager.IMPORTANCE_HIGH));
        }
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("familyconnect://h/open" + path), this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, path.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(ContextCompat.getColor(this, R.color.ic_launcher_background))
            .setContentTitle("📍 " + title)
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(pending);
        try {
            manager.notify(path.hashCode(), builder.build());
        } catch (SecurityException e) {
            // Benachrichtigungen ausgeschaltet – der Standort wurde trotzdem gesendet
        }
    }

    /** Server-Adresse merken (die Web-App ruft das beim Start über das Plugin auf) */
    static void saveServer(Context context, String server) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString("server", server.replaceAll("/+$", "")).apply();
    }
}

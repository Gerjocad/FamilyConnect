package de.familyconnect.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Orte (Geofences) dauerhaft merken, bei Android anmelden und Meldungen an den Server schicken.
 * Android überwacht die Kreise selbst und stromsparend – die App fragt den Standort nicht ab.
 * Gemerkt wird: Server-Adresse, Anmelde-Token, Familie und die Orte (Mitte + Radius).
 */
final class GeofenceStore {

    private static final String TAG = "FamilyConnectGeo";
    private static final String PREFS = "familyconnect-geofence";
    private static final String KEY_CONFIG = "config";
    private static final String KEY_QUEUE = "queue";
    /** „angekommen“ erst nach 2 Minuten im Kreis (nicht beim Vorbeifahren) */
    static final int LOITERING_MS = 2 * 60 * 1000;
    /** Meldungen kurz nach dem Anmelden: man war schon da → nur merken, keine Benachrichtigung */
    private static final long INITIAL_WINDOW_MS = LOITERING_MS + 3 * 60 * 1000;
    private static final long QUEUE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

    private GeofenceStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject load(Context context) {
        String raw = prefs(context).getString(KEY_CONFIG, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    static void save(Context context, JSONObject config) {
        prefs(context).edit().putString(KEY_CONFIG, config.toString()).apply();
    }

    static void clear(Context context) {
        prefs(context).edit().clear().apply();
        LocationServices.getGeofencingClient(context).removeGeofences(pendingIntent(context));
    }

    static boolean hasForeground(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackground(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return hasForeground(context);
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // Geofencing füllt den Intent selbst aus – ab Android 12 muss er veränderbar sein
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }

    /** Gemerkte Orte bei Android anmelden (nach dem Einrichten, Neustart oder App-Update); liefert die Anzahl */
    @SuppressWarnings("MissingPermission")
    static int register(Context context) {
        JSONObject config = load(context);
        if (config == null || !hasForeground(context)) return 0;
        JSONArray places = config.optJSONArray("places");
        GeofencingClient client = LocationServices.getGeofencingClient(context);
        client.removeGeofences(pendingIntent(context));
        if (places == null || places.length() == 0) return 0;

        List<Geofence> fences = new ArrayList<>();
        for (int i = 0; i < places.length() && i < 90; i++) {
            JSONObject p = places.optJSONObject(i);
            if (p == null) continue;
            fences.add(new Geofence.Builder()
                .setRequestId(String.valueOf(p.optInt("id")))
                .setCircularRegion(p.optDouble("lat"), p.optDouble("lon"), (float) p.optDouble("radius", 50))
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_DWELL | Geofence.GEOFENCE_TRANSITION_EXIT)
                .setLoiteringDelay(LOITERING_MS)
                .setNotificationResponsiveness(60 * 1000)
                .build());
        }
        GeofencingRequest request = new GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_DWELL)
            .addGeofences(fences)
            .build();
        try {
            config.put("registered_at", System.currentTimeMillis());
            save(context, config);
        } catch (JSONException ignored) {
            // egal
        }
        client.addGeofences(request, pendingIntent(context))
            .addOnFailureListener(e -> Log.w(TAG, "Orte konnten nicht angemeldet werden: " + e.getMessage()));
        return fences.size();
    }

    /** Meldung an den Server (läuft im Hintergrund-Thread); bei Fehler für später merken */
    static void report(Context context, List<String> placeIds, String transition) {
        JSONObject config = load(context);
        if (config == null) return;
        boolean initial = System.currentTimeMillis() - config.optLong("registered_at", 0) < INITIAL_WINDOW_MS;
        flushQueue(context, config);
        for (String id : placeIds) {
            JSONObject body = new JSONObject();
            try {
                body.put("place_id", Integer.parseInt(id));
                body.put("transition", transition);
                body.put("initial", initial);
            } catch (JSONException | NumberFormatException e) {
                continue;
            }
            if (!post(config, body)) enqueue(context, body);
        }
    }

    private static boolean post(JSONObject config, JSONObject body) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(config.getString("server") + "/api/families/" + config.getInt("family_id") + "/places/events");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + config.getString("token"));
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            // 4xx (z. B. Ort gelöscht, Teilen aus) nicht wiederholen
            return status < 500;
        } catch (Exception e) {
            Log.w(TAG, "Meldung nicht gesendet: " + e.getMessage());
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static synchronized void enqueue(Context context, JSONObject body) {
        try {
            JSONArray queue = new JSONArray(prefs(context).getString(KEY_QUEUE, "[]"));
            body.put("queued_at", System.currentTimeMillis());
            queue.put(body);
            while (queue.length() > 20) queue.remove(0);
            prefs(context).edit().putString(KEY_QUEUE, queue.toString()).apply();
        } catch (JSONException ignored) {
            // egal
        }
    }

    /** Liegengebliebene Meldungen (z. B. ohne Netz im Keller) nachschicken – zu alte verwerfen */
    private static synchronized void flushQueue(Context context, JSONObject config) {
        JSONArray queue;
        try {
            queue = new JSONArray(prefs(context).getString(KEY_QUEUE, "[]"));
        } catch (JSONException e) {
            queue = new JSONArray();
        }
        if (queue.length() == 0) return;
        JSONArray rest = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item == null || System.currentTimeMillis() - item.optLong("queued_at") > QUEUE_MAX_AGE_MS) continue;
            if (!post(config, item)) rest.put(item);
        }
        prefs(context).edit().putString(KEY_QUEUE, rest.toString()).apply();
    }
}

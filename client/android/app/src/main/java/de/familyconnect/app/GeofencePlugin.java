package de.familyconnect.app;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Orte für „angekommen / losgegangen“: Berechtigungen erfragen und die Orte der Familie bei Android anmelden.
 * Die Web-App ruft sync() bei jedem Start und bei geänderten Orten auf.
 */
@CapacitorPlugin(
    name = "Geofence",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
    }
)
public class GeofencePlugin extends Plugin {

    private JSObject state() {
        JSObject result = new JSObject();
        boolean services = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
        result.put("available", services);
        result.put("foreground", GeofenceStore.hasForeground(getContext()));
        result.put("background", GeofenceStore.hasBackground(getContext()));
        result.put("active", GeofenceStore.load(getContext()) != null);
        return result;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void requestForeground(PluginCall call) {
        if (GeofenceStore.hasForeground(getContext())) {
            call.resolve(state());
            return;
        }
        requestPermissionForAlias("location", call, "permissionDone");
    }

    /** „Immer erlauben“ – ab Android 11 öffnet das System dafür die Einstellungsseite der App */
    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || GeofenceStore.hasBackground(getContext())) {
            call.resolve(state());
            return;
        }
        requestPermissionForAlias("background", call, "permissionDone");
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        call.resolve(state());
    }

    /** { server, token, familyId, places: [{ id, lat, lon, radius }] } merken und anmelden */
    @PluginMethod
    public void sync(PluginCall call) {
        String server = call.getString("server");
        String token = call.getString("token");
        Integer familyId = call.getInt("familyId");
        JSArray places = call.getArray("places", new JSArray());
        if (server == null || token == null || familyId == null) {
            call.reject("Angaben fehlen", "INVALID");
            return;
        }
        if (!GeofenceStore.hasForeground(getContext())) {
            call.reject("Standort-Berechtigung fehlt", "NO_PERMISSION");
            return;
        }
        try {
            JSONObject previous = GeofenceStore.load(getContext());
            JSONObject config = new JSONObject();
            config.put("server", server.replaceAll("/+$", ""));
            config.put("token", token);
            config.put("family_id", familyId);
            config.put("places", places);
            // unveränderte Orte nicht neu anmelden (sonst gälte jede Meldung kurz danach als „schon da“)
            if (previous != null && previous.optJSONArray("places") != null
                && previous.optJSONArray("places").toString().equals(places.toString())
                && previous.optInt("family_id") == familyId) {
                config.put("registered_at", previous.optLong("registered_at"));
                GeofenceStore.save(getContext(), config);
                JSObject result = state();
                result.put("registered", places.length());
                call.resolve(result);
                return;
            }
            GeofenceStore.save(getContext(), config);
        } catch (JSONException e) {
            call.reject("Ungültige Orte", "INVALID");
            return;
        }
        int count = GeofenceStore.register(getContext());
        JSObject result = state();
        result.put("registered", count);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        GeofenceStore.clear(getContext());
        call.resolve(state());
    }
}

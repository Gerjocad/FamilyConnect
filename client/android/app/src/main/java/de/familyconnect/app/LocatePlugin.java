package de.familyconnect.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * „Wo bist du?“ automatisch beantworten (LocateMessagingService): Die Web-App teilt beim Start die Server-Adresse mit
 * und fragt, ob die Berechtigung „Immer erlauben“ da ist (anfragen geht über das Geofence-Plugin).
 */
@CapacitorPlugin(name = "LocateAuto")
public class LocatePlugin extends Plugin {

    @PluginMethod
    public void setup(PluginCall call) {
        String server = call.getString("server");
        if (server == null) {
            call.reject("Server fehlt", "INVALID");
            return;
        }
        LocateMessagingService.saveServer(getContext(), server);
        status(call);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("foreground", GeofenceStore.hasForeground(getContext()));
        result.put("background", GeofenceStore.hasBackground(getContext()));
        call.resolve(result);
    }
}

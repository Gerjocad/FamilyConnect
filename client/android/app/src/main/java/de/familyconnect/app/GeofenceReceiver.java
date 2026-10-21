package de.familyconnect.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import java.util.ArrayList;
import java.util.List;

/** Android meldet: Ort betreten (nach Verweilzeit) oder verlassen → an den Server weitergeben */
public class GeofenceReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError() || event.getTriggeringGeofences() == null) return;
        int t = event.getGeofenceTransition();
        String transition = t == Geofence.GEOFENCE_TRANSITION_DWELL || t == Geofence.GEOFENCE_TRANSITION_ENTER ? "enter"
            : t == Geofence.GEOFENCE_TRANSITION_EXIT ? "exit" : null;
        if (transition == null) return;
        List<String> ids = new ArrayList<>();
        for (Geofence g : event.getTriggeringGeofences()) ids.add(g.getRequestId());

        Context app = context.getApplicationContext();
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                GeofenceStore.report(app, ids, transition);
            } finally {
                pending.finish();
            }
        }).start();
    }
}

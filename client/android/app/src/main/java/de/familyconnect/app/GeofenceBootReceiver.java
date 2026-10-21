package de.familyconnect.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Nach Neustart des Handys oder App-Update sind die Orte bei Android vergessen – neu anmelden */
public class GeofenceBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            GeofenceStore.register(context.getApplicationContext());
        }
    }
}

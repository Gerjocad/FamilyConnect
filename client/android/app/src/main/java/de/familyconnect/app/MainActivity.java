package de.familyconnect.app;

import android.content.Intent;
import android.nfc.NfcAdapter;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // NFC-Aufkleber kommen als ACTION_NDEF_DISCOVERED an. Das App-Plugin von Capacitor wertet nur
    // ACTION_VIEW aus – also umbenennen, damit die Web-App die Adresse (familyconnect://h/…) erhält.
    private static Intent asViewIntent(Intent intent) {
        if (intent != null && NfcAdapter.ACTION_NDEF_DISCOVERED.equals(intent.getAction()) && intent.getData() != null) {
            intent.setAction(Intent.ACTION_VIEW);
        }
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NfcWriterPlugin.class);
        asViewIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(asViewIntent(intent));
    }
}

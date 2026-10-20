package de.familyconnect.app;

import android.nfc.FormatException;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;

/**
 * NFC-Aufkleber direkt aus der App beschreiben (Adresse einer Gewohnheit, familyconnect://h/…).
 * write() wartet auf den nächsten Aufkleber, schreibt einen NDEF-URI-Datensatz und meldet sich zurück.
 * Solange gewartet wird, ist der Lesemodus an – das Dranhalten hakt also nichts ab.
 */
@CapacitorPlugin(name = "NfcWriter")
public class NfcWriterPlugin extends Plugin {

    private static final int READER_FLAGS =
        NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V;

    private PluginCall pending;
    private NdefMessage message;

    private NfcAdapter adapter() {
        return NfcAdapter.getDefaultAdapter(getContext());
    }

    @PluginMethod
    public void status(PluginCall call) {
        NfcAdapter adapter = adapter();
        JSObject result = new JSObject();
        result.put("supported", adapter != null);
        result.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Keine Adresse zum Schreiben", "INVALID");
            return;
        }
        NfcAdapter adapter = adapter();
        if (adapter == null) {
            call.reject("Dieses Gerät hat kein NFC", "UNSUPPORTED");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("NFC ist ausgeschaltet – bitte in den Einstellungen einschalten", "DISABLED");
            return;
        }
        synchronized (this) {
            if (pending != null) pending.reject("Abgebrochen", "CANCELLED");
            pending = call;
            message = new NdefMessage(NdefRecord.createUri(uri));
        }
        startReader();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        finish(null, "Abgebrochen", "CANCELLED");
        call.resolve();
    }

    private void startReader() {
        getActivity().runOnUiThread(() -> {
            NfcAdapter adapter = adapter();
            if (adapter != null && pending != null) adapter.enableReaderMode(getActivity(), this::onTag, READER_FLAGS, null);
        });
    }

    private void stopReader() {
        getActivity().runOnUiThread(() -> {
            NfcAdapter adapter = adapter();
            if (adapter != null) adapter.disableReaderMode(getActivity());
        });
    }

    // Läuft auf einem NFC-Hintergrund-Thread
    private void onTag(Tag tag) {
        NdefMessage msg;
        synchronized (this) {
            if (pending == null) return;
            msg = message;
        }
        try {
            Ndef ndef = Ndef.get(tag);
            if (ndef != null) {
                ndef.connect();
                try {
                    if (!ndef.isWritable()) {
                        finish(null, "Der Aufkleber ist schreibgeschützt", "READ_ONLY");
                        return;
                    }
                    if (ndef.getMaxSize() < msg.toByteArray().length) {
                        finish(null, "Der Aufkleber ist zu klein für die Adresse", "TOO_SMALL");
                        return;
                    }
                    ndef.writeNdefMessage(msg);
                } finally {
                    ndef.close();
                }
            } else {
                NdefFormatable formatable = NdefFormatable.get(tag);
                if (formatable == null) {
                    finish(null, "Dieser Aufkleber passt nicht (kein NDEF) – am besten NTAG213/215/216 verwenden", "NOT_NDEF");
                    return;
                }
                formatable.connect();
                try {
                    formatable.format(msg);
                } finally {
                    formatable.close();
                }
            }
            vibrate();
            finish(new JSObject(), null, null);
        } catch (IOException | FormatException | RuntimeException e) {
            // meist zu früh weggezogen – weiter warten, damit man es gleich nochmal versuchen kann
            notifyListeners("retry", new JSObject().put("message", "Nicht geklappt – Aufkleber ruhig halten und nochmal dranhalten"));
        }
    }

    private void finish(JSObject result, String error, String code) {
        PluginCall call;
        synchronized (this) {
            call = pending;
            pending = null;
            message = null;
        }
        stopReader();
        if (call == null) return;
        if (error == null) call.resolve(result);
        else call.reject(error, code);
    }

    private void vibrate() {
        Vibrator vibrator = (Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
        if (vibrator == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE));
        else vibrator.vibrate(120);
    }

    // Im Hintergrund schaltet Android den Lesemodus ab – beim Zurückkommen wieder an
    @Override
    protected void handleOnResume() {
        if (pending != null) startReader();
    }

    @Override
    protected void handleOnPause() {
        if (pending != null) stopReader();
    }
}

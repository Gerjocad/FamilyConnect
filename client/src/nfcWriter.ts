import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Eigenes Android-Plugin (client/android/…/NfcWriterPlugin.java), ab APK mit NFC-Schreiben
interface NfcWriterPlugin {
  status(): Promise<{ supported: boolean; enabled: boolean }>;
  write(options: { uri: string }): Promise<void>;
  cancel(): Promise<void>;
  addListener(event: 'retry', listener: (data: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const NfcWriter = registerPlugin<NfcWriterPlugin>('NfcWriter');

/** Nur in der App mit neuer APK – ältere zeigen weiter den Weg über „NFC Tools“ */
export const canWriteNfc = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NfcWriter');

export const isCancelled = (err: unknown) => (err as { code?: string })?.code === 'CANCELLED';

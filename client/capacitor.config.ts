import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.familyconnect.app',
  appName: 'FamilyConnect',
  webDir: 'dist',
  server: {
    // http statt https, damit die App auch einen Server im Heimnetz (http://192.168.…) erreicht,
    // ohne dass der WebView die Anfragen als "Mixed Content" blockiert
    androidScheme: 'http',
  },
  android: {
    backgroundColor: '#fff8f3',
  },
};

export default config;

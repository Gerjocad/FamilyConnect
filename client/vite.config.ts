import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Push-Benachrichtigungen nur einschalten, wenn die Firebase-Konfiguration fürs Android-Projekt da ist
const pushEnabled = existsSync(new URL('./android/app/google-services.json', import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_PUSH_ENABLED': JSON.stringify(String(pushEnabled)),
  },
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});

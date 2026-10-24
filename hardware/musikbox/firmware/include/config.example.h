#pragma once
// Kopiere diese Datei nach config.h und trage deine Werte ein.
// config.h wird nicht ins Git übernommen – dein WLAN-Passwort bleibt bei dir.

// --- WLAN (2,4 GHz – der ESP32 kann kein 5-GHz-WLAN) ---
#define WIFI_SSID     "MeinWLAN"
#define WIFI_PASSWORD "MeinPasswort"

// --- FamilyConnect: Adresse des Servers und Code aus der App (Musik → Musik-Box → Code erstellen) ---
#define SERVER_URL "https://123-45-67-89.sslip.io"
#define BOX_CODE   "ABCDEFGHJKLM"

// --- Verhalten ---
#define PAUSE_ON_REMOVE 1   // 1 = Karte herausziehen pausiert, wieder einstecken spielt weiter
#define VOLUME_STEP     5   // Prozent pro Raste am Drehknopf
#define ENCODER_INVERT  0   // 1, wenn lauter/leiser vertauscht ist

// --- Eingebaute RGB-LED des DevKitC-1 (zeigt den Zustand) ---
// Board-Version 1.0: GPIO 48 · Version 1.1: GPIO 38 (steht auf der Rückseite der Platine)
#define RGB_LED_PIN 48

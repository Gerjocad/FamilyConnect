#pragma once
// Kopiere diese Datei nach config.h und trage deine Werte ein.
// config.h wird nicht ins Git übernommen – dein WLAN-Passwort bleibt bei dir.

// --- WLAN (2,4 GHz – der ESP32 kann kein 5-GHz-WLAN) ---
#define WIFI_SSID     "MeinWLAN"
#define WIFI_PASSWORD "MeinPasswort"

// --- FamilyConnect: Adresse des Servers und Code des Wanddisplays (Familie & Profil → Geräte → Wanddisplay) ---
#define SERVER_URL   "https://123-45-67-89.sslip.io"
#define DISPLAY_CODE "ABCDEFGHJKLM"

// --- Verhalten ---
// So lange nach der letzten Bewegung gilt noch „jemand da“ (das Display schläft danach erst nach der Zeit aus der App ein)
#define PRESENCE_HOLD_S 15
// 1 = Sensor-Ausgang HIGH bei Anwesenheit (HC-SR501, HLK-LD2402) · 0 = umgekehrt
#define PRESENCE_ACTIVE_HIGH 1
// Lichtsensor: Wert senden, wenn er sich um so viel Prozent ändert (Dark Mode schaltet der Server)
#define LUX_CHANGE_PERCENT 20
// Ohne Lichtsensor gebaut? Dann 0
#define USE_BH1750 1

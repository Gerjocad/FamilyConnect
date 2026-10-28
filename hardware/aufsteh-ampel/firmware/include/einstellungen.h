#pragma once
// Hier kannst du alles anpassen – danach einfach neu aufspielen.

// Datenleitung der Matrix (DIN) – an diesem Pin des ESP32
#define MATRIX_PIN 4

// Helligkeit 0–255. 40 ist hell genug und schont Netzteil und Augen (64 LEDs voll weiß = bis 3,8 A!)
#define HELLIGKEIT 40
// Der Mond darf nachts noch dunkler sein
#define HELLIGKEIT_MOND 12

// Wie lange jedes Bild stehen bleibt (Sekunden)
#define DAUER_MOND 6
#define DAUER_SONNENAUFGANG 8   // so lange dauert das langsame Aufgehen
#define DAUER_SONNE 6

// Farbe der ganzen Sonne: 0 = gelb, 1 = grün (wie eine Ampel: „du darfst aufstehen“)
#define SONNE_GRUEN 0

// Sieht das Bild verdreht oder zerstückelt aus? Dann hier umstellen:
// Viele biegsame Matrizen laufen im Zickzack (jede zweite Zeile rückwärts) → 1
#define ZICKZACK 0
// Bild spiegeln bzw. auf den Kopf stellen
#define SPIEGELN 0
#define KOPFUEBER 0

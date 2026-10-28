// Aufsteh-Ampel – erster Test ohne App
// 8×8-Matrix (WS2812B) am ESP32: roter Mond → gelber Sonnenaufgang → ganze Sonne, immer im Kreis.
// BOOT-Taste auf dem ESP32-Board: sofort zum nächsten Bild.
//
// Verkabelung (3 Kabel):
//   Matrix  DIN  → ESP32 GPIO 4   (auf der Matrix die Seite mit „DIN“ bzw. dem Pfeil, der IN die Matrix zeigt)
//   Matrix  5V   → ESP32 5V       (beim S3-Board „5V“, beim C3 SuperMini „5V“)
//   Matrix  GND  → ESP32 GND
#include <Adafruit_NeoPixel.h>
#include <Arduino.h>
#include "einstellungen.h"

#if defined(BOARD_C3)
constexpr uint8_t PIN_BOOT = 9;
#else
constexpr uint8_t PIN_BOOT = 0;
#endif

Adafruit_NeoPixel matrix(64, MATRIX_PIN, NEO_GRB + NEO_KHZ800);

// --- Bilder (8×8): jedes Zeichen ist ein Pixel ------------------------------------------
//   R = rot   O = orange   Y = gelb   G = grün   . = aus
const char *MOND[8] = {
  "...RRR..",
  "..RR....",
  ".RR.....",
  ".RR.....",
  ".RR.....",
  ".RR.....",
  "..RR....",
  "...RRR..",
};
// Sonnenaufgang: halbe Sonne am unteren Rand, darüber erste Strahlen
const char *SONNENAUFGANG[8] = {
  "........",
  "........",
  "...Y....",
  "Y..Y..Y.",
  ".Y.OO.Y.",
  "..OOOO..",
  ".OOOOOO.",
  "YYYYYYYY",
};
const char *SONNE[8] = {
  "Y..Y..Y.",
  ".Y.YY.Y.",
  "..YYYY..",
  "YYYYYYYY",
  "YYYYYYYY",
  "..YYYY..",
  ".Y.YY.Y.",
  "Y..Y..Y.",
};

uint32_t farbe(char c) {
  switch (c) {
    case 'R': return matrix.Color(255, 0, 0);
    case 'O': return matrix.Color(255, 90, 0);
    case 'Y': return SONNE_GRUEN ? matrix.Color(0, 220, 40) : matrix.Color(255, 170, 0);
    case 'G': return matrix.Color(0, 220, 40);
    default: return 0;
  }
}

// Zeile/Spalte → Nummer der LED (je nach Bauart der Matrix)
uint16_t led(uint8_t zeile, uint8_t spalte) {
  if (KOPFUEBER) zeile = 7 - zeile;
  if (SPIEGELN) spalte = 7 - spalte;
  if (ZICKZACK && (zeile % 2 == 1)) spalte = 7 - spalte;
  return zeile * 8 + spalte;
}

// Bild zeichnen; ab_zeile: nur Zeilen ab hier (für das langsame Aufgehen), helligkeit 0–255
void zeichne(const char *bild[8], uint8_t helligkeit, int ab_zeile = 0, bool sonne_gelb_lassen = false) {
  matrix.setBrightness(helligkeit);
  matrix.clear();
  for (uint8_t z = 0; z < 8; z++) {
    if (z < ab_zeile) continue;
    for (uint8_t s = 0; s < 8; s++) {
      char c = bild[z][s];
      // im Sonnenaufgang bleibt Gelb immer gelb (auch wenn die ganze Sonne grün sein soll)
      uint32_t f = (sonne_gelb_lassen && c == 'Y') ? matrix.Color(255, 170, 0) : farbe(c);
      matrix.setPixelColor(led(z, s), f);
    }
  }
  matrix.show();
}

// Wartet die Zeit ab; true, wenn die BOOT-Taste gedrückt wurde (→ sofort weiter)
bool warte(uint32_t ms) {
  uint32_t ende = millis() + ms;
  while ((int32_t)(ende - millis()) > 0) {
    if (digitalRead(PIN_BOOT) == LOW) {
      while (digitalRead(PIN_BOOT) == LOW) delay(10);  // loslassen abwarten
      return true;
    }
    delay(10);
  }
  return false;
}

void mond() {
  Serial.println("🌙 Mond");
  zeichne(MOND, HELLIGKEIT_MOND);
  warte(DAUER_MOND * 1000UL);
}

void sonnenaufgang() {
  Serial.println("🌅 Sonnenaufgang");
  // von unten nach oben einblenden und dabei heller werden
  const uint32_t schritt = DAUER_SONNENAUFGANG * 1000UL / 8;
  for (int z = 7; z >= 0; z--) {
    uint8_t h = HELLIGKEIT_MOND + (HELLIGKEIT - HELLIGKEIT_MOND) * (8 - z) / 8;
    zeichne(SONNENAUFGANG, h, z, true);
    if (warte(schritt)) return;
  }
}

void sonne() {
  Serial.println(SONNE_GRUEN ? "☀️ Sonne (grün)" : "☀️ Sonne");
  // sanft pulsieren
  uint32_t ende = millis() + DAUER_SONNE * 1000UL;
  while ((int32_t)(ende - millis()) > 0) {
    float welle = (sinf(millis() / 400.0f) + 1) / 2;  // 0…1
    zeichne(SONNE, HELLIGKEIT * (0.7f + 0.3f * welle));
    if (warte(30)) return;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  matrix.begin();
  matrix.clear();
  matrix.show();
  Serial.println("\nAufsteh-Ampel – Test: Mond → Sonnenaufgang → Sonne (BOOT = weiter)");
}

void loop() {
  mond();
  sonnenaufgang();
  sonne();
}

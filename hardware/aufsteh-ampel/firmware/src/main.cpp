// Aufsteh-Ampel / Schlaflicht
// 8×8-Matrix (WS2812B) am ESP32: 🌙 roter Mond → 🌅 Sonnenaufgang (geht langsam von unten auf) → ☀️ Sonne → aus.
// Die Zeiten (Schultage / freie Tage) und die Helligkeit stellen die Eltern in der FamilyConnect-App ein;
// das Licht holt sich alle 20 s den Plan vom Server (GET /api/wake-light/<code>) und rechnet die Uhrzeit selbst weiter.
// Fällt das WLAN aus, läuft es mit dem zuletzt geladenen Plan weiter. Ohne bekannte Uhrzeit: schwacher Mond.
//
// Einrichten per USB (App → Schlaflicht → „Per USB einrichten“), Zeilen mit 115200 Baud:
//   fc:set ssid=…  ·  fc:set pass=…  ·  fc:set server=https://…  ·  fc:set code=…  ·  fc:connect  ·  fc:status
//   fc:restart  ·  fc:reset
// Ohne Einrichtung zeigt das Licht zur Probe Mond → Sonnenaufgang → Sonne im Kreis.
// BOOT-Taste: Vorschau – jeder Druck zeigt 15 s lang das nächste Bild (Mond, Sonnenaufgang, Sonne).
//
// Verkabelung (3 Kabel):  Matrix V+ (5V) → ESP32 5V  ·  V- (GND) → GND  ·  IN (DIN) → GPIO 4
#include <Adafruit_NeoPixel.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "einstellungen.h"

#define FIRMWARE_VERSION "2.0"

#if defined(BOARD_C3)
constexpr uint8_t PIN_BOOT = 9;
#else
constexpr uint8_t PIN_BOOT = 0;
#endif

// Höchste Helligkeit (0–255) bei 100 % in der App – mehr braucht es nicht und schont Netzteil und Augen
constexpr uint8_t MAX_SONNE = 90;
constexpr uint8_t MAX_MOND = 40;
constexpr uint32_t ABRUF_MS = 20000;

Adafruit_NeoPixel matrix(64, MATRIX_PIN, NEO_GRB + NEO_KHZ800);
Preferences prefs;

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

uint32_t farbe(char c, bool sonnenaufgang = false) {
  switch (c) {
    case 'R': return matrix.Color(255, 0, 0);
    case 'O': return matrix.Color(255, 90, 0);
    case 'Y': return (SONNE_GRUEN && !sonnenaufgang) ? matrix.Color(0, 220, 40) : matrix.Color(255, 170, 0);
    case 'G': return matrix.Color(0, 220, 40);
    default: return 0;
  }
}

uint16_t led(uint8_t zeile, uint8_t spalte) {
  if (KOPFUEBER) zeile = 7 - zeile;
  if (SPIEGELN) spalte = 7 - spalte;
  if (ZICKZACK && (zeile % 2 == 1)) spalte = 7 - spalte;
  return zeile * 8 + spalte;
}

// Bild zeichnen; ab_zeile: nur Zeilen ab hier (für das langsame Aufgehen)
void zeichne(const char *bild[8], uint8_t helligkeit, int ab_zeile = 0, bool sonnenaufgang = false) {
  matrix.setBrightness(helligkeit);
  matrix.clear();
  if (helligkeit > 0) {
    for (uint8_t z = 0; z < 8; z++) {
      if (z < ab_zeile) continue;
      for (uint8_t s = 0; s < 8; s++) matrix.setPixelColor(led(z, s), farbe(bild[z][s], sonnenaufgang));
    }
  }
  matrix.show();
}

void aus() {
  matrix.clear();
  matrix.show();
}

// --- Einstellungen (bleiben nach dem Ausschalten erhalten) -----------------------------
struct Config {
  String ssid, pass, server, code;
} cfg;

void loadConfig() {
  prefs.begin("ampel", true);
  cfg.ssid = prefs.getString("ssid", "");
  cfg.pass = prefs.getString("pass", "");
  cfg.server = prefs.getString("server", "");
  cfg.code = prefs.getString("code", "");
  prefs.end();
}

bool configured() { return cfg.ssid.length() && cfg.server.length() && cfg.code.length(); }

// --- Plan vom Server ---------------------------------------------------------------------
enum Phase { MOND_PHASE, AUFGANG, SONNE_PHASE, AUS };
const char *PHASEN[] = {"moon", "dawn", "sun", "off"};

struct Nacht {
  int moon, dawn, sun, off;  // Minuten seit Mitternacht
};
struct Plan {
  bool gueltig = false;
  Nacht nacht[2];            // heute, morgen
  uint32_t basisSek = 0;     // Sekunden seit Mitternacht beim Abruf
  uint32_t basisMs = 0;      // millis() beim Abruf
  uint8_t sonne = 60, mond = 30;  // Prozent
  Phase test = MOND_PHASE;
  uint32_t testBis = 0;      // millis(); 0 = keine Vorschau
} plan;

uint32_t letzterAbruf = 0;
bool ersterAbruf = true;

int phaseIndex(const char *name) {
  for (int i = 0; i < 4; i++) if (strcmp(name, PHASEN[i]) == 0) return i;
  return -1;
}

void abrufen() {
  if (WiFi.status() != WL_CONNECTED) return;
  String url = cfg.server;
  if (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/wake-light/" + cfg.code + "?v=" FIRMWARE_VERSION;
  WiFiClientSecure secure;
  secure.setInsecure();  // eigener Server; nur Zeiten, keine Geheimnisse
  WiFiClient plain;
  HTTPClient http;
  bool ok = url.startsWith("https") ? http.begin(secure, url) : http.begin(plain, url);
  if (!ok) return;
  http.setTimeout(8000);
  int status = http.GET();
  if (status != 200) {
    Serial.printf("Server antwortet mit %d%s\n", status, status == 404 ? " – Code prüfen" : "");
    http.end();
    return;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  if (err) {
    Serial.println("Antwort nicht lesbar");
    return;
  }
  const char *now = doc["now"] | "";
  if (strlen(now) < 16) return;
  int h = atoi(now + 11), m = atoi(now + 14);
  plan.basisSek = h * 3600 + m * 60 + (doc["sec"] | 0);
  plan.basisMs = millis();
  for (int i = 0; i < 2; i++) {
    JsonObject n = doc["nights"][i];
    plan.nacht[i] = {n["moon"] | 1140, n["dawn"] | 390, n["sun"] | 420, n["off"] | 480};
  }
  plan.sonne = doc["sun_brightness"] | 60;
  plan.mond = doc["moon_brightness"] | 30;
  JsonVariant test = doc["test"];
  if (!test.isNull()) {
    int p = phaseIndex(test["show"] | "");
    if (p >= 0) {
      plan.test = (Phase)p;
      plan.testBis = millis() + (uint32_t)(test["seconds"] | 60) * 1000;
    }
  } else {
    plan.testBis = 0;
  }
  if (!plan.gueltig) Serial.println("Plan geladen – Uhrzeit bekannt");
  plan.gueltig = true;
}

// Aktuelle Phase aus dem Plan (Uhrzeit läuft mit millis() weiter; nach Mitternacht gilt die Nacht von „morgen“)
Phase aktuellePhase(float &fortschritt) {
  uint32_t sek = plan.basisSek + (millis() - plan.basisMs) / 1000;
  uint32_t tag = sek / 86400;
  int min = (sek % 86400) / 60;
  const Nacht &heute = plan.nacht[tag == 0 ? 0 : 1];
  const Nacht &morgen = plan.nacht[1];
  fortschritt = 0;
  if (min < heute.dawn) return MOND_PHASE;
  if (min < heute.sun) {
    fortschritt = float(min - heute.dawn) / max(1, heute.sun - heute.dawn);
    return AUFGANG;
  }
  if (min < heute.off) return SONNE_PHASE;
  if (min < morgen.moon) return AUS;
  return MOND_PHASE;
}

uint8_t hellSonne() { return (uint16_t)MAX_SONNE * plan.sonne / 100; }
uint8_t hellMond() { return (uint16_t)MAX_MOND * plan.mond / 100; }

void zeigeMond() { zeichne(MOND, hellMond()); }
void zeigeSonne() {
  float welle = (sinf(millis() / 600.0f) + 1) / 2;  // sanft pulsieren
  zeichne(SONNE, hellSonne() * (0.8f + 0.2f * welle));
}
// fortschritt 0…1: Zeile für Zeile von unten nach oben, dabei vom Mond-Licht zur Sonnen-Helligkeit
void zeigeAufgang(float fortschritt) {
  fortschritt = constrain(fortschritt, 0.0f, 1.0f);
  int ab = 7 - int(fortschritt * 8);
  int start = max<int>(hellMond(), 4);
  int h = start + int((int(hellSonne()) - start) * fortschritt);
  zeichne(SONNENAUFGANG, constrain(h, 2, 255), max(0, ab), true);
}

void zeige(Phase p, float fortschritt) {
  switch (p) {
    case MOND_PHASE: zeigeMond(); break;
    case AUFGANG: zeigeAufgang(fortschritt); break;
    case SONNE_PHASE: zeigeSonne(); break;
    default: aus(); break;
  }
}

// --- WLAN ---------------------------------------------------------------------------------
uint32_t letzterWlanVersuch = 0;
bool jetztVerbinden = false;

void wlan() {
  if (WiFi.status() == WL_CONNECTED || !cfg.ssid.length()) return;
  Serial.printf("Verbinde mit WLAN „%s“ …\n", cfg.ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Verbunden, IP %s\n", WiFi.localIP().toString().c_str());
    letzterAbruf = 0;
  } else {
    Serial.println("WLAN nicht erreicht – neuer Versuch in 30 s");
  }
}

// --- Einrichten über USB (Zeilen „fc:…“) -----------------------------------------------------
Phase aktuelleAnzeige = MOND_PHASE;

void printStatus() {
  Serial.printf("fc:status {\"version\":\"%s\",\"device\":\"wake-light\",\"ssid\":\"%s\",\"pass\":%s,\"server\":\"%s\",\"code\":\"%s\","
                "\"wifi\":%s,\"ip\":\"%s\",\"plan\":%s,\"phase\":\"%s\"}\n",
                FIRMWARE_VERSION, cfg.ssid.c_str(), cfg.pass.length() ? "true" : "false", cfg.server.c_str(), cfg.code.c_str(),
                WiFi.status() == WL_CONNECTED ? "true" : "false",
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "", plan.gueltig ? "true" : "false",
                PHASEN[aktuelleAnzeige]);
}

void handleLine(String line) {
  line.trim();
  if (!line.startsWith("fc:")) return;
  line = line.substring(3);
  if (line == "status") return printStatus();
  if (line == "connect") {
    WiFi.disconnect();
    jetztVerbinden = true;
    Serial.println("fc:ok connect");
    return;
  }
  if (line == "restart") {
    Serial.println("fc:ok restart");
    delay(200);
    ESP.restart();
  }
  if (line == "reset") {
    prefs.begin("ampel", false);
    prefs.clear();
    prefs.end();
    Serial.println("fc:ok reset");
    delay(200);
    ESP.restart();
  }
  if (!line.startsWith("set ")) {
    Serial.println("fc:err unbekannter Befehl");
    return;
  }
  int eq = line.indexOf('=');
  if (eq < 0) {
    Serial.println("fc:err ohne =");
    return;
  }
  String key = line.substring(4, eq), value = line.substring(eq + 1);
  if (key != "ssid" && key != "pass" && key != "server" && key != "code") {
    Serial.printf("fc:err %s\n", key.c_str());
    return;
  }
  prefs.begin("ampel", false);
  prefs.putString(key.c_str(), value);
  prefs.end();
  loadConfig();
  Serial.printf("fc:ok %s\n", key.c_str());
}

String eingabe;
void readLines() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (eingabe.length()) handleLine(eingabe);
      eingabe = "";
    } else if (eingabe.length() < 200) {
      eingabe += c;
    }
  }
}

// --- Vorführung ohne Einrichtung und Vorschau per BOOT-Taste --------------------------------
// Vorführung: 6 s Mond, 8 s Sonnenaufgang, 6 s Sonne im Kreis
void vorfuehrung() {
  uint32_t t = millis() % 20000;
  plan.sonne = 60;
  plan.mond = 40;
  if (t < 6000) aktuelleAnzeige = MOND_PHASE, zeigeMond();
  else if (t < 14000) aktuelleAnzeige = AUFGANG, zeigeAufgang((t - 6000) / 8000.0f);
  else aktuelleAnzeige = SONNE_PHASE, zeigeSonne();
}

uint32_t tasteBis = 0;
int tasteBild = -1;
bool tasteVorher = false;

void taste() {
  bool gedrueckt = digitalRead(PIN_BOOT) == LOW;
  if (gedrueckt && !tasteVorher) {
    tasteBild = (tasteBild + 1) % 3;
    tasteBis = millis() + 15000;
    Serial.printf("Vorschau: %s\n", PHASEN[tasteBild]);
  }
  tasteVorher = gedrueckt;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  matrix.begin();
  aus();
  loadConfig();
  Serial.printf("\nSchlaflicht %s – %s\n", FIRMWARE_VERSION, configured() ? "eingerichtet" : "nicht eingerichtet (Vorführung)");
}

void loop() {
  readLines();
  taste();
  uint32_t now = millis();

  if (configured() && WiFi.status() != WL_CONNECTED && (jetztVerbinden || ersterAbruf || now - letzterWlanVersuch > 30000)) {
    jetztVerbinden = false;
    ersterAbruf = false;
    letzterWlanVersuch = now;
    wlan();
  }
  if (configured() && WiFi.status() == WL_CONNECTED && (letzterAbruf == 0 || now - letzterAbruf > ABRUF_MS)) {
    letzterAbruf = now;
    abrufen();
  }

  // Vorschau per BOOT-Taste
  if (tasteBis && (int32_t)(tasteBis - now) > 0) {
    if (!plan.gueltig) plan.sonne = 60, plan.mond = 40;
    aktuelleAnzeige = (Phase)tasteBild;
    if (tasteBild == 1) zeigeAufgang(1.0f - (tasteBis - now) / 15000.0f);
    else zeige((Phase)tasteBild, 1);
  } else if (!configured()) {
    tasteBis = 0;
    vorfuehrung();
  } else if (!plan.gueltig) {
    // noch keine Uhrzeit: blauer Punkt blinkt (verbinde …), daneben schwacher Mond
    matrix.setBrightness(20);
    matrix.clear();
    if ((now / 500) % 2) matrix.setPixelColor(led(0, 7), matrix.Color(0, 60, 255));
    matrix.show();
    aktuelleAnzeige = MOND_PHASE;
  } else if (plan.testBis && (int32_t)(plan.testBis - now) > 0) {
    // Vorschau aus der App (eine Minute)
    aktuelleAnzeige = plan.test;
    // Sonnenaufgang in der Vorschau: alle 20 s einmal ganz aufgehen
    if (plan.test == AUFGANG) zeigeAufgang(1.0f - ((plan.testBis - now) % 20000) / 20000.0f);
    else zeige(plan.test, 1);
  } else {
    float fortschritt;
    aktuelleAnzeige = aktuellePhase(fortschritt);
    zeige(aktuelleAnzeige, fortschritt);
  }
  delay(30);
}

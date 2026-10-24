// FamilyConnect Wandsensor
// Sitzt neben dem Wanddisplay (Fire-Tablet) und meldet dem Server:
//   – ob jemand davor steht (Radar HLK-LD2402 oder Bewegungsmelder HC-SR501, Ausgang „OUT“)
//   – wie hell es ist (BH1750)
// Der Server weckt damit das Display bzw. schickt es in den Ruhemodus und schaltet den Dark Mode.
//
// Verkabelung (siehe Anleitung):
//                      ESP32-C3 SuperMini     ESP32-S3-DevKitC-1
//   BH1750  SDA        GPIO 6                 GPIO 8
//   BH1750  SCL        GPIO 7                 GPIO 9
//   Sensor  OUT        GPIO 3                 GPIO 4
//   BH1750 VCC → 3V3 · ADDR offen lassen · Radar VCC → 3V3 · PIR VCC → 5V · alle GND zusammen
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include "config.h"
#if USE_BH1750
#include <BH1750.h>
#endif

// --- Pins ---------------------------------------------------------------------------------
#if defined(BOARD_C3)
constexpr uint8_t PIN_SDA = 6;
constexpr uint8_t PIN_SCL = 7;
constexpr uint8_t PIN_PRESENCE = 3;
constexpr uint8_t PIN_LED = 8;  // blaue LED, leuchtet bei LOW
#else
constexpr uint8_t PIN_SDA = 8;
constexpr uint8_t PIN_SCL = 9;
constexpr uint8_t PIN_PRESENCE = 4;
#ifndef RGB_LED_PIN
#define RGB_LED_PIN 48  // Board-Version 1.1: 38
#endif
#endif

constexpr uint32_t LUX_EVERY_MS = 5000;       // Lichtsensor so oft lesen
constexpr uint32_t HEARTBEAT_MS = 60000;      // spätestens dann wieder melden (Server vergisst den Sensor nach 10 min)
constexpr float LUX_MIN_STEP = 2.0;           // kleine Schwankungen im Dunkeln ignorieren

#if USE_BH1750
BH1750 lightMeter;
bool lightOk = false;
#endif

// --- Status-LED ---------------------------------------------------------------------------
void led(bool on) {
#if defined(BOARD_C3)
  digitalWrite(PIN_LED, on ? LOW : HIGH);
#else
  neopixelWrite(RGB_LED_PIN, 0, on ? 30 : 0, 0);
#endif
}

// --- WLAN ---------------------------------------------------------------------------------
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("WLAN %s verbinden …\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    led(i % 2);
    delay(250);
  }
  led(false);
  if (WiFi.status() == WL_CONNECTED) Serial.printf("Verbunden, IP %s\n", WiFi.localIP().toString().c_str());
  else Serial.println("WLAN nicht erreichbar – neuer Versuch später");
}

// --- Server -------------------------------------------------------------------------------
// Hinweis: Das Zertifikat wird nicht geprüft (setInsecure), damit es ohne Zertifikatspflege läuft –
// der Display-Code erlaubt nur das Ansehen der Wandanzeige und das Melden des Sensors.
bool send(const String &body) {
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure tls;
  tls.setInsecure();
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(tls, String(SERVER_URL) + "/api/wall/" + DISPLAY_CODE + "/sensor")) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  String answer = http.getString();
  http.end();
  Serial.printf("%s → %d %s\n", body.c_str(), code, answer.c_str());
  if (code == 404) Serial.println("Unbekannter Code – in der App ein Wanddisplay anlegen und DISPLAY_CODE in config.h prüfen");
  return code == 200;
}

// --- Zustand --------------------------------------------------------------------------------
bool present = false;
bool sentPresent = false;
bool sentOnce = false;
uint32_t lastMotion = 0;
float lux = -1;
float sentLux = -1;
uint32_t lastLuxRead = 0;
uint32_t lastSend = 0;
uint32_t retryAt = 0;

bool motion() { return digitalRead(PIN_PRESENCE) == (PRESENCE_ACTIVE_HIGH ? HIGH : LOW); }

bool luxChanged() {
  if (lux < 0) return false;
  if (sentLux < 0) return true;
  float diff = fabsf(lux - sentLux);
  return diff >= LUX_MIN_STEP && diff >= sentLux * LUX_CHANGE_PERCENT / 100.0f;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nFamilyConnect Wandsensor");
#if defined(BOARD_C3)
  pinMode(PIN_LED, OUTPUT);
#endif
  led(false);
  pinMode(PIN_PRESENCE, INPUT_PULLDOWN);
#if USE_BH1750
  Wire.begin(PIN_SDA, PIN_SCL);
  lightOk = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  if (!lightOk) Serial.println("BH1750 nicht gefunden – SDA/SCL und 3V3 prüfen");
#endif
  ensureWifi();
}

void loop() {
  uint32_t now = millis();

  // Anwesenheit: jede Bewegung verlängert; „weg“ erst nach PRESENCE_HOLD_S ohne Bewegung
  if (motion()) {
    lastMotion = now;
    present = true;
  } else if (present && now - lastMotion > PRESENCE_HOLD_S * 1000UL) {
    present = false;
  }
  led(present);

#if USE_BH1750
  if (lightOk && now - lastLuxRead >= LUX_EVERY_MS) {
    lastLuxRead = now;
    float value = lightMeter.readLightLevel();
    if (value >= 0) lux = value;
  }
#endif

  bool presenceChanged = !sentOnce || present != sentPresent;
  if ((presenceChanged || luxChanged() || now - lastSend >= HEARTBEAT_MS) && (int32_t)(now - retryAt) >= 0) {
    String body = "{\"present\":" + String(present ? "true" : "false");
    if (lux >= 0) body += ",\"lux\":" + String(lux, 1);
    body += "}";
    if (send(body)) {
      sentOnce = true;
      sentPresent = present;
      if (lux >= 0) sentLux = lux;
    } else {
      retryAt = now + 10000;  // nach Fehlern nicht ununterbrochen senden
    }
    lastSend = now;
  }
  delay(100);
}

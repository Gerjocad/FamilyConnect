// FamilyConnect Musik-Box
// Karte mit NFC-Aufkleber (NTAG213/215/216, beschrieben in der FamilyConnect-App) in den Schlitz stecken
// → Playlist startet auf dem Lautsprecher. Herausziehen → Pause. Drehknopf = Lautstärke,
// Druck auf den Knopf = Pause/Weiter, zwei Tasten = Titel zurück/vor.
//
// Verkabelung (siehe Anleitung):
//   RC522: SDA/SS 10 · SCK 12 · MOSI 11 · MISO 13 · RST 9 · 3.3V · GND   (nur 3,3 V!)
//   Drehgeber EC11: A/CLK 4 · B/DT 5 · Taster SW 6 · C und zweiter Taster-Pin an GND
//   Taste „zurück“ 15 · Taste „vor“ 16 · jeweils anderer Pin an GND
#include <Arduino.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "config.h"

// --- Pins ---------------------------------------------------------------------------------
constexpr uint8_t PIN_RC522_SS = 10;
constexpr uint8_t PIN_RC522_RST = 9;
constexpr uint8_t PIN_SCK = 12;
constexpr uint8_t PIN_MISO = 13;
constexpr uint8_t PIN_MOSI = 11;
constexpr uint8_t PIN_ENC_A = 4;
constexpr uint8_t PIN_ENC_B = 5;
constexpr uint8_t PIN_ENC_SW = 6;
constexpr uint8_t PIN_BTN_PREV = 15;
constexpr uint8_t PIN_BTN_NEXT = 16;

MFRC522 rfid(PIN_RC522_SS, PIN_RC522_RST);

// --- Status-LED -------------------------------------------------------------------------------
void led(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(RGB_LED_PIN, r, g, b); }
uint32_t ledOffAt = 0;
void flash(uint8_t r, uint8_t g, uint8_t b, uint32_t ms) {
  led(r, g, b);
  ledOffAt = millis() + ms;
}

// --- WLAN ---------------------------------------------------------------------------------
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("WLAN %s verbinden …\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    led(i % 2 ? 40 : 0, i % 2 ? 25 : 0, 0);  // gelb blinken
    delay(250);
  }
  led(0, 0, 0);
  if (WiFi.status() == WL_CONNECTED) Serial.printf("Verbunden, IP %s\n", WiFi.localIP().toString().c_str());
  else Serial.println("WLAN nicht erreichbar – neuer Versuch später");
}

// --- Server -------------------------------------------------------------------------------
// Antwort-Code (200 = ok); bei Fehlern rote LED. Hinweis: Das Zertifikat wird hier nicht geprüft
// (setInsecure), damit es ohne Zertifikatspflege läuft – der Box-Code gilt nur für Musik.
int post(const char *path, const String &body) {
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) {
    flash(60, 0, 0, 2000);
    return -1;
  }
  WiFiClientSecure tls;
  tls.setInsecure();
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/music-box/" + BOX_CODE + "/" + path;
  http.setTimeout(10000);
  if (!http.begin(tls, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  led(0, 0, 50);  // blau: wird gesendet
  int code = http.POST(body);
  String answer = http.getString();
  http.end();
  Serial.printf("%s → %d %s\n", path, code, answer.c_str());
  if (code == 200) flash(0, 50, 0, 800);
  else flash(70, 0, 0, 2500);
  return code;
}

// --- Karte lesen (NDEF-Adresse familyconnect://h/m/<token> aus NTAG21x) -------------------------
// Liest die Datenseiten ab Seite 4 und sucht darin den 32-stelligen Code hinter „/h/m/“.
String readToken() {
  uint8_t data[160];
  size_t len = 0;
  for (uint8_t page = 4; page < 44 && len + 16 <= sizeof(data); page += 4) {
    uint8_t buf[18];
    uint8_t size = sizeof(buf);
    if (rfid.MIFARE_Read(page, buf, &size) != MFRC522::STATUS_OK) break;
    memcpy(data + len, buf, 16);
    len += 16;
    if (memchr(buf, 0xFE, 16)) break;  // Ende der NDEF-Daten
  }
  const char *marker = "/h/m/";
  for (size_t i = 0; i + 5 + 32 <= len; i++) {
    if (memcmp(data + i, marker, 5) != 0) continue;
    String token;
    for (size_t j = i + 5; j < len && token.length() < 64; j++) {
      char c = (char)data[j];
      if (!isxdigit(c)) break;
      token += (char)tolower(c);
    }
    if (token.length() >= 8) return token;
  }
  return "";
}

// Liegt (noch) eine Karte auf? WUPA weckt auch Karten, die wir zuvor schlafen gelegt haben.
bool cardPresent() {
  uint8_t atqa[2];
  uint8_t size = sizeof(atqa);
  MFRC522::StatusCode s = rfid.PICC_WakeupA(atqa, &size);
  if (s != MFRC522::STATUS_OK && s != MFRC522::STATUS_COLLISION) return false;
  return rfid.PICC_ReadCardSerial();
}

String uidHex() {
  String s;
  for (uint8_t i = 0; i < rfid.uid.size; i++) s += String(rfid.uid.uidByte[i], HEX);
  return s;
}

// --- Drehgeber (Interrupt, Gray-Code) ------------------------------------------------------
volatile int32_t encoderTicks = 0;
volatile uint8_t encoderState = 0;
void IRAM_ATTR onEncoder() {
  static const int8_t table[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
  encoderState = ((encoderState << 2) | (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B)) & 0x0F;
  encoderTicks += table[encoderState];
}

// --- Tasten (entprellt) -----------------------------------------------------------------------
struct Button {
  uint8_t pin;
  bool down;
  uint32_t changed;
  explicit Button(uint8_t p) : pin(p), down(false), changed(0) {}
  bool pressed() {  // true genau einmal beim Drücken
    bool now = digitalRead(pin) == LOW;
    if (now != down && millis() - changed > 30) {
      down = now;
      changed = millis();
      return now;
    }
    return false;
  }
};
Button btnPrev(PIN_BTN_PREV), btnNext(PIN_BTN_NEXT), btnEnc(PIN_ENC_SW);

// --- Ablauf ---------------------------------------------------------------------------------
String currentUid;
uint8_t misses = 0;
uint32_t lastPoll = 0, lastVolume = 0;

void setup() {
  Serial.begin(115200);
  led(0, 0, 0);
  pinMode(PIN_ENC_A, INPUT_PULLUP);
  pinMode(PIN_ENC_B, INPUT_PULLUP);
  pinMode(PIN_ENC_SW, INPUT_PULLUP);
  pinMode(PIN_BTN_PREV, INPUT_PULLUP);
  pinMode(PIN_BTN_NEXT, INPUT_PULLUP);
  attachInterrupt(PIN_ENC_A, onEncoder, CHANGE);
  attachInterrupt(PIN_ENC_B, onEncoder, CHANGE);

  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_RC522_SS);
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);  // liest besser durch die Karte und die Gehäusewand
  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("RC522 Version 0x%02X %s\n", version, (version == 0x91 || version == 0x92 || version == 0xB2) ? "(ok)" : "(nicht gefunden? Verkabelung prüfen)");
  ensureWifi();
  flash(0, 30, 30, 600);  // türkis: bereit
}

void loop() {
  uint32_t now = millis();
  if (ledOffAt && now > ledOffAt) {
    led(0, 0, 0);
    ledOffAt = 0;
  }

  // Karte alle 200 ms prüfen
  if (now - lastPoll > 200) {
    lastPoll = now;
    if (cardPresent()) {
      misses = 0;
      String uid = uidHex();
      if (uid != currentUid) {
        currentUid = uid;
        String token = readToken();
        rfid.PICC_HaltA();
        if (token.length()) {
          Serial.printf("Karte %s → %s\n", uid.c_str(), token.c_str());
          post("card", "{\"token\":\"" + token + "\"}");
        } else {
          Serial.printf("Karte %s ohne FamilyConnect-Adresse – in der App beschreiben\n", uid.c_str());
          flash(70, 0, 40, 2500);  // lila: Karte unbekannt
        }
      } else {
        rfid.PICC_HaltA();
      }
    } else if (currentUid.length() && ++misses >= 4) {
      Serial.println("Karte entfernt");
      currentUid = "";
      if (PAUSE_ON_REMOVE) post("removed", "{}");
    }
  }

  // Lautstärke: Rasten sammeln und gebündelt schicken
  if (now - lastVolume > 300) {
    lastVolume = now;
    noInterrupts();
    int32_t ticks = encoderTicks;
    int32_t detents = ticks / 4;  // EC11: 4 Flanken pro Raste
    encoderTicks -= detents * 4;
    interrupts();
    if (detents) {
      int delta = detents * VOLUME_STEP * (ENCODER_INVERT ? -1 : 1);
      post("control", "{\"action\":\"volume\",\"delta\":" + String(delta) + "}");
    }
  }

  if (btnEnc.pressed()) post("control", "{\"action\":\"toggle\"}");
  if (btnNext.pressed()) post("control", "{\"action\":\"next\"}");
  if (btnPrev.pressed()) post("control", "{\"action\":\"previous\"}");
  delay(5);
}

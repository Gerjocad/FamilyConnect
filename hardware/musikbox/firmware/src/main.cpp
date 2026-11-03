// FamilyConnect Musik-Box
// Karte mit NFC-Aufkleber (NTAG213/215/216, beschrieben in der FamilyConnect-App) in den Schlitz stecken
// → Playlist startet auf dem Lautsprecher. Herausziehen → Pause. Drehknopf = Lautstärke,
// Druck auf den Knopf = Pause/Weiter, zwei Tasten = Titel zurück/vor.
//
// Verkabelung (siehe Anleitung):
//   RC522: SDA/SS 10 · SCK 12 · MOSI 11 · MISO 13 · RST 9 · 3.3V · GND   (nur 3,3 V!)
//   Drehgeber EC11: A/CLK 4 · B/DT 5 · Taster SW 6 · C und zweiter Taster-Pin an GND
//   Taste „zurück“ 15 · Taste „vor“ 16 · jeweils anderer Pin an GND
//
// Einstellungen (WLAN, Server, Box-Code …) liegen im Flash des ESP32 und werden über USB gesetzt – am einfachsten in
// der App unter Musik → Musik-Box → „Per USB einrichten“ (Chrome/Edge am PC). Zeilen über die serielle Schnittstelle
// (115200 Baud):  fc:set ssid=…  ·  fc:set pass=…  ·  fc:set server=https://…  ·  fc:set code=…  ·  fc:set led=48|38
//                 fc:set invert=0|1  ·  fc:set pause=0|1  ·  fc:set step=5  ·  fc:connect  ·  fc:status  ·  fc:restart  ·  fc:reset
// Wer lieber mit PlatformIO baut, kann die Startwerte weiter in include/config.h eintragen (optional).
#include <Arduino.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <Preferences.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#if __has_include("config.h")
#include "config.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef SERVER_URL
#define SERVER_URL ""
#endif
#ifndef BOX_CODE
#define BOX_CODE ""
#endif
#ifndef PAUSE_ON_REMOVE
#define PAUSE_ON_REMOVE 1
#endif
#ifndef VOLUME_STEP
#define VOLUME_STEP 5
#endif
#ifndef ENCODER_INVERT
#define ENCODER_INVERT 0
#endif
#ifndef RGB_LED_PIN
#define RGB_LED_PIN 48
#endif
#define FIRMWARE_VERSION "2.1"

// --- Ausgabe auf beide USB-Buchsen ---------------------------------------------------------------
// Das DevKitC-1 hat zwei: „COM/UART“ (USB-Seriell-Wandler → Serial) und „USB“ (im ESP32-S3 eingebaut → USBSerial).
// Befehle kommen von beiden, Meldungen gehen an beide – egal, an welcher Buchse der PC hängt.
struct BothPorts : public Print {
  size_t write(uint8_t c) override { return write(&c, 1); }
  size_t write(const uint8_t *buf, size_t len) override {
    Serial.write(buf, len);
    if (USBSerial) USBSerial.write(buf, len);  // nur, wenn ein PC dran ist (sonst würde es warten)
    return len;
  }
} out;

// --- Einstellungen (Flash, Namensraum „musikbox“) --------------------------------------------
Preferences prefs;
struct Settings {
  String ssid, pass, server, code;
  uint8_t ledPin;
  bool invert, pauseOnRemove;
  int step;
} cfg;

void loadSettings() {
  prefs.begin("musikbox", true);
  cfg.ssid = prefs.getString("ssid", WIFI_SSID);
  cfg.pass = prefs.getString("pass", WIFI_PASSWORD);
  cfg.server = prefs.getString("server", SERVER_URL);
  cfg.code = prefs.getString("code", BOX_CODE);
  cfg.ledPin = prefs.getUChar("led", RGB_LED_PIN);
  cfg.invert = prefs.getBool("invert", ENCODER_INVERT);
  cfg.pauseOnRemove = prefs.getBool("pause", PAUSE_ON_REMOVE);
  cfg.step = prefs.getInt("step", VOLUME_STEP);
  prefs.end();
  while (cfg.server.endsWith("/")) cfg.server.remove(cfg.server.length() - 1);
}

bool configured() { return cfg.ssid.length() && cfg.server.length() && cfg.code.length(); }

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
void led(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(cfg.ledPin, r, g, b); }
uint32_t ledOffAt = 0;
void flash(uint8_t r, uint8_t g, uint8_t b, uint32_t ms) {
  led(r, g, b);
  ledOffAt = millis() + ms;
}

// --- WLAN ---------------------------------------------------------------------------------
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED || !cfg.ssid.length()) return;
  out.printf("WLAN %s verbinden …\n", cfg.ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    led(i % 2 ? 40 : 0, i % 2 ? 25 : 0, 0);  // gelb blinken
    delay(250);
  }
  led(0, 0, 0);
  if (WiFi.status() == WL_CONNECTED) out.printf("Verbunden, IP %s\n", WiFi.localIP().toString().c_str());
  else out.println("WLAN nicht erreichbar – neuer Versuch später");
}

// --- Server -------------------------------------------------------------------------------
// Antwort-Code (200 = ok); bei Fehlern rote LED. Hinweis: Das Zertifikat wird hier nicht geprüft
// (setInsecure), damit es ohne Zertifikatspflege läuft – der Box-Code gilt nur für Musik.
int post(const char *path, const String &body) {
  if (!configured()) {
    out.println("Noch nicht eingerichtet – in der App unter Musik → Musik-Box → „Per USB einrichten“");
    flash(70, 0, 40, 1500);
    return -1;
  }
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) {
    flash(60, 0, 0, 2000);
    return -1;
  }
  WiFiClientSecure tls;
  tls.setInsecure();
  HTTPClient http;
  String url = cfg.server + "/api/music-box/" + cfg.code + "/" + path;
  http.setTimeout(10000);
  if (!http.begin(tls, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  led(0, 0, 50);  // blau: wird gesendet
  int code = http.POST(body);
  String answer = http.getString();
  http.end();
  out.printf("%s → %d %s\n", path, code, answer.c_str());
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

// --- Einrichten über USB (Zeilen „fc:…“) -----------------------------------------------------------
String jsonEscape(const String &s) {
  String out;
  for (char c : s) {
    if (c == '"' || c == '\\') out += '\\';
    if ((uint8_t)c >= 0x20) out += c;
  }
  return out;
}

byte rc522Version = 0;
bool connectNow = false;     // nach dem Einrichten gleich mit dem WLAN verbinden
uint32_t lastWifiTry = 0;
void printStatus() {
  bool rcOk = rc522Version == 0x91 || rc522Version == 0x92 || rc522Version == 0xB2;
  out.printf("fc:status {\"version\":\"%s\",\"ssid\":\"%s\",\"pass\":%s,\"server\":\"%s\",\"code\":\"%s\",\"led\":%d,"
                "\"invert\":%d,\"pause\":%d,\"step\":%d,\"wifi\":%s,\"ip\":\"%s\",\"rc522\":%s}\n",
                FIRMWARE_VERSION, jsonEscape(cfg.ssid).c_str(), cfg.pass.length() ? "true" : "false", jsonEscape(cfg.server).c_str(),
                cfg.code.length() > 4 ? (cfg.code.substring(0, 4) + "…").c_str() : cfg.code.c_str(), cfg.ledPin, cfg.invert,
                cfg.pauseOnRemove, cfg.step, WiFi.status() == WL_CONNECTED ? "true" : "false",
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "", rcOk ? "true" : "false");
}

void handleCommand(String line) {
  line.trim();
  if (!line.startsWith("fc:")) return;
  line = line.substring(3);
  if (line == "status") return printStatus();
  if (line == "connect") {  // neue WLAN-Daten ausprobieren (ohne Neustart – die USB-Verbindung bleibt bestehen)
    WiFi.disconnect();
    connectNow = true;
    out.println("fc:ok connect");
    return;
  }
  if (line == "restart") {
    out.println("fc:ok restart");
    delay(200);
    ESP.restart();
  }
  if (line == "reset") {
    prefs.begin("musikbox", false);
    prefs.clear();
    prefs.end();
    out.println("fc:ok reset");
    delay(200);
    ESP.restart();
  }
  if (!line.startsWith("set ")) {
    out.println("fc:err unbekannter Befehl");
    return;
  }
  int eq = line.indexOf('=');
  if (eq < 0) {
    out.println("fc:err ohne =");
    return;
  }
  String key = line.substring(4, eq);
  String value = line.substring(eq + 1);
  key.trim();
  prefs.begin("musikbox", false);
  bool ok = true;
  if (key == "ssid" && value.length() <= 32) prefs.putString("ssid", value);
  else if (key == "pass" && value.length() <= 64) prefs.putString("pass", value);
  else if (key == "server" && value.startsWith("http")) prefs.putString("server", value);
  else if (key == "code" && value.length() >= 4 && value.length() <= 64) prefs.putString("code", value);
  else if (key == "led" && (value == "48" || value == "38")) prefs.putUChar("led", value.toInt());
  else if (key == "invert") prefs.putBool("invert", value == "1");
  else if (key == "pause") prefs.putBool("pause", value == "1");
  else if (key == "step" && value.toInt() >= 1 && value.toInt() <= 25) prefs.putInt("step", value.toInt());
  else ok = false;
  prefs.end();
  if (!ok) {
    out.printf("fc:err %s\n", key.c_str());
    return;
  }
  loadSettings();
  out.printf("fc:ok %s\n", key.c_str());
}

void readLines(Stream &in, String &line) {
  while (in.available()) {
    char c = in.read();
    if (c == '\n' || c == '\r') {
      if (line.length()) handleCommand(line);
      line = "";
    } else if (line.length() < 200) {
      line += c;
    }
  }
}
String uartLine, usbLine;
void readSerial() {
  readLines(Serial, uartLine);
  readLines(USBSerial, usbLine);
}

// --- Ablauf ---------------------------------------------------------------------------------
String currentUid;
uint8_t misses = 0;
uint32_t lastPoll = 0, lastVolume = 0;

void setup() {
  Serial.begin(115200);
  USBSerial.setTxTimeoutMs(0);
  USBSerial.begin();
  loadSettings();
  led(0, 0, 0);
  out.printf("FamilyConnect Musik-Box %s\n", FIRMWARE_VERSION);
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
  rc522Version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  out.printf("RC522 Version 0x%02X %s\n", rc522Version,
                (rc522Version == 0x91 || rc522Version == 0x92 || rc522Version == 0xB2) ? "(ok)" : "(nicht gefunden? Verkabelung prüfen)");
  if (!configured()) {
    out.println("Noch nicht eingerichtet – in der App unter Musik → Musik-Box → „Per USB einrichten“");
    return;
  }
  ensureWifi();
  flash(0, 30, 30, 600);  // türkis: bereit
}

void loop() {
  readSerial();
  uint32_t now = millis();
  // nicht eingerichtet: langsam lila blinken
  if (!configured() && !ledOffAt) led(now / 700 % 2 ? 30 : 0, 0, now / 700 % 2 ? 20 : 0);
  // kein WLAN: nach „fc:connect“ sofort, sonst alle 30 s neu versuchen
  if (configured() && WiFi.status() != WL_CONNECTED && (connectNow || now - lastWifiTry > 30000)) {
    connectNow = false;
    lastWifiTry = now;
    ensureWifi();
    if (WiFi.status() == WL_CONNECTED) flash(0, 30, 30, 600);  // türkis: bereit
  }
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
          out.printf("Karte %s → %s\n", uid.c_str(), token.c_str());
          post("card", "{\"token\":\"" + token + "\"}");
        } else {
          out.printf("Karte %s ohne FamilyConnect-Adresse – in der App beschreiben\n", uid.c_str());
          flash(70, 0, 40, 2500);  // lila: Karte unbekannt
        }
      } else {
        rfid.PICC_HaltA();
      }
    } else if (currentUid.length() && ++misses >= 4) {
      out.println("Karte entfernt");
      currentUid = "";
      if (cfg.pauseOnRemove) post("removed", "{}");
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
      int delta = detents * cfg.step * (cfg.invert ? -1 : 1);
      post("control", "{\"action\":\"volume\",\"delta\":" + String(delta) + "}");
    }
  }

  if (btnEnc.pressed()) post("control", "{\"action\":\"toggle\"}");
  if (btnNext.pressed()) post("control", "{\"action\":\"next\"}");
  if (btnPrev.pressed()) post("control", "{\"action\":\"previous\"}");
  delay(5);
}

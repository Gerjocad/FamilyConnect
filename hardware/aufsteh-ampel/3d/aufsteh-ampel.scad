// Aufsteh-Ampel – Gehäuse für WS2812B-Matrix 8×8 (feste Platine) + ESP32-C3 SuperMini
// Teile (Variable "teil"): "gehaeuse", "streuscheibe", "raster", "rueckwand", "raster_test", "alles" (Vorschau)
// Export: xvfb-run -a openscad -D 'teil="gehaeuse"' -o gehaeuse.stl aufsteh-ampel.scad
//
// Aufbau von vorne nach hinten: Rahmen (Gehäuse) → Streuscheibe (eigenes Teil, z. B. transparentes Filament) →
// Raster mit 64 Kammern (Kragen vorne hält die Scheibe) → Matrix-Platine (M2-Schrauben am Raster) →
// Platz für Kabel/Elko/ESP32 → Rückwand (4 Schrauben M2). USB-C kommt oben heraus.
teil = "alles";
$fn = 48;

// --- Matrix (gemessen) ------------------------------------------------------------------
pcb = [65.5, 66.5];      // Breite × Höhe der Platine
pcb_t = 1.6;             // Dicke der Platine
pitch = 49 / 6;          // LED-Abstand (aus Lochabstand 49 mm = 6 Raster) ≈ 8,17 mm
loch_x = 49;             // Lochabstand waagerecht (Mitte–Mitte)
loch_y = 25;             // Lochabstand senkrecht (oben–Mitte, Mitte–unten)
schraube_vor = 1.7;      // Vorbohrung für M2-Schrauben (selbstschneidend in Kunststoff)
schraube_loch = 2.4;     // Durchgangsloch M2

// --- Gehäuse ----------------------------------------------------------------------------
aussen = 76;             // Breite = Höhe außen
tiefe = 32;              // Tiefe ohne Rückwand
ecke = 8;                // Rundung außen
wand = 2.4;              // Seitenwände
rahmen = 1.2;            // Dicke des Rahmens vorne (vor der Streuscheibe)
scheibe = 1.2;           // Dicke der Streuscheibe
kragen = 1.0;            // Kragen des Rasters, drückt die Scheibe in den Rahmen
rand = 2;                // so weit greift der Rahmen über die Scheibe
raster_h = 10;           // Abstand Streuscheibe → LEDs (mehr = weicher, weniger = schärfere Pixel)
raster_wand = 0.8;
raster_frei = 1.2;       // Raster-Wände enden so weit vor der Platine (Platz für Bauteile neben den LEDs)
spiel = 0.2;

innen = aussen - 2 * wand;
raster_aussen = 8 * pitch + raster_wand;
scheibe_s = raster_aussen + 2 * rand;          // Größe der Streuscheibe (= Kragen des Rasters)
tasche = scheibe_s + 2 * spiel;                // Vertiefung im Rahmen für Scheibe + Kragen
front = rahmen + scheibe + kragen;             // so dick ist die Front
raster_z = rahmen + scheibe;                   // Vorderkante des Rasters
pcb_z = raster_z + raster_h;                   // Vorderseite der Platine
hinten_z = pcb_z + pcb_t;                      // Rückseite der Platine
post_pos = innen / 2 - 3.2;                    // Eck-Säulen für die Rückwand
post_d = 7;

// ESP32-C3 SuperMini auf der Rückwand, USB-C nach oben
esp = [18, 22.6];                      // Breite × Länge
esp_t = 1.0;
esp_hoch = 1.5;                        // Abstand Platine – Rückwand
usb = [13, 9];                         // Aussparung oben für den Stecker (Breite × Höhe)

// Oben: Berührungssensor TTP223 (durch 1,2 mm Kunststoff) und Lichtsensor BH1750 (Loch) links/rechts vom USB
ttp = [16, 12];
ttp_x = 19.5;
ttp_wand = 1.2;
bh_x = -19;
bh_loch = 4;
oben_z = hinten_z + 6;                 // hinter der Matrix, im dunklen Teil

module rund(s, r, h) {
  linear_extrude(h) offset(r) square([s - 2 * r, s - 2 * r], center = true);
}

module loecher() {
  for (x = [-loch_x / 2, loch_x / 2], y = [-loch_y, 0, loch_y]) translate([x, y]) children();
}

module gehaeuse() {
  difference() {
    union() {
      difference() {
        rund(aussen, ecke, tiefe);
        translate([0, 0, front]) rund(innen, ecke - wand, tiefe);
        // Fenster vorne
        translate([0, 0, -1]) rund(raster_aussen, 2, rahmen + 2);
        // Vertiefung für Streuscheibe und Kragen des Rasters
        translate([0, 0, rahmen]) rund(tasche, 3, front);
      }
      // Eck-Säulen: halten die Platine nach vorn und die Rückwand; unten 45° schräg zur Wand hin,
      // damit sie ohne Stützen druckt (Gehäuse liegt mit der Front auf dem Drucker)
      for (sx = [-1, 1], sy = [-1, 1]) translate([sx * post_pos, sy * post_pos, 0]) {
        translate([0, 0, hinten_z + post_d]) cylinder(d = post_d, h = tiefe - hinten_z - post_d);
        hull() {
          translate([0, 0, hinten_z + post_d]) cylinder(d = post_d, h = 0.01);
          translate([sx * post_d / 2, sy * post_d / 2, hinten_z]) cylinder(d = 1, h = 0.01);
        }
      }
    }
    for (sx = [-1, 1], sy = [-1, 1]) translate([sx * post_pos, sy * post_pos, hinten_z + post_d]) cylinder(d = schraube_vor, h = tiefe);
    // USB-C oben hinten
    translate([-usb[0] / 2, aussen / 2 - wand - 1, tiefe - usb[1]]) cube([usb[0], wand + 2, usb[1] + 1]);
    // TTP223: Wand innen auf 1,2 mm verdünnt, außen ein kleiner Punkt zum Antippen
    translate([ttp_x - ttp[0] / 2, innen / 2 - 0.01, oben_z - ttp[1] / 2]) cube([ttp[0], wand - ttp_wand, ttp[1]]);
    translate([ttp_x, aussen / 2 + 0.01, oben_z]) rotate([90, 0, 0]) cylinder(d = 6, h = 0.4);
    // BH1750: Lichtloch
    translate([bh_x, innen / 2 - 1, oben_z]) rotate([-90, 0, 0]) cylinder(d = bh_loch, h = wand + 2);
  }
}

module streuscheibe() {
  rund(scheibe_s, 3, scheibe);
}

module raster(h = raster_h) {
  n = 8;
  difference() {
    union() {
      // Kragen vorne: drückt die Streuscheibe in den Rahmen und richtet das Raster mittig aus
      if (h >= raster_h) difference() {
        rund(scheibe_s, 3, kragen);
        translate([0, 0, -1]) rund(raster_aussen - 2 * raster_wand, 0.5, kragen + 2);
      }
      // Rahmen außen bis an die Platine
      difference() {
        translate([-raster_aussen / 2, -raster_aussen / 2, 0]) cube([raster_aussen, raster_aussen, h]);
        translate([-raster_aussen / 2 + raster_wand, -raster_aussen / 2 + raster_wand, -1]) cube([raster_aussen - 2 * raster_wand, raster_aussen - 2 * raster_wand, h + 2]);
      }
      // Trennwände – enden kurz vor der Platine
      for (i = [1 : n - 1]) {
        translate([-4 * pitch + i * pitch - raster_wand / 2, -raster_aussen / 2, 0]) cube([raster_wand, raster_aussen, h - raster_frei]);
        translate([-raster_aussen / 2, -4 * pitch + i * pitch - raster_wand / 2, 0]) cube([raster_aussen, raster_wand, h - raster_frei]);
      }
      // Schraubdome an den Löchern der Platine (mit Kegel darunter, druckt ohne Stütze)
      loecher() {
        translate([0, 0, max(0, h - 6)]) cylinder(d = 4, h = min(6, h));
        if (h > 8) translate([0, 0, h - 8]) cylinder(d1 = 0.8, d2 = 4, h = 2);
      }
    }
    loecher() translate([0, 0, h - 5.5]) cylinder(d = schraube_vor, h = 6);
  }
}

module rueckwand() {
  t = 2;
  lippe = 2;
  ey1 = innen / 2 - 1.2;                 // USB-Ende des ESP32 (oben)
  difference() {
    union() {
      rund(aussen, ecke, t);
      // Lippe passt innen ins Gehäuse
      translate([0, 0, t]) difference() {
        rund(innen - 2 * spiel, ecke - wand, lippe);
        translate([0, 0, -1]) rund(innen - 2 * spiel - 2.4, ecke - wand - 1.2, lippe + 2);
        for (sx = [-1, 1], sy = [-1, 1]) translate([sx * post_pos, sy * post_pos, -1]) cylinder(d = post_d + 1.5, h = lippe + 2);
        translate([-esp[0] / 2 - 1, aussen / 2 - 6, -1]) cube([esp[0] + 2, 6, lippe + 2]);   // Platz für ESP32 und USB
      }
      // Halter für den ESP32-C3: Auflagen, Seitenleisten, Anschlag
      translate([0, 0, t]) {
        for (sx = [-1, 1]) {
          translate([sx * (esp[0] / 2 + 0.3) + (sx < 0 ? -1.2 : 0), ey1 - esp[1] + 1, 0]) cube([1.2, esp[1] - 4, esp_hoch + esp_t + 1]);
          translate([sx * (esp[0] / 2 - 1.5) - 1, ey1 - esp[1] + 2, 0]) cube([2, esp[1] - 6, esp_hoch]);
        }
        translate([-6, ey1 - esp[1] - 1.5, 0]) cube([12, 1.2, esp_hoch + esp_t + 1]);
      }
    }
    // Schraublöcher mit Senkung
    for (sx = [-1, 1], sy = [-1, 1]) translate([sx * post_pos, sy * post_pos, -1]) {
      cylinder(d = schraube_loch, h = t + 2);
      cylinder(d1 = 4.6, d2 = schraube_loch, h = 1 + 1.2);
    }
    // Lüftungsschlitze (unterhalb des ESP32)
    for (i = [-2 : 2]) translate([i * 6 - 1, -24, -1]) cube([2, 16, t + 2]);
  }
}

if (teil == "gehaeuse") gehaeuse();
else if (teil == "streuscheibe") streuscheibe();
else if (teil == "raster") raster();
else if (teil == "raster_test") raster(4);
else if (teil == "rueckwand") rueckwand();
else if (teil == "alles") {
  color("white", 0.6) gehaeuse();
  color("lightblue", 0.7) translate([0, 0, rahmen]) streuscheibe();
  color("gray") translate([0, 0, raster_z]) raster();
  color("green") translate([-pcb[0] / 2, -pcb[1] / 2, pcb_z]) cube([pcb[0], pcb[1], pcb_t]);
  color("orange") translate([0, 0, tiefe + 2]) mirror([0, 0, 1]) rueckwand();
}

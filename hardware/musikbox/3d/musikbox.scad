// Musik-Box für FamilyConnect – zum 3D-Druck (OpenSCAD 2021+)
// Teile einzeln exportieren:  openscad -D 'part="gehaeuse"' -o gehaeuse.stl musikbox.scad
//   part = "gehaeuse" | "boden" | "karte_vorne" | "karte_hinten" | "tastenkappe" | "drehknopf" | "alles" (Vorschau)
//
// Alle Maße in mm. Vor dem Druck die Werte unter „Bauteile“ mit deinen Teilen vergleichen
// (Schieblehre) – besonders Taster und Drehgeber gibt es in leicht unterschiedlichen Größen.

part = "alles";
$fn = 64;

// ---------------- Karte ----------------
card = 64;            // quadratisch, passt zu Playlist-Covern
card_r = 6;           // Eckenradius
card_half = 1.0;      // Dicke je Hälfte → Karte 2 mm
sticker_d = 26;       // NFC-Aufkleber Ø25 mm (+ Luft)
sticker_depth = 0.5;  // Vertiefung in der hinteren Hälfte
inside = 51;          // so tief steckt die Karte (≈ 4/5)

// ---------------- Gehäuse ----------------
W = 88;  D = 56;  H = 86;   // außen
wall = 2.4;
r = 6;                      // Eckenradius außen
slot_clear = 0.8;           // Luft für die Karte im Schlitz (Dicke)
slot_side = 1.4;            // Luft seitlich
slot_y = 20;                // Mitte des Schlitzes ab Vorderkante
ch_wall = 1.2;              // Wände des Kartenschachts (dünn → gute Lesereichweite)

// ---------------- Bauteile ----------------
rc522 = [60.4, 40.2];       // RC522-Platine (B × H), wird hinter dem Schacht eingesetzt
rc522_t = 1.7;
esp = [69.5, 25.8];         // ESP32-S3-DevKitC-1
esp_h = 22;                 // Höhe der Auflage über dem Boden (Platz für die Steckkabel unten)
enc_hole = 7.4;             // Drehgeber EC11: Gewinde M7
btn_hole = 10.2;            // Loch für die Tastenkappe
btn_body = 12.3;            // Omron-Taster 12 × 12 mm
ctrl_z = 18;                // Höhe der Bedienelemente
btn_x = 26;                 // Abstand der Tasten von der Mitte

slot_w = card + 2 * slot_side;
slot_t = 2 * card_half + slot_clear;
floor_z = H - inside;                // hier steht die Karte auf
// ESP32 liegt hinter den Bedienelementen, USB-Ende an der rechten Wand
esp_cx = W / 2 - wall - 1.2 - esp[0] / 2;
esp_cy = -D / 2 + 30;
esp_end = 3;                // so weit liegt die Platine an jedem Ende auf (dort sind keine Pins)
boss = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
boss_x = W / 2 - wall - 3.6;
boss_y = D / 2 - wall - 3.6;

module rbox(size, rad, h) {  // abgerundeter Quader, unten auf z = 0
  linear_extrude(h) offset(r = rad) square([size[0] - 2 * rad, size[1] - 2 * rad], center = true);
}

// ================== Gehäuse (wird kopfüber gedruckt) ==================
module gehaeuse() {
  difference() {
    union() {
      difference() {
        rbox([W, D], r, H);
        translate([0, 0, -0.01]) rbox([W - 2 * wall, D - 2 * wall], r - wall, H - wall);
      }
      // Kartenschacht: Wände von der Decke bis zum Anschlag
      translate([0, -D / 2 + slot_y, floor_z - ch_wall])
        difference() {
          translate([0, 0, (H - floor_z + ch_wall) / 2])
            cube([slot_w + 2 * ch_wall, slot_t + 2 * ch_wall, H - floor_z + ch_wall], center = true);
          translate([0, 0, ch_wall + (H - floor_z) / 2 + 0.01]) cube([slot_w, slot_t, H - floor_z], center = true);
        }
      // RC522: Auflage mit Nut direkt hinter dem Schacht, seitliche Anschläge
      rc_y = -D / 2 + slot_y + slot_t / 2 + ch_wall;  // Rückseite der Schachtwand
      rc_bottom = H - wall - 0.3 - rc522[1];
      translate([0, rc_y, rc_bottom - 2])
        difference() {
          translate([-rc522[0] / 2 - 2, 0, 0]) cube([rc522[0] + 4, rc522_t + 2, 4]);
          translate([-rc522[0] / 2, -0.01, 2]) cube([rc522[0], rc522_t + 0.01, 3]);
        }
      for (s = [-1, 1]) translate([s * (rc522[0] / 2 + 1), rc_y + (rc522_t + 2) / 2, rc_bottom + rc522[1] / 2])
        cube([2, rc522_t + 2, rc522[1]], center = true);
      // Schraubdome für den Boden
      // (enden auf Höhe der Bodenplatte, die innen bündig eingesetzt wird)
      for (b = boss) translate([b[0] * boss_x, b[1] * boss_y, wall]) cylinder(d = 7.5, h = H - 2 * wall + 0.01);
      // Halter für die beiden Taster hinter der Front
      for (s = [-1, 1]) translate([s * btn_x, -D / 2 + wall + 1.4, ctrl_z])
        rotate([-90, 0, 0]) difference() {
          translate([-(btn_body + 3) / 2, -(btn_body + 3) / 2, 0]) cube([btn_body + 3, btn_body + 3, 5.5]);
          translate([0, 0, -0.01]) cylinder(d = 8, h = 1.02);                                   // Durchgang Stößel
          translate([-btn_body / 2, -btn_body / 2, 1]) cube([btn_body, btn_body, 5]);            // Taster von hinten
          translate([-(btn_body + 4) / 2, -1.5, 3]) cube([btn_body + 4, 3, 3]);                  // Beinchen/Kabel
        }
    }
    // Schlitz oben mit Einführschräge
    translate([0, -D / 2 + slot_y, floor_z]) cube([slot_w, slot_t, 2 * (H - floor_z) + 1], center = true);
    translate([0, -D / 2 + slot_y, H - 1.2]) hull() {
      cube([slot_w, slot_t, 0.01], center = true);
      translate([0, 0, 1.21]) cube([slot_w + 2.4, slot_t + 2.4, 0.01], center = true);
    }
    // Griffmulde vorn/hinten am Schlitz, damit man die Karte gut fassen kann
    for (s = [-1, 1]) translate([0, -D / 2 + slot_y + s * (slot_t / 2 + 4), H + 4.5]) scale([1, 0.5, 0.3]) sphere(d = 36);
    // Bedienelemente vorn
    translate([0, -D / 2 - 1, ctrl_z]) rotate([-90, 0, 0]) cylinder(d = enc_hole, h = wall + 2);
    translate([4.5 , -D / 2 + wall - 1.0, ctrl_z + 6.6]) cube([2.6, 1.6, 1.4], center = true);  // Nase des Drehgebers (optional)
    for (s = [-1, 1]) translate([s * btn_x, -D / 2 - 1, ctrl_z]) rotate([-90, 0, 0]) cylinder(d = btn_hole, h = wall + 2);
    // Symbole neben den Tasten (leicht vertieft)
    for (s = [-1, 1]) translate([s * btn_x, -D / 2 + 0.4, ctrl_z + 11]) rotate([90, 0, 0])
      linear_extrude(1) text(s < 0 ? "<<" : ">>", size = 4.5, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
    // USB-C rechts für Strom, darüber Lichtschlitz für die Status-LED
    // (beide USB-C-Buchsen des DevKitC-1 erreichbar – eine reicht für Strom)
    translate([W / 2 - wall - 1, esp_cy, wall + esp_h + 3.3]) rotate([0, 90, 0])
      hull() for (o = [-7.5, 7.5]) translate([0, o, 0]) cylinder(d = 7.5, h = wall + 2);
    translate([W / 2 - wall - 1, esp_cy - 4, wall + esp_h + 9]) cube([wall + 2, 8, 2]);
    // Schraublöcher in den Domen
    for (b = boss) translate([b[0] * boss_x, b[1] * boss_y, wall - 0.01]) cylinder(d = 2.6, h = 14);
  }
}

// ================== Boden ==================
module boden() {
  difference() {
    rbox([W - 2 * wall - 0.6, D - 2 * wall - 0.6], r - wall, wall);
    for (b = boss) translate([b[0] * boss_x, b[1] * boss_y, -0.01]) {
      cylinder(d = 3.3, h = wall + 1);
      cylinder(d1 = 6.4, d2 = 3.3, h = 1.6);   // Senkkopf
    }
    for (x = [-25, 0, 25]) translate([x, 0, -0.01]) cube([12, 2, wall + 1], center = true);  // Lüftung
  }
  // Auflagen für den ESP32: die Platine liegt nur an den beiden kurzen Enden auf (dort sind keine Pins),
  // die Pins zeigen nach unten in den freien Raum für die Steckkabel. Links ein Anschlag, rechts die Wand.
  translate([esp_cx, esp_cy, wall]) {
    for (s = [-1, 1]) translate([s * (esp[0] / 2 - esp_end / 2), 0, 0]) {
      translate([-esp_end / 2, -esp[1] / 2 - 2, 0]) cube([esp_end, esp[1] + 4, esp_h]);        // Auflage
      for (t = [-1, 1]) translate([-esp_end / 2, t > 0 ? esp[1] / 2 : -esp[1] / 2 - 2, 0])
        cube([esp_end, 2, esp_h + 3]);                                                           // seitliche Führung
    }
    translate([-esp[0] / 2 - 2.5, -esp[1] / 2 - 2, 0]) cube([2.5, esp[1] + 4, esp_h + 4]);       // Anschlag links
  }
}

// ================== Karte (2 Hälften, NFC-Aufkleber dazwischen) ==================
module karte_form(h) {
  linear_extrude(h) offset(r = card_r) square([card - 2 * card_r, card - 2 * card_r], center = true);
}
module karte_vorne() { karte_form(card_half); }   // Vorderseite: Cover aufkleben oder mehrfarbig drucken
module karte_hinten() {
  difference() {
    karte_form(card_half);
    translate([0, 0, card_half - sticker_depth]) cylinder(d = sticker_d, h = 1);  // Aufkleber in der Mitte
  }
}

// ================== Tastenkappe & Drehknopf ==================
module tastenkappe() {
  cylinder(d = btn_hole - 0.6, h = wall + 2.5);                  // sichtbarer Teil + Durchgang
  translate([0, 0, wall + 2.5 - 0.01]) cylinder(d = 13.5, h = 1.2);  // Rand innen (hält die Kappe)
  translate([0, 0, wall + 2.5 + 1.2 - 0.01]) cylinder(d = 5, h = 1.6); // drückt auf den Taster
}
module drehknopf() {
  difference() {
    union() {
      cylinder(d = 24, h = 13);
      for (a = [0 : 20 : 359]) rotate(a) translate([12, 0, 0]) cylinder(d = 2, h = 13, $fn = 12);
    }
    translate([0, 0, -0.01]) difference() {             // D-Welle 6 mm
      cylinder(d = 6.15, h = 11);
      translate([1.6, -4, -0.1]) cube([4, 8, 12]);
    }
    translate([0, 0, 12.2]) difference() { cylinder(d = 18, h = 1); cylinder(d = 16.5, h = 1); }  // Zierring
    translate([0, 9.5, 12.4]) cylinder(d = 2, h = 1);  // Markierung
  }
}

// ================== Ausgabe ==================
if (part == "gehaeuse") rotate([180, 0, 0]) gehaeuse();      // kopfüber drucken
else if (part == "boden") boden();
else if (part == "karte_vorne") karte_vorne();
else if (part == "karte_hinten") karte_hinten();
else if (part == "tastenkappe") rotate([180, 0, 0]) tastenkappe();
else if (part == "drehknopf") rotate([180, 0, 0]) drehknopf();
else if (part == "alles") {
  color("#f2efe9", 0.55) gehaeuse();
  color("#d9d4cc") translate([0, 0, 0]) boden();
  // Karte steckt im Schlitz
  color("#e8590c") translate([0, -D / 2 + slot_y, floor_z + card / 2]) rotate([90, 0, 0]) translate([0, 0, -card_half]) {
    karte_vorne(); translate([0, 0, card_half]) karte_hinten();
  }
  color("#2f6fd6") translate([0, -D / 2 + slot_y + slot_t / 2 + ch_wall + rc522_t / 2, H - wall - 0.3 - rc522[1] / 2]) cube([rc522[0], rc522_t, rc522[1]], center = true);
  color("#1a1a1a") translate([0, -D / 2 - 13, ctrl_z]) rotate([-90, 0, 0]) drehknopf();
  for (s = [-1, 1]) color("#444") translate([s * btn_x, -D / 2 - 2.5, ctrl_z]) rotate([-90, 0, 0]) tastenkappe();
}

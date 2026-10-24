// FamilyConnect Wandsensor – Gehäuse für Anwesenheitssensor + Lichtsensor neben dem Wanddisplay
//
// Vorderseite (zum Raum):  links der Anwesenheitssensor, rechts oben das kleine Lichtfenster (BH1750)
// Rückwand: wird an die Wand geschraubt (2 Schlüssellöcher) oder geklebt, dann das Gehäuse mit 3–4 Schrauben drauf.
// Der ESP32 liegt auf der Rückwand, das USB-Kabel kommt unten (C3) bzw. rechts (S3) heraus.
//
// Drucken: Gehäuse mit der Vorderseite nach unten (keine Stützen nötig), Rückwand flach.
// PLA/PETG, 0,2 mm Schicht, 3 Wandlinien. Für den Radar möglichst kein metallhaltiges Filament (Glitzer, Carbon).
//
// Exportieren, z. B.:  openscad -D 'part="gehaeuse"' -D 'board="c3"' -D 'sensor="radar"' -o gehaeuse.stl wandsensor.scad

part = "alles";      // gehaeuse | rueckwand | alles
board = "c3";        // c3 = ESP32-C3 SuperMini · s3 = ESP32-S3-DevKitC-1
sensor = "radar";    // radar = HLK-LD2402 (unsichtbar hinter der Front) · pir = HC-SR501 (Kuppel schaut heraus)

$fn = 64;

// --- Maße --------------------------------------------------------------------------------
wall = 2;            // Seitenwände
ft = 2;              // Vorderwand
r = 4;               // Eckenradius außen
bp = 2.5;            // Rückwand
fit = 0.3;           // Spiel Rückwand ↔ Gehäuse

W = board == "s3" ? 84 : 62;   // innen
H = board == "s3" ? 40 : 38;
D = board == "s3" ? 36 : 20;

// Anwesenheitssensor (Mitte der Zone)
sens_x = -W / 2 + 24;
sens_y = 0;
pir_hole = 23.5;     // Kuppel des HC-SR501
radar_w = 30;        // Vertiefung innen, in die der Radar geklebt wird (größer als das Modul)
radar_h = 26;
radar_front = 1.0;   // Restwandstärke vor dem Radar

// Lichtfenster für den BH1750
light_x = W / 2 - 12;
light_y = 4;
light_d = 5;

// Schraubdome (M3 bzw. 3 mm Blechschraube) – beim S3 unten rechts keiner, da liegt die Platine
boss_d = 7;
boss_in = [W / 2 - boss_d / 2, H / 2 - boss_d / 2];
bosses = board == "s3"
  ? [[-1, 1], [1, 1], [-1, -1]]
  : [[-1, 1], [1, 1], [-1, -1], [1, -1]];

// ESP32-C3 SuperMini: 22,5 × 18 mm, USB-C nach unten
c3_l = 23.3;  c3_w = 18.8;
c3_x = W / 2 - boss_d - 1 - c3_w / 2;
// ESP32-S3-DevKitC-1: 69 × 25,5 mm auf zwei Stützen (Stiftleisten zeigen zur Wand), USB-C nach rechts
s3_l = 69.5;  s3_w = 26;  s3_stand = 14;
s3_x = W / 2 - 1.5 - s3_l / 2;
s3_y = -H / 2 + 1 + s3_w / 2;

// Schlüssellöcher (Kopf der Wandschraube liegt innen, Schlitz nach oben) – frei von der Platine
keyholes = board == "s3" ? [[-W / 4, H / 2 - 7], [W / 4, H / 2 - 7]] : [[-20, 6], [-3, 6]];
key_slot = board == "s3" ? 5 : 6;

OW = W + 2 * wall;
OH = H + 2 * wall;
OD = ft + D;

module rbox(w, h, d, rr) {
  linear_extrude(d) offset(rr) square([w - 2 * rr, h - 2 * rr], center = true);
}

// --- Gehäuse (Vorderseite bei z = 0) --------------------------------------------------------
module gehaeuse() {
  difference() {
    union() {
      difference() {
        rbox(OW, OH, OD, r);
        translate([0, 0, ft]) rbox(W, H, OD, max(r - wall, 0.5));
      }
      // Schraubdome bis zur Rückwand
      for (b = bosses) translate([b[0] * boss_in[0], b[1] * boss_in[1], 0]) cylinder(d = boss_d, h = OD - bp);
    }
    for (b = bosses) translate([b[0] * boss_in[0], b[1] * boss_in[1], OD - bp - 12]) cylinder(d = 2.5, h = 13);

    // Anwesenheitssensor
    if (sensor == "pir") {
      translate([sens_x, sens_y, -1]) cylinder(d = pir_hole, h = ft + 2);
    } else {
      translate([sens_x - radar_w / 2, sens_y - radar_h / 2, radar_front]) cube([radar_w, radar_h, ft]);
    }

    // Lichtfenster mit Fase außen
    translate([light_x, light_y, -1]) cylinder(d = light_d, h = ft + 2);
    translate([light_x, light_y, -0.01]) cylinder(d1 = light_d + 3, d2 = light_d, h = 1.5);

    // Kabelausgang
    if (board == "s3") {
      // rechte Seite, Höhe der beiden USB-C-Buchsen
      translate([W / 2 - 1, s3_y - 12, OD - bp - s3_stand - 1.6 - 1.6 - 4]) cube([wall + 2, 24, OD]);
    } else {
      // unten, Kerbe von hinten (Stecker 8 mm breit, Kabeltülle bis 11 mm)
      translate([c3_x - 6, -OH / 2 - 1, OD - bp - 2.6 - 3.8]) cube([12, wall + 2, OD]);
    }

    // Lüftungsschlitze unten (der ESP wird etwas warm)
    for (i = [-2:2]) translate([-W / 2 + 20 + i * 5 - 0.75, -OH / 2 - 1, ft + 4]) cube([1.5, wall + 2, D - bp - 8]);

    // Griffmulde zum Abnehmen
    translate([0, OH / 2 + 0.5, OD]) rotate([0, 90, 0]) cylinder(d = 3, h = 14, center = true);
  }
}

// --- Rückwand (liegt beim Druck flach; Außenseite = z 0) ----------------------------------------
module keyhole() {
  // großer Kreis für den Schraubenkopf, Schlitz nach oben
  translate([0, 0, -1]) cylinder(d = 8.5, h = bp + 2);
  translate([-2.1, 0, -1]) cube([4.2, key_slot, bp + 2]);
}
// Modelliert von außen gesehen (gespiegelt), damit sie umgedreht genau ins Gehäuse passt
module rueckwand() {
  mirror([1, 0, 0]) rueckwand_innen();
}
module rueckwand_innen() {
  w = W - 2 * fit;
  h = H - 2 * fit;
  difference() {
    union() {
      rbox(w, h, bp, max(r - wall - fit, 0.5));
      if (board == "s3") {
        // zwei Stützen unter den Platinen-Enden (die Stiftleisten bleiben frei)
        for (sx = [-1, 1]) translate([s3_x + sx * (s3_l / 2 - 2) - 2, s3_y - s3_w / 2, 0]) cube([4, s3_w, bp + s3_stand]);
        // Anschlag links (rechts sitzen die USB-Buchsen)
        translate([s3_x - s3_l / 2 - 1.8, s3_y - s3_w / 2, 0]) cube([1.8, s3_w, bp + s3_stand + 3]);
      } else {
        // Rahmen für den C3, unten offen (USB-C)
        translate([c3_x, -h / 2 + c3_l / 2, 0]) difference() {
          translate([-c3_w / 2 - 1.2, -c3_l / 2, 0]) cube([c3_w + 2.4, c3_l + 1.2, bp + 2.5]);
          translate([-c3_w / 2, -c3_l / 2 - 1, 0.01]) cube([c3_w, c3_l + 1, bp + 3]);
          translate([-c3_w / 2, -c3_l / 2 - 1, bp]) cube([c3_w, c3_l + 1, 3]);
        }
      }
    }
    // Schrauben ins Gehäuse (Senkkopf von außen)
    for (b = bosses) translate([b[0] * boss_in[0], b[1] * boss_in[1], 0]) {
      translate([0, 0, -1]) cylinder(d = 3.4, h = bp + 2);
      translate([0, 0, -0.01]) cylinder(d1 = 6.4, d2 = 3.4, h = 1.6);
    }
    // Schlüssellöcher für die Wand
    for (k = keyholes) translate([k[0], k[1], 0]) keyhole();
  }
}

// --- Vorschau ------------------------------------------------------------------------------
module pir_dummy() {
  color("white") translate([sens_x, sens_y, -9]) sphere(d = pir_hole - 0.5);
  color("green") translate([sens_x - 16.15, sens_y - 12.15, ft]) cube([32.3, 24.3, 1.6]);
}
module radar_dummy() {
  color("dodgerblue") translate([sens_x - 11, sens_y - 11, radar_front]) cube([22, 22, 3]);
}

if (part == "gehaeuse") {
  gehaeuse();
} else if (part == "rueckwand") {
  rueckwand();
} else if (part == "alles") {
  color("orange", 0.9) gehaeuse();
  if (sensor == "pir") pir_dummy(); else radar_dummy();
  // Rückwand umgedreht an ihrem Platz, etwas herausgezogen
  color("gray") translate([0, 0, OD + 25]) rotate([0, 180, 0]) rueckwand();
}

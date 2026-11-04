// Bilder für die Bauanleitung: openscad -D part=\"keins\" -D bild=\"innen\" -o bilder/innen.png bilder.scad
// (bild = innen | boden | explosion | karte) – siehe bauen.py
include <../3d/musikbox.scad>
rc_y = -D / 2 + slot_y + slot_t / 2 + ch_wall;
rc_bottom = H - wall - 0.3 - rc522[1];
module enc_modul() {   // Drehgeber-Modul: Gewinde durch die Front, runde Platine dahinter, Pins unten nach hinten
  y0 = -D / 2 + wall;
  color("silver") translate([0, -D / 2 - 1, ctrl_z]) rotate([-90, 0, 0]) cylinder(d = 7, h = wall + 1.5);
  color("#bbb") translate([-6, y0, ctrl_z - 6]) cube([12, 6.5, 12]);
  color("#1f4fbf") translate([0, y0 + 6.5, ctrl_z]) rotate([-90, 0, 0]) cylinder(d = 23.5, h = 1.6);
  color("gold") for (i = [-2:2]) translate([i * 2.54 - 0.3, y0 + 8, ctrl_z - 9.5]) cube([0.6, 7, 0.6]);
}
module taster() {   // Tasterhalter (an die Front geklebt) mit kleinem Taster
  for (s = [-1, 1]) {
    color("#f2f2f2") translate([s * btn_x, -D / 2 + wall, ctrl_z]) rotate([-90, 0, 0]) tastenhalter();
    color("#222") translate([s * btn_x - 3.8, -D / 2 + wall + 4.9, ctrl_z - 3.8]) cube([7.6, 2, 7.6]);
  }
}
module rc522_teil() {
  color("#2f6fd6") translate([-rc522[0] / 2, rc_y, rc_bottom]) cube([rc522[0], rc522_t, rc522[1]]);
  color("gold") for (i = [0:7]) translate([rc522[0] / 2 - 3, rc_y + rc522_t, rc_bottom + 10 + i * 2.54]) cube([0.6, 8, 0.6]);
}
module esp_teil() {
  translate([esp_cx, esp_cy, wall + esp_h]) {
    color("#1a1a1a") translate([-esp_pcb[0] / 2, -esp_pcb[1] / 2, 0]) cube([esp_pcb[0], esp_pcb[1], 1.6]);
    color("silver") translate([-esp_pcb[0] / 2 - 4.5, -9, 1.6]) cube([22, 18, 3.2]);
    color("silver") for (o = [-5.5, 5.5]) translate([esp_pcb[0] / 2 - 4.5, o - 4.5, 1.6]) cube([7.3, 9, 3.2]);
    for (sy = [-1, 1]) color("gold") translate([-esp_pcb[0] / 2 + 0.5, sy * 12.8 - 1.27, -8.5]) cube([22 * 2.54, 2.54, 8.5]);
  }
}
if (bild == "innen") {   // vordere Hälfte des Gehäuses von hinten gesehen, Bauteile eingesetzt
  color("#666") intersection() { gehaeuse(); translate([-60, -60, -1]) cube([120, 58, 100]); }
  enc_modul(); taster(); rc522_teil();
}
if (bild == "boden") { color("#555") boden(); esp_teil(); }
if (bild == "explosion") {
  color("#555", 0.9) translate([0, 0, 45]) gehaeuse();
  translate([0, 0, 45]) { enc_modul(); taster(); rc522_teil(); }
  color("#777") boden(); esp_teil();
  color("#111") translate([0, -D / 2 - 22, ctrl_z + 45]) rotate([-90, 0, 0]) drehknopf();
  for (s = [-1, 1]) color("#333") translate([s * btn_x, -D / 2 - 18, ctrl_z + 45]) rotate([-90, 0, 0]) tastenkappe();
  color("#e8590c") translate([0, -D / 2 + slot_y, H + 45 + 15]) rotate([90, 0, 0]) translate([0, 0, -card_half]) { karte_vorne(); translate([0, 0, card_half]) karte_hinten(); }
}
if (bild == "front") { color("#555") gehaeuse(); enc_modul(); taster(); }
if (bild == "karte") {
  color("#f2f2f2") karte_vorne();
  translate([75, 0, 0]) { color("#e8590c") karte_hinten(); color("#c9a227") translate([0, 0, card_half - sticker_depth + 0.01]) cylinder(d = 25, h = sticker_depth); }
}

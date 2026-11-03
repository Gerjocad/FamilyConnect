# Baut ../Anleitung-Musikbox.pdf (python3 bauen.py). Bilder: bilder.scad → bilder/*.png (siehe Kopf von bilder.scad).
from pathlib import Path

from reportlab.graphics.shapes import Circle, Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

HERE = Path(__file__).parent
OUT = HERE.parent / 'Anleitung-Musikbox.pdf'
FONTS = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('Sans', FONTS + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Bold', FONTS + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Mono', FONTS + 'DejaVuSansMono.ttf'))
pdfmetrics.registerFontFamily('Sans', normal='Sans', bold='Sans-Bold')

ACCENT = colors.HexColor('#e8590c')
SOFT = colors.HexColor('#fff4e6')
WARN = colors.HexColor('#fff0f0')
GRID = colors.HexColor('#dddddd')

st = {
    'title': ParagraphStyle('t', fontName='Sans-Bold', fontSize=22, leading=27, textColor=ACCENT),
    'sub': ParagraphStyle('s', fontName='Sans', fontSize=11, leading=15, textColor=colors.HexColor('#555555')),
    'h1': ParagraphStyle('h1', fontName='Sans-Bold', fontSize=15, leading=19, spaceBefore=10, spaceAfter=6, textColor=ACCENT),
    'h2': ParagraphStyle('h2', fontName='Sans-Bold', fontSize=11.5, leading=15, spaceBefore=8, spaceAfter=3),
    'p': ParagraphStyle('p', fontName='Sans', fontSize=9.5, leading=13.5, spaceAfter=4),
    'cell': ParagraphStyle('c', fontName='Sans', fontSize=8.8, leading=11.5),
    'cellb': ParagraphStyle('cb', fontName='Sans-Bold', fontSize=8.8, leading=11.5),
    'cap': ParagraphStyle('cap', fontName='Sans', fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=colors.HexColor('#666666'), spaceAfter=8),
    'code': ParagraphStyle('code', fontName='Mono', fontSize=8.5, leading=11.5, backColor=colors.HexColor('#f4f4f4'), borderPadding=6, spaceBefore=4, spaceAfter=8),
}


def P(text, style='p'):
    return Paragraph(text, st[style])


def box(text, color=SOFT, border=ACCENT):
    t = Table([[Paragraph(text, st['p'])]], colWidths=[170 * mm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), color), ('BOX', (0, 0), (-1, -1), 0.8, border),
                           ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                           ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
    return t


def table(rows, widths, header=True):
    data = [[Paragraph(str(c), st['cellb' if header and i == 0 else 'cell']) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if header else 0)
    style = [('GRID', (0, 0), (-1, -1), 0.4, GRID), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
             ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
    if header:
        style.append(('BACKGROUND', (0, 0), (-1, 0), SOFT))
    t.setStyle(TableStyle(style))
    return t


def steps(items):
    rows = [[Paragraph(f'<b>{i}</b>', st['p']), Paragraph(t, st['p'])] for i, t in enumerate(items, 1)]
    t = Table(rows, colWidths=[8 * mm, 162 * mm])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TEXTCOLOR', (0, 0), (0, -1), ACCENT),
                           ('LEFTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 1)]))
    return t


def img(name, width_mm, caption=None):
    path = HERE / 'bilder' / name
    from PIL import Image as PILImage
    w, h = PILImage.open(path).size
    out = [Image(str(path), width=width_mm * mm, height=width_mm * mm * h / w)]
    if caption:
        out.append(P(caption, 'cap'))
    return KeepTogether(out)


# ---------------- Schaltplan: Pinbelegung des Boards (Nachbau, Ansicht von oben, USB oben) ----------------
LEFT = ['GND', 'GND', '19', '20', '21', '47', '48', '45', '0', '35', '36', '37', '38', '39', '40', '41', '42', '2', '1', 'RX', 'TX', 'GND']
RIGHT = ['GND', '5Vin', '14', '13', '12', '11', '10', '9', '46', '3', '8', '18', '17', '16', '15', '7', '6', '5', '4', 'RST', '3V3', '3V3']
C = {
    'rot': '#d62828', 'schwarz': '#222222', 'gelb': '#e9c46a', 'grün': '#2a9d8f', 'blau': '#1d4ed8', 'orange': '#f77f00',
    'lila': '#7b2cbf', 'pink': '#e5579a', 'türkis': '#06b6d4', 'violett': '#a855f7', 'braun': '#8d5524', 'hellgrün': '#65a30d',
    'grau': '#9ca3af',
}
# (Seite, Index von oben) → (Text, Farbe)
TAGS = {
    ('R', 0): ('GND → RC522 GND', 'schwarz'),
    ('R', 3): ('GPIO 13 → RC522 MISO', 'gelb'),
    ('R', 4): ('GPIO 12 → RC522 SCK', 'grün'),
    ('R', 5): ('GPIO 11 → RC522 MOSI', 'blau'),
    ('R', 6): ('GPIO 10 → RC522 SDA', 'orange'),
    ('R', 7): ('GPIO 9 → RC522 RST', 'lila'),
    ('R', 13): ('GPIO 16 → Taste vor (>>)', 'hellgrün'),
    ('R', 14): ('GPIO 15 → Taste zurück (<<)', 'braun'),
    ('R', 16): ('GPIO 6 → Drehgeber KEY', 'violett'),
    ('R', 17): ('GPIO 5 → Drehgeber S2', 'türkis'),
    ('R', 18): ('GPIO 4 → Drehgeber S1', 'pink'),
    ('R', 19): ('RST – frei lassen!', 'grau'),
    ('R', 20): ('3V3 → RC522 3.3V', 'rot'),
    ('R', 21): ('3V3 → Drehgeber „5V“', 'rot'),
    ('L', 0): ('Drehgeber GND ← GND', 'schwarz'),
    ('L', 1): ('Taste << (2. Bein) ← GND', 'schwarz'),
    ('L', 21): ('Taste >> (2. Bein) ← GND', 'schwarz'),
}


def pinout():
    pitch, bw, top = 12.6, 140, 30
    W, H = 480, top + 22 * pitch + 46
    d = Drawing(W, H)
    bx = (W - bw) / 2
    by = H - top - 22 * pitch - 6
    # Platine, USB-Buchsen oben, Antenne unten
    for ux in (bx + 38, bx + 82):
        d.add(Rect(ux, by + 22 * pitch + 2, 26, 16, fillColor=colors.HexColor('#c0c0c0'), strokeColor=colors.HexColor('#888888')))
    d.add(String(W / 2, H - 6, 'USB-C  →  zur Öffnung in der rechten Gehäusewand', fontName='Sans-Bold', fontSize=8, textAnchor='middle'))
    d.add(Rect(bx, by, bw, 22 * pitch + 10, fillColor=colors.HexColor('#1a1a1a'), strokeColor=colors.black, rx=3, ry=3))
    d.add(Rect(bx + 38, by - 16, 64, 18, fillColor=colors.HexColor('#2b2b2b'), strokeColor=colors.HexColor('#555555')))
    d.add(String(W / 2, by - 28, 'Antenne (steht über)', fontName='Sans', fontSize=7.5, textAnchor='middle'))
    d.add(String(W / 2, by + 11 * pitch + 2, 'ESP32-S3', fontName='Sans-Bold', fontSize=10, fillColor=colors.white, textAnchor='middle'))
    d.add(String(W / 2, by + 11 * pitch - 11, 'von oben, Bauteile sichtbar', fontName='Sans', fontSize=7, fillColor=colors.HexColor('#bbbbbb'), textAnchor='middle'))
    for side, names in (('L', LEFT), ('R', RIGHT)):
        px = bx + 8 if side == 'L' else bx + bw - 8
        for i, name in enumerate(names):
            py = by + 22 * pitch - i * pitch
            tag = TAGS.get((side, i))
            col = colors.HexColor(C[tag[1]]) if tag else colors.HexColor('#bbbbbb')
            d.add(Circle(px, py, 3.6, fillColor=col if tag else colors.HexColor('#d4af37'), strokeColor=colors.white if tag else None, strokeWidth=0.8))
            lx = px + 7 if side == 'L' else px - 7
            d.add(String(lx, py - 2.6, name, fontName='Sans-Bold' if tag else 'Sans', fontSize=6.8,
                         fillColor=colors.white if tag else colors.HexColor('#9a9a9a'), textAnchor='start' if side == 'L' else 'end'))
            if tag:
                ex = bx - 14 if side == 'L' else bx + bw + 14
                d.add(Line(px, py, ex, py, strokeColor=col, strokeWidth=2))
                d.add(String(ex + (-4 if side == 'L' else 4), py - 3, tag[0], fontName='Sans', fontSize=7.8,
                             fillColor=colors.black, textAnchor='end' if side == 'L' else 'start'))
    return d


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Sans', 8)
    canvas.setFillColor(colors.HexColor('#888888'))
    canvas.drawString(20 * mm, 12 * mm, 'Musik-Box – Bau- und Montageanleitung')
    canvas.drawRightString(190 * mm, 12 * mm, f'Seite {doc.page}')
    canvas.restoreState()


story = [
    P('Musik-Box mit Karten', 'title'),
    P('Bau- und Montageanleitung: Teile, 3D-Druck, Verkabelung, Zusammenbau, Software', 'sub'),
    Spacer(1, 8),
    box('Karte mit NFC-Aufkleber in den Schlitz stecken → die Playlist läuft über FamilyConnect auf dem Lautsprecher. '
        'Karte heraus = Pause, wieder hinein = weiter. Drehknopf = Lautstärke (drücken = Pause/Weiter), '
        'zwei Tasten = Titel zurück/vor.'),
    Spacer(1, 6),
    img('explosion.png', 78, 'Explosionsansicht: Karte, Gehäuse mit Kartenschacht, RC522, Drehgeber und Tastern – darunter der Boden mit dem ESP32'),

    P('1. Teileliste', 'h1'),
    table([
        ['Teil', 'Menge', 'Hinweis'],
        ['ESP32-S3-DevKitC-1 (Nachbau mit 2 × USB-C)', '1', 'Platine 56,7 × 28,2 mm, Antenne steht vorne über – darauf ist der Boden abgestimmt'],
        ['RFID-Leser RC522 (13,56 MHz)', '1', 'mit Stiftleiste (gerade)'],
        ['Drehgeber-Modul auf runder Platine (Ø 23,5 mm)', '1', '5 Pins: 5V, KEY, S2, S1, GND; Welle rund, geriffelt Ø 5,9 mm; mit Mutter'],
        ['Taster 12 × 12 mm (z. B. Omron B3F)', '2', '4 Beinchen'],
        ['Dupont-Kabel Buchse–Buchse, 20 cm', '16', 'am besten in verschiedenen Farben'],
        ['Kurze Litze (für die Taster)', '–', 'oder Dupont-Kabel direkt auf die Taster-Beinchen löten'],
        ['Schrauben M3 × 10 (oder Blechschrauben 2,9 × 9,5)', '4', 'für den Boden'],
        ['USB-C-Netzteil 5 V, mind. 1 A, mit Kabel', '1', ''],
        ['NFC-Aufkleber NTAG213/215, rund Ø 25 mm', '1 pro Karte', 'NTAG – nicht MIFARE Classic'],
        ['Heißkleber, doppelseitiges Klebeband', '–', 'für Taster und RC522'],
    ], [62, 18, 90]),
    P('Werkzeug: Lötkolben und Lötzinn (Taster, ggf. Stiftleiste am RC522), Seitenschneider, Zange (Mutter am Drehgeber), '
      'Kreuzschraubendreher, Heißklebepistole.'),

    P('2. 3D-Druck', 'h1'),
    P('Alle Dateien liegen in <b>hardware/musikbox/3d/</b> und sind schon richtig ausgerichtet. PLA, 0,2 mm Schicht, ohne Stützen.'),
    table([
        ['Datei', 'Menge', 'Hinweis'],
        ['gehaeuse.stl (oder gehaeuse_schlicht.stl)', '1', 'kopfüber, 3 Wände, 15 % Füllung'],
        ['boden.stl', '1', 'flach – mit Halter für das ESP32-Board'],
        ['tastenkappe.stl', '2', 'sichtbare Seite nach unten'],
        ['knopf_test.stl → drehknopf.stl', '1', 'erst den Probering testen (sitzt stramm = richtig), dann den Knopf drucken'],
        ['karte_vorne.stl + karte_hinten.stl', 'je 1 pro Karte', '0,12–0,16 mm Schicht für glatte Flächen'],
    ], [62, 22, 86]),

    P('3. Vorher: einmal auf dem Tisch testen', 'h1'),
    box('<b>Tipp:</b> Erst alles <b>offen auf dem Tisch</b> zusammenstecken, Software aufspielen (Kapitel 6) und testen – '
        'Karte an den RC522 halten, drehen, drücken, beide Tasten. Wenn alles geht, die Kabel an den Bauteilen lassen und '
        'erst dann einbauen. Fehler findet man so viel leichter als im fertigen Gehäuse.'),
    P('4. Verkabelung', 'h1'),
    box('<b>Achtung 3,3 V:</b> RC522 <b>und</b> Drehgeber-Modul kommen an <b>3V3</b> – auch der Pin, der am Drehgeber „5V“ heißt. '
        'Der ESP32 verträgt an seinen Eingängen keine 5 V. Den Pin <b>5Vin</b> nicht benutzen.', WARN, colors.HexColor('#d62828')),
    Spacer(1, 6),
    KeepTogether([pinout(), P('Pinbelegung deines Boards, wie aufgedruckt. Alle Signale liegen auf der rechten Pinreihe; die GND-Leitungen auf beide '
      'Seiten verteilen (das Board hat 4 GND-Pins). Achtung: <b>„RST“ auf dem ESP32 ist nicht GPIO 9</b> – der RST-Pin des '
      'ESP32 bleibt frei.', 'cap')]),
    table([
        ['Bauteil', 'Pin am Bauteil', 'Pin am ESP32', 'Farbe im Plan'],
        ['RC522', '3.3V', '3V3', 'rot'],
        ['RC522', 'GND', 'GND (rechts oben)', 'schwarz'],
        ['RC522', 'RST', 'GPIO 9', 'lila'],
        ['RC522', 'SDA (SS)', 'GPIO 10', 'orange'],
        ['RC522', 'MOSI', 'GPIO 11', 'blau'],
        ['RC522', 'SCK', 'GPIO 12', 'grün'],
        ['RC522', 'MISO', 'GPIO 13', 'gelb'],
        ['RC522', 'IRQ', '– frei lassen', ''],
        ['Drehgeber-Modul', '„5V“', '<b>3V3</b> (der zweite 3V3-Pin)', 'rot'],
        ['Drehgeber-Modul', 'GND', 'GND (links oben)', 'schwarz'],
        ['Drehgeber-Modul', 'S1', 'GPIO 4', 'pink'],
        ['Drehgeber-Modul', 'S2', 'GPIO 5', 'türkis'],
        ['Drehgeber-Modul', 'KEY', 'GPIO 6', 'violett'],
        ['Taste zurück (<<)', 'Bein 1 / Bein 2 (diagonal)', 'GPIO 15 / GND (links oben)', 'braun / schwarz'],
        ['Taste vor (>>)', 'Bein 1 / Bein 2 (diagonal)', 'GPIO 16 / GND (links unten)', 'hellgrün / schwarz'],
    ], [38, 42, 52, 38]),
    Spacer(1, 6),
    KeepTogether([P('Gut zu wissen', 'h2'), P('• <b>Taster</b> (4 Beinchen): Je zwei Beinchen sind innen verbunden. Nimm zwei <b>diagonal gegenüberliegende</b> – dann passt es immer. '
      'An jedes der beiden ein Stück Litze oder ein abgeschnittenes Dupont-Kabel löten (Buchse am anderen Ende behalten).')]),
    P('• <b>Drehgeber-Modul:</b> Die Beschriftung auf der Platine lautet von links: 5V, KEY, S2, S1, GND. Widerstände sind schon '
      'drauf. Ist lauter/leiser vertauscht: beim Einrichten „Drehknopf andersherum“ wählen – oder S1 und S2 tauschen.'),
    P('• <b>RC522:</b> Die Stiftleiste wird so eingelötet, dass die Pins auf der Bauteilseite herauskommen (die flache Rückseite liegt '
      'später an der Wand des Kartenschachts).'),
    P('• Weitere Widerstände brauchst du nicht – die Software schaltet die inneren Pull-ups des ESP32 ein.'),
    P('• Strom kommt über eine der beiden USB-C-Buchsen; zum Aufspielen der Software die mit „COM“ bzw. „UART“ nehmen.'),

    P('5. Montage', 'h1'),
    P('Das Gehäuse ist unten offen; der Boden mit dem ESP32 wird zum Schluss von unten eingeschraubt. Leg das Gehäuse dazu '
      '<b>kopfüber</b> (Kartenschlitz nach unten) auf ein Tuch.'),
    P('5.1 Drehgeber einbauen', 'h2'),
    steps([
        'Mutter (und ggf. Unterlegscheibe) vom Gewinde des Drehgebers abschrauben.',
        'Den Drehgeber <b>von innen</b> durch das mittlere Loch in der Front stecken – die <b>Lötpins zeigen nach unten</b> zum '
        'Boden. So laufen die Kabel später unter dem ESP32 durch und stoßen nicht dagegen.',
        'Von außen die Mutter mit der Zange festziehen. Sitzt die kleine Metallnase am Gewinde nicht in der Kerbe, die Nase '
        'mit der Zange abbiegen – die Mutter hält den Drehgeber allein.',
        'Den Drehknopf erst ganz zum Schluss aufdrücken (5.6).',
    ]),
    img('innen.png', 100, 'Blick von hinten auf die Front (Gehäuse aufgeschnitten): oben der RC522 hinter dem Kartenschacht, '
        'unten links/rechts die Taster in ihren Haltern, in der Mitte das Drehgeber-Modul mit den Pins nach unten'),
    P('5.2 Taster einbauen', 'h2'),
    steps([
        'Die beiden Tastenkappen <b>von innen</b> durch die äußeren Löcher stecken – der breite Rand bleibt innen.',
        'Die Taster (mit angelöteten Kabeln) von hinten in die beiden Halter drücken, der Stößel zeigt nach vorn zur Kappe. '
        'Links („<<“, von vorn gesehen) = <b>zurück</b> an GPIO 15, rechts („>>“) = <b>vor</b> an GPIO 16.',
        'Ausprobieren: Kappe drücken → Taster muss klicken. Klickt er nicht, ein Stück Klebeband zwischen Kappe und Taster legen.',
        'Taster mit einem Tropfen Heißkleber im Halter sichern.',
    ]),
    P('5.3 RC522 einsetzen', 'h2'),
    steps([
        'Die RC522-Platine mit der <b>flachen Rückseite zur Wand des Kartenschachts</b> unten in die Nut stellen – die Pins zeigen '
        'nach hinten ins Gehäuse. Seitlich halten zwei Anschläge die Platine.',
        'Oben mit einem Streifen doppelseitigem Klebeband an der Schachtwand fixieren. Je näher der Leser an der Karte, desto besser.',
        'Die sieben Kabel des RC522 schon jetzt aufstecken (IRQ bleibt frei).',
    ]),
    KeepTogether([P('5.4 ESP32 auf den Boden', 'h2'), img('boden.png', 105, 'Das Board liegt auf zwei Säulen zwischen den Pinreihen, vier Eckpfosten halten es seitlich; '
        'links ein Anschlag neben der Antenne, rechts die USB-Buchsen')]),
    steps([
        'Zuerst alle Kabel auf die Pins des ESP32 stecken (siehe Plan) – im eingebauten Zustand kommt man schlecht heran.',
        'Das Board von oben zwischen die vier Pfosten auf die beiden Säulen legen: <b>Bauteile oben, USB-Buchsen zur Seite ohne Anschlag</b>. '
        'Die Antenne liegt zwischen den beiden Teilen des Anschlags.',
        'Es soll ohne Druck hineinpassen. Ein Tropfen Heißkleber auf einer Säule hält es zusätzlich (optional).',
    ]),
    P('5.5 Verbinden und Boden einsetzen', 'h2'),
    steps([
        'Den Boden neben das kopfüber liegende Gehäuse legen und die Kabel von Drehgeber, Tastern und RC522 mit den passenden '
        'Kabeln vom ESP32 verbinden (oder die Kabel direkt auf die Pins stecken, wenn du sie erst am ESP32 aufsteckst).',
        'Kabel ordnen: Die Kabel vom Drehgeber nach unten am Boden entlang führen, die vom RC522 seitlich an der Gehäusewand. '
        'Nichts darf auf dem Kartenschacht liegen.',
        'Den Boden einsetzen – <b>so drehen, dass die USB-Buchsen genau vor der Öffnung in der Seitenwand liegen</b>. '
        'Noch nicht schrauben: erst ein USB-Kabel einstecken und testen (Kapitel 6).',
        'Funktioniert alles: Boden mit den 4 Schrauben festschrauben – nur leicht anziehen, die Dome sind aus Kunststoff.',
    ]),
    P('5.6 Fertig machen', 'h2'),
    steps([
        'Den Drehknopf gerade auf die Welle drücken, bis er kurz vor der Front steht (nicht schleifen lassen).',
        'USB-C-Netzteil einstecken – die LED leuchtet durch den Schlitz über der Buchse.',
        'Karte einstecken – fertig.',
    ]),
    PageBreak(),

    P('6. Software aufspielen und einrichten – direkt im Browser', 'h1'),
    P('Dafür brauchst du nichts zu installieren: einen <b>PC oder Laptop mit Chrome oder Edge</b> (Firefox, Safari und die '
      'Handy-App können nicht per USB mit dem ESP32 sprechen).'),
    steps([
        'In FamilyConnect <b>Musik</b> öffnen (Spotify muss verbunden sein), unten bei <b>Musik-Box</b> einen Namen eingeben '
        '(z. B. „Kinderzimmer“) → <b>Code erstellen</b>.',
        'Bei der Box auf <b>„Per USB einrichten“</b> tippen. Am Handy zeigt die App die Adresse, die du am PC öffnest.',
        'ESP32 per USB-C an den PC: Buchse <b>„COM“/„UART“</b> (unbeschriftet: erst eine probieren, sonst die andere). '
        '→ <b>ESP32 auswählen</b> und im Fenster den USB-Eintrag wählen.',
        '<b>Firmware aufspielen</b> – dauert etwa eine Minute. Klappt es nicht: BOOT-Taste am ESP32 gedrückt halten, kurz RESET '
        'drücken, BOOT loslassen, nochmal.',
        'WLAN-Name (2,4 GHz) und Passwort eintragen → <b>Auf die Box übertragen</b>. Server-Adresse und Box-Code kommen automatisch '
        'dazu. Das Passwort geht nur über das Kabel an die Box.',
        'Die Seite zeigt danach, ob die Box im WLAN ist und ob der Kartenleser gefunden wurde. Unter „Protokoll der Box“ steht, was '
        'die Box meldet.',
    ]),
    P('7. In FamilyConnect einstellen', 'h1'),
    steps([
        'Lautsprecher unter Musik → „Lautsprecher: … ändern“ festlegen – sonst spielt es auf dem zuletzt aktiven Gerät.',
        'LED-Farbe falsch oder Drehknopf andersherum? Auf der Einrichtungsseite „LED am ESP32“ bzw. „Drehknopf andersherum“ '
        'ändern und nochmal übertragen.',
    ]),
    P('Lieber selbst bauen? Mit PlatformIO den Ordner hardware/musikbox/firmware öffnen und hochladen; die Startwerte können '
      'weiter in include/config.h stehen (Vorlage config.example.h), WLAN und Code lassen sich aber auch danach im Browser setzen.'),
    P('Karten bauen', 'h2'),
    img('karte.png', 95, 'Vorderseite (für das Cover) und Rückseite mit Vertiefung für den NFC-Aufkleber – 64 × 64 × 2 mm'),
    steps([
        'In der App unter <b>Musik → + Karte</b> die Playlist anlegen, dann „Auf NFC-Aufkleber schreiben“ und das Handy an den Aufkleber halten.',
        'Aufkleber in die runde Vertiefung von karte_hinten kleben, beide Hälften mit dünnem doppelseitigem Klebeband zusammenkleben.',
        'Cover: Musik → „Cover für die Karten ausdrucken“, in Originalgröße (100 %) drucken, ausschneiden, aufkleben.',
    ]),
    PageBreak(),

    P('8. Bedienung und LED', 'h1'),
    table([
        ['Aktion', 'Was passiert'],
        ['Karte einstecken', 'Playlist startet; gleiche Karte innerhalb von 30 Minuten wieder rein → spielt an der Stelle weiter'],
        ['Karte herausziehen', 'Pause (abschaltbar mit PAUSE_ON_REMOVE 0)'],
        ['Drehknopf drehen / drücken', 'lauter/leiser (5 % pro Raste) / Pause–Weiter'],
        ['Taste << / >>', 'Titel zurück / vor'],
    ], [55, 115]),
    Spacer(1, 6),
    table([
        ['LED (durch den Schlitz über der USB-Buchse)', 'Bedeutung'],
        ['gelb blinkend', 'verbindet sich mit dem WLAN'],
        ['türkis kurz', 'bereit'],
        ['blau', 'sendet an den Server'],
        ['grün kurz', 'hat geklappt'],
        ['rot', 'Fehler – z. B. Lautsprecher nicht erreichbar oder kein WLAN'],
        ['lila', 'Karte ohne FamilyConnect-Aufkleber – in der App beschreiben'],
    ], [70, 100]),
    P('9. Fehlersuche', 'h1'),
    table([
        ['Problem', 'Lösung'],
        ['„RC522 … nicht gefunden?“ im Monitor', 'Kabel prüfen: SDA = 10, SCK = 12, MOSI = 11, MISO = 13, RST = 9 (nicht der RST-Pin des ESP32!), 3,3 V'],
        ['Drehen tut nichts', 'S1/S2 an GPIO 4/5? „5V“-Pin des Moduls an 3V3, GND verbunden?'],
        ['Lauter/leiser vertauscht', 'auf der Einrichtungsseite „Drehknopf andersherum“ – oder S1 und S2 tauschen'],
        ['Taste reagiert nicht', 'diagonale Beinchen verwenden; Kappe drückt nicht → Klebeband unterlegen'],
        ['Karte wird nicht erkannt', 'NTAG-Aufkleber verwenden, mittig aufkleben; RC522 flach an der Schachtwand'],
        ['LED bleibt aus', 'auf der Einrichtungsseite „LED am ESP32: GPIO 38“ wählen und übertragen'],
        ['Box verbindet sich nicht', 'WLAN muss 2,4 GHz sein; auf der Einrichtungsseite Name/Passwort nochmal übertragen'],
        ['„Die Box antwortet nicht“ beim Übertragen', 'andere USB-Buchse (COM/UART) nehmen; Firmware zuerst aufspielen'],
        ['LED rot nach dem Einstecken', 'Lautsprecher schläft: einmal in der Spotify-App darauf abspielen, Karte neu einstecken'],
        ['Board sitzt zu stramm / wackelt im Boden', 'in musikbox.scad esp_pcb anpassen (gemessen: 56,7 × 28,2 mm), Boden neu drucken'],
        ['Knopf zu stramm / locker', 'in musikbox.scad welle_klemm kleiner (0.1) / größer (0.3)'],
        ['Karte klemmt / zu locker', 'in musikbox.scad slot_clear anpassen (Standard 0,8 mm Luft)'],
    ], [55, 115]),
    Spacer(1, 6),
    box('Sicherheit: Der Box-Code erlaubt nur Musik-Befehle für eure Familie. Geht die Box verloren, den Code in der App unter Musik-Box entfernen.'),
]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
                        title='Musik-Box – Bau- und Montageanleitung', author='FamilyConnect')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('geschrieben:', OUT)

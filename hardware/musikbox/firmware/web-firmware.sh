#!/bin/sh
# Baut die Firmware und legt sie als eine Datei für das Aufspielen im Browser ab
# (App → Musik → Musik-Box → „Per USB einrichten“ lädt client/public/firmware/musikbox/musikbox.bin).
# Ohne include/config.h bauen – die Einstellungen kommen später per USB aus der App.
set -e
cd "$(dirname "$0")"
pio run
OUT=../../../client/public/firmware/musikbox
mkdir -p "$OUT"
BOOT_APP0=$(find ~/.platformio/packages/framework-arduinoespressif32 -name boot_app0.bin | head -1)
python3 ~/.platformio/packages/tool-esptoolpy/esptool.py --chip esp32s3 merge_bin -o "$OUT/musikbox.bin" \
  --flash_mode dio --flash_freq 80m --flash_size keep \
  0x0 .pio/build/musikbox/bootloader.bin 0x8000 .pio/build/musikbox/partitions.bin \
  0xe000 "$BOOT_APP0" 0x10000 .pio/build/musikbox/firmware.bin
VERSION=$(sed -n 's/#define FIRMWARE_VERSION "\(.*\)"/\1/p' src/main.cpp)
printf '{ "version": "%s", "file": "musikbox.bin" }\n' "$VERSION" > "$OUT/version.json"
echo "fertig: $OUT/musikbox.bin (Version $VERSION)"

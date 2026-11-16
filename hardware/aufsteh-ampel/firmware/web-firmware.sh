#!/bin/sh
# Baut die Firmware für den ESP32-C3 SuperMini und legt sie als eine Datei für das Aufspielen im Browser ab
# (App → Familie & Profil → Geräte → Schlaflicht → „Im Browser aufspielen“ lädt
#  client/public/firmware/aufsteh-ampel/ampel-c3.bin).
set -e
cd "$(dirname "$0")"
pio run -e c3
OUT=../../../client/public/firmware/aufsteh-ampel
mkdir -p "$OUT"
BOOT_APP0=$(find ~/.platformio/packages/framework-arduinoespressif32 -name boot_app0.bin | head -1)
python3 ~/.platformio/packages/tool-esptoolpy/esptool.py --chip esp32c3 merge_bin -o "$OUT/ampel-c3.bin" \
  --flash_mode dio --flash_freq 80m --flash_size keep \
  0x0 .pio/build/c3/bootloader.bin 0x8000 .pio/build/c3/partitions.bin \
  0xe000 "$BOOT_APP0" 0x10000 .pio/build/c3/firmware.bin
echo "fertig: $OUT/ampel-c3.bin"

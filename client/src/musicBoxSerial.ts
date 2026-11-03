// Musik-Box per USB: Firmware aufspielen (esptool-js) und Einstellungen übertragen (Zeilen „fc:…“, siehe
// hardware/musikbox/firmware/src/main.cpp). Läuft nur in Chrome/Edge am PC (Web Serial).

export const FIRMWARE_URL = '/firmware/musikbox/musikbox.bin';
export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;

export interface BoxStatus {
  version: string;
  ssid: string;
  pass: boolean;
  server: string;
  code: string;
  led: number;
  invert: number;
  wifi: boolean;
  ip: string;
  rc522: boolean;
}

/** Firmware-Datei als „binary string“ (so erwartet esptool-js die Daten) */
async function firmwareData() {
  const res = await fetch(FIRMWARE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Firmware nicht gefunden – Server aktualisieren');
  const bytes = new Uint8Array(await res.arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

/** Spielt die Firmware auf; der ESP32 startet danach neu. Der Port ist danach wieder geschlossen. */
export async function flashFirmware(port: SerialPort, log: (line: string) => void, progress: (share: number) => void) {
  const [{ ESPLoader, Transport }, data] = await Promise.all([import('esptool-js'), firmwareData()]);
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 460800,
    romBaudrate: 115200,
    terminal: { clean() {}, writeLine: (l: string) => log(l), write: (t: string) => t.trim() && log(t.trim()) },
  });
  try {
    const chip = await loader.main();
    log(`Verbunden mit ${chip}`);
    await loader.writeFlash({
      fileArray: [{ data, address: 0 }],
      flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
      eraseAll: false, compress: true,
      reportProgress: (_i, written, total) => progress(written / total),
    });
    await loader.after('hard_reset');
  } finally {
    await transport.disconnect().catch(() => undefined);
  }
}

/** Textverbindung zur laufenden Firmware */
export class BoxConsole {
  #port: SerialPort;
  #reader?: ReadableStreamDefaultReader<string>;
  #closed?: Promise<void>;
  #waiters: { test: (line: string) => boolean; resolve: (line: string) => void }[] = [];
  #buffer = '';
  onLine: (line: string) => void = () => {};

  constructor(port: SerialPort) {
    this.#port = port;
  }

  async open() {
    // Ohne Reset öffnen: An der eingebauten USB-Buchse würde ein Neustart die Verbindung trennen
    await this.#port.open({ baudRate: 115200 });
    const decoder = new TextDecoderStream();
    this.#closed = this.#port.readable!.pipeTo(decoder.writable as WritableStream<Uint8Array>).catch(() => undefined);
    this.#reader = decoder.readable.getReader();
    void this.#read();
  }

  async #read() {
    for (;;) {
      const { value, done } = await this.#reader!.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      this.#buffer += value;
      let i;
      while ((i = this.#buffer.search(/\r?\n/)) >= 0) {
        const line = this.#buffer.slice(0, i);
        this.#buffer = this.#buffer.slice(this.#buffer[i] === '\r' ? i + 2 : i + 1);
        if (!line) continue;
        this.onLine(line);
        this.#waiters = this.#waiters.filter((w) => (w.test(line) ? (w.resolve(line), false) : true));
      }
    }
  }

  async send(line: string) {
    const writer = this.#port.writable!.getWriter();
    await writer.write(new TextEncoder().encode(`${line}\n`));
    writer.releaseLock();
  }

  /** Wartet auf eine Zeile, die passt (oder null nach `ms`) */
  wait(test: (line: string) => boolean, ms: number): Promise<string | null> {
    return new Promise((resolve) => {
      const waiter = { test, resolve: (l: string) => resolve(l) };
      this.#waiters.push(waiter);
      setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w !== waiter);
        resolve(null);
      }, ms);
    });
  }

  /** Fragt den Zustand ab, bis die Box antwortet (nach einem Neustart dauert das 1–2 s) */
  async status(totalMs = 10_000): Promise<BoxStatus | null> {
    const until = Date.now() + totalMs;
    while (Date.now() < until) {
      // erst auf die Antwort warten, dann fragen – sonst kann eine schnelle Antwort verloren gehen
      const answer = this.wait((l) => l.startsWith('fc:status '), 900);
      await this.send('fc:status');
      const line = await answer;
      if (line) return JSON.parse(line.slice('fc:status '.length)) as BoxStatus;
    }
    return null;
  }

  async set(key: string, value: string) {
    if (/[\r\n]/.test(value)) throw new Error('Zeilenumbruch nicht erlaubt');
    const waiting = this.wait((l) => l === `fc:ok ${key}` || l.startsWith('fc:err'), 3000);
    await this.send(`fc:set ${key}=${value}`);
    const answer = await waiting;
    if (answer !== `fc:ok ${key}`) throw new Error(`Die Box hat „${key}“ nicht übernommen`);
  }

  async close() {
    await this.#reader?.cancel().catch(() => undefined);
    await this.#closed;
    await this.#port.close().catch(() => undefined);
  }
}

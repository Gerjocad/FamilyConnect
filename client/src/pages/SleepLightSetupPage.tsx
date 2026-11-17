import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { getServerUrl, isNativeApp } from '../api';
import { BoxConsole, flashFirmware, serialSupported } from '../musicBoxSerial';
import { useWakeLights } from '../wakeLight';

const FIRMWARE = '/firmware/aufsteh-ampel/ampel-c3.bin';

interface LightStatus { version: string; ssid: string; wifi: boolean; ip: string; plan: boolean; phase: string }

/** Schlaflicht (Aufsteh-Ampel) mit ESP32-C3 SuperMini: Firmware im Browser aufspielen, WLAN und Gerätecode übertragen */
export function SleepLightSetupPage() {
  const { id } = useParams();
  const { lights } = useWakeLights();
  const light = lights?.find((l) => l.id === Number(id)) ?? null;
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<LightStatus | null | 'none'>(null);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const server = getServerUrl() || location.origin;
  const addLog = (line: string) => setLog((l) => [...l.slice(-200), line]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);
  useEffect(() => () => void stopListening(), []);

  const consoleRef = useRef<BoxConsole | null>(null);
  async function stopListening() {
    await consoleRef.current?.close();
    consoleRef.current = null;
    try {
      await reader.current?.cancel();
    } catch { /* egal */ }
    reader.current = null;
    try {
      await port?.close();
    } catch { /* schon zu */ }
    setListening(false);
  }

  const choose = async () => {
    setError(null);
    await stopListening();
    try {
      setPort(await navigator.serial.requestPort());
    } catch {
      /* abgebrochen */
    }
  };

  const flash = async () => {
    if (!port) return;
    setError(null);
    await stopListening();
    setFlashing(true);
    setDone(false);
    setProgress(0);
    try {
      await flashFirmware(port, addLog, setProgress, FIRMWARE);
      addLog('Fertig – das Schlaflicht startet neu und zeigt Mond, Sonnenaufgang und Sonne.');
      setDone(true);
    } catch (e) {
      setError(`Aufspielen hat nicht geklappt (${(e as Error).message}). Tipp: BOOT-Taste am ESP32 gedrückt halten, kurz RESET drücken, BOOT loslassen, dann „ESP32 auswählen“ und nochmal aufspielen.`);
    } finally {
      setFlashing(false);
    }
  };

  // WLAN, Server und Gerätecode per USB an das Licht (das WLAN-Passwort geht nur über das Kabel)
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!port || !light) return;
    void (async () => {
      setError(null);
      setSending(true);
      setResult(null);
      await stopListening();
      try {
        const con = new BoxConsole(port);
        con.onLine = addLog;
        con.onNote = addLog;
        await con.open();
        consoleRef.current = con;
        if (!(await con.status(8000, false))) throw new Error('Das Licht antwortet nicht. USB-Kabel kurz aus- und wieder einstecken, „anderen Anschluss wählen“ und nochmal versuchen – oder zuerst die Firmware aufspielen.');
        await con.set('ssid', ssid.trim());
        if (pass) await con.set('pass', pass);
        await con.set('server', server);
        await con.set('code', light.token);
        await con.send('fc:connect');
        addLog('Übertragen – das Licht verbindet sich mit dem WLAN …');
        let s: LightStatus | null = null;
        for (let i = 0; i < 10 && !(s?.wifi && s.plan); i++) {
          await new Promise((r) => setTimeout(r, 2500));
          s = (await con.status(4000, false)) as unknown as LightStatus | null;
        }
        setResult(s ?? 'none');
        setPass('');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        await stopListening();
        setSending(false);
      }
    })();
  };

  // Ausgaben des ESP32 anzeigen („🌙 Mond“, „🌅 Sonnenaufgang“ …)
  const listen = async () => {
    if (!port) return;
    setError(null);
    try {
      await port.open({ baudRate: 115200 });
    } catch {
      setError('Der ESP32 ist gerade nicht erreichbar – nach dem Aufspielen meldet er sich neu an. Bitte nochmal „ESP32 auswählen“.');
      return;
    }
    setListening(true);
    const decoder = new TextDecoder();
    let buffer = '';
    reader.current = port.readable!.getReader();
    try {
      for (;;) {
        const { value, done: end } = await reader.current.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) addLog(line.trim());
      }
    } catch { /* Verbindung beendet */ } finally {
      reader.current?.releaseLock();
      reader.current = null;
      try {
        await port.close();
      } catch { /* egal */ }
      setListening(false);
    }
  };

  if (!serialSupported() || isNativeApp) {
    const url = `${server}/schlaflicht${id ? `/${id}/einrichten` : '/einrichten'}`;
    return (
      <div className="page narrow">
        <header className="page-header"><h1>Schlaflicht aufspielen</h1></header>
        <section className="card">
          <p>Das Aufspielen klappt am <b>PC oder Laptop in Chrome oder Edge</b> – nur dort kann der Browser über USB mit dem ESP32 sprechen.</p>
          <p>Öffne am PC diese Adresse und melde dich an:</p>
          <p><code className="wall-code">{url}</code></p>
          <button type="button" className="button" onClick={() => void navigator.clipboard?.writeText(url)}>Adresse kopieren</button>
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow box-setup" data-no-reload>
      <header className="page-header">
        <h1>🌙 Schlaflicht einrichten{light && `: ${light.name}`}</h1>
        <Link to="/schlaflicht" className="link-button">Zurück</Link>
      </header>

      <section className="card">
        <h2>1. Matrix anschließen</h2>
        <table className="plain-table">
          <thead><tr><th>Matrix</th><th>ESP32-C3 SuperMini</th></tr></thead>
          <tbody>
            <tr><td><b>V+</b> (oder 5V/VCC)</td><td><b>5V</b></td></tr>
            <tr><td><b>V-</b> (oder GND)</td><td><b>GND</b> (G)</td></tr>
            <tr><td><b>IN</b> (oder DIN – die Seite mit IN, nicht OUT)</td><td><b>4</b> (GPIO 4)</td></tr>
          </tbody>
        </table>
        <p className="hint">Die Beschriftung steht neben den Lötpunkten am Rand des ESP32. Zum ersten Ausprobieren reichen Steckkabel; Widerstand und Elko sind optional.</p>
      </section>

      <section className="card">
        <h2>2. Per USB verbinden</h2>
        <p className="muted">USB-C-Kabel in den ESP32 stecken und mit dem PC verbinden. Dann:</p>
        <button type="button" className="button primary" disabled={flashing} onClick={() => void choose()}>
          {port ? '✓ Verbunden – anderen Anschluss wählen' : 'ESP32 auswählen'}
        </button>
        <p className="hint">Im Fenster des Browsers den Eintrag mit „USB JTAG/serial“ wählen. Erscheint nichts: anderes Kabel probieren (manche können nur laden), oder BOOT gedrückt halten und das Kabel einstecken.</p>
      </section>

      <section className="card">
        <h2>3. Firmware aufspielen</h2>
        <p className="muted">Dauert ca. 30 Sekunden. Danach zeigt die Matrix zur Probe im Wechsel 🌙 roten Mond, 🌅 Sonnenaufgang und ☀️ Sonne – bis WLAN und Code übertragen sind. Schon eingerichtete Einstellungen bleiben erhalten.</p>
        <button type="button" className="button primary" disabled={!port || flashing} onClick={() => void flash()}>
          {flashing ? `Spiele auf … ${Math.round(progress * 100)} %` : 'Firmware aufspielen'}
        </button>
        {flashing && <div className="flash-progress"><span style={{ width: `${progress * 100}%` }} /></div>}
        {done && <p className="success">✓ Firmware ist drauf.</p>}
      </section>

      {light ? (
        <form className="card form" onSubmit={send}>
          <h2>4. WLAN und Gerätecode übertragen</h2>
          <p className="muted">Die Daten gehen nur über das USB-Kabel an das Licht – das Passwort wird nirgends gespeichert oder an den Server geschickt.</p>
          <label>WLAN-Name (2,4 GHz)<input value={ssid} onChange={(e) => setSsid(e.target.value)} required maxLength={32} autoComplete="off" /></label>
          <label>WLAN-Passwort<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} maxLength={64} autoComplete="new-password" /></label>
          <p className="hint">Server: <code>{server}</code> · Gerätecode: <code>{light.token}</code> (kommen automatisch dazu)</p>
          <div className="form-actions">
            <span className="spacer" />
            <button className="button primary" disabled={!port || sending || flashing || !ssid.trim()}>{sending ? 'Übertrage …' : 'Auf das Licht übertragen'}</button>
          </div>
          {result && result !== 'none' && (
            <div className={`setup-result ${result.wifi && result.plan ? 'ok' : 'warn'}`}>
              <p>{result.wifi ? `✓ Mit „${result.ssid}“ verbunden` : `✗ WLAN „${result.ssid}“ nicht erreicht – Name/Passwort prüfen (nur 2,4 GHz)`}</p>
              {result.wifi && <p>{result.plan ? '✓ Zeiten vom Server geladen – das Licht läuft jetzt nach Plan.' : '✗ Server noch nicht erreicht – Protokoll ansehen.'}</p>}
            </div>
          )}
          {result === 'none' && <p className="error">Das Licht hat nicht geantwortet – im Protokoll nachsehen.</p>}
        </form>
      ) : (
        <section className="card">
          <h2>4. Mit der App verbinden</h2>
          <p className="muted">Damit das Licht die Zeiten aus der App bekommt: unter <Link to="/schlaflicht">Schlaflicht</Link> ein Licht anlegen und dort „Per USB einrichten“ wählen.</p>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <details className="card" open={log.length > 0}>
        <summary>Protokoll</summary>
        <pre ref={logRef} className="serial-log">{log.join('\n') || 'Noch nichts.'}</pre>
        {port && !flashing && (
          listening
            ? <button type="button" className="button small" onClick={() => void stopListening()}>Mitlesen beenden</button>
            : <button type="button" className="button small" onClick={() => void listen()}>Ausgaben des ESP32 mitlesen</button>
        )}
      </details>

      <section className="card">
        <h2>Bild falsch?</h2>
        <ul className="plain-list">
          <li>Nichts leuchtet: DIN statt DOUT? 5V wirklich an 5V? GND verbunden?</li>
          <li>Bild zerstückelt, gespiegelt oder auf dem Kopf: kurz Bescheid sagen – dann stelle ich die Firmware um.</li>
        </ul>
      </section>
    </div>
  );
}

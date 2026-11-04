import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { api, getServerUrl, isNativeApp } from '../api';
import { BoxConsole, flashFirmware, serialSupported, type BoxStatus } from '../musicBoxSerial';
import { useFamily } from '../session';

interface MusicBox { id: number; name: string; token: string }
type Step = 'idle' | 'flashing' | 'flashed' | 'sending' | 'done';

/** Fängt Abstürze der Seite ab und zeigt den Fehler, statt eine leere Seite zu hinterlassen */
class SetupErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page narrow">
        <section className="card">
          <h2>Da ist etwas schiefgegangen</h2>
          <p className="error">{this.state.error.message}</p>
          <pre className="serial-log">{this.state.error.stack}</pre>
          <button type="button" className="button" onClick={() => location.reload()}>Seite neu laden</button>
        </section>
      </div>
    );
  }
}

/** Musik-Box per USB: Firmware aufspielen und WLAN, Server und Box-Code übertragen (Chrome/Edge am PC) */
export function MusicBoxSetupPage() {
  return <SetupErrorBoundary><MusicBoxSetup /></SetupErrorBoundary>;
}

function MusicBoxSetup() {
  const { id } = useParams();
  const { family } = useFamily();
  const [box, setBox] = useState<MusicBox | null>(null);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState(0);
  const [flashed, setFlashed] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BoxStatus | null>(null);
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [ledPin, setLedPin] = useState('48');
  const [invert, setInvert] = useState(false);
  const consoleRef = useRef<BoxConsole | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const server = getServerUrl() || location.origin;
  const busy = step === 'flashing' || step === 'sending';

  useEffect(() => {
    void api<MusicBox[]>(`/families/${family.id}/music-boxes`).then((list) => setBox(list.find((b) => b.id === Number(id)) ?? null), (e: Error) => setError(e.message));
  }, [family.id, id]);
  useEffect(() => () => void consoleRef.current?.close(), []);
  // Klammern nötig: neuere Browser geben bei scrollTo ein Promise zurück – React hielte das für eine Aufräumfunktion
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);
  useEffect(() => {
    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const reason = 'reason' in e ? e.reason : e.error ?? e.message;
      setLog((l) => [...l, `Fehler: ${reason instanceof Error ? reason.message : String(reason)}`]);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, []);

  const addLog = (line: string) => setLog((l) => [...l.slice(-300), line]);
  const attempt = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const choosePort = () => attempt(async () => {
    await consoleRef.current?.close();
    consoleRef.current = null;
    setPort(await navigator.serial.requestPort());
  });

  const flash = () => attempt(async () => {
    await consoleRef.current?.close();
    consoleRef.current = null;
    setStep('flashing');
    setProgress(0);
    try {
      await flashFirmware(port!, addLog, setProgress);
      addLog('Firmware aufgespielt – die Box startet neu.');
      setFlashed(true);
      setStep('flashed');
    } catch (e) {
      setStep('idle');
      throw new Error(`Aufspielen hat nicht geklappt (${(e as Error).message}). Tipp: BOOT-Taste am ESP32 gedrückt halten, kurz RESET drücken, BOOT loslassen und nochmal versuchen – oder die andere USB-Buchse nehmen.`);
    }
  });

  const send = (e: FormEvent) => {
    e.preventDefault();
    void attempt(async () => {
      setStep('sending');
      try {
        let con = consoleRef.current;
        if (!con) {
          con = new BoxConsole(port!);
          con.onLine = addLog;
          con.onNote = addLog;
          await con.open();
          consoleRef.current = con;
        }
        if (!(await con.status())) throw new Error('Die Box antwortet nicht. USB-Kabel kurz aus- und wieder einstecken, „anderen Anschluss wählen“ und nochmal übertragen. Hilft das nicht: Firmware nochmal aufspielen (die neue Version antwortet an beiden USB-Buchsen).');
        await con.set('led', ledPin);
        await con.set('invert', invert ? '1' : '0');
        await con.set('ssid', ssid.trim());
        if (pass) await con.set('pass', pass);
        await con.set('server', server);
        await con.set('code', box!.token);
        await con.send('fc:connect');
        addLog('Einstellungen übertragen – die Box verbindet sich mit dem WLAN …');
        // warten, bis das WLAN steht (die Box braucht bis zu 15 s)
        let s: BoxStatus | null = null;
        for (let i = 0; i < 8 && !s?.wifi; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          s = await con.status(4000, false);
        }
        setStatus(s);
        setPass('');
        setStep('done');
      } catch (err) {
        setStep('flashed');
        throw err;
      }
    });
  };

  if (!serialSupported() || isNativeApp) {
    const url = `${server}/musik/box/${id}`;
    return (
      <div className="page narrow">
        <header className="page-header"><h1>Musik-Box einrichten</h1></header>
        <section className="card">
          <p>Das Aufspielen klappt am <b>PC oder Laptop in Chrome oder Edge</b> – dort kann der Browser über USB mit dem ESP32 sprechen
            (in der Handy-App, Firefox und Safari geht das leider nicht).</p>
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
        <h1>Musik-Box einrichten{box && `: ${box.name}`}</h1>
        <Link to="/musik" className="link-button">Zurück zu Musik</Link>
      </header>

      <section className="card">
        <h2>1. Per USB anschließen</h2>
        <p className="muted">USB-C-Kabel in die Buchse <b>„COM“</b> bzw. <b>„UART“</b> des ESP32 stecken und mit dem PC verbinden (sind die Buchsen nicht beschriftet: erst die eine probieren, klappt es nicht, die andere). Dann:</p>
        <button type="button" className="button primary" disabled={busy} onClick={() => void choosePort()}>
          {port ? '✓ Verbunden – anderen Anschluss wählen' : 'ESP32 auswählen'}
        </button>
        <p className="hint">Im Fenster des Browsers den Eintrag mit „USB“, „CP210x“, „CH340/CH343“ oder „USB JTAG/serial“ wählen. Erscheint nichts: anderes Kabel probieren – manche können nur laden.</p>
      </section>

      <section className="card">
        <h2>2. Firmware aufspielen</h2>
        <p className="muted">Spielt die aktuelle Musik-Box-Software auf (ca. 1 Minute). Schon eingerichtete Einstellungen bleiben erhalten.</p>
        <button type="button" className="button primary" disabled={!port || busy} onClick={() => void flash()}>
          {step === 'flashing' ? `Spiele auf … ${Math.round(progress * 100)} %` : 'Firmware aufspielen'}
        </button>
        {step === 'flashing' && <div className="flash-progress"><span style={{ width: `${progress * 100}%` }} /></div>}
        {flashed && <p className="success">✓ Firmware ist drauf.</p>}
      </section>

      <form className="card form" onSubmit={send}>
        <h2>3. WLAN und Box-Code übertragen</h2>
        <p className="muted">Die Daten gehen nur über das USB-Kabel an die Box – das Passwort wird nirgends gespeichert oder an den Server geschickt.</p>
        <label>WLAN-Name (2,4 GHz)<input value={ssid} onChange={(e) => setSsid(e.target.value)} required maxLength={32} autoComplete="off" /></label>
        <label>WLAN-Passwort<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} maxLength={64} autoComplete="new-password" /></label>
        <div className="row">
          <label>LED am ESP32
            <select value={ledPin} onChange={(e) => setLedPin(e.target.value)}>
              <option value="48">GPIO 48 (die meisten Boards)</option>
              <option value="38">GPIO 38 (Board-Version 1.1)</option>
            </select>
          </label>
          <label className="checkbox"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> Drehknopf andersherum</label>
        </div>
        <p className="hint">Server: <code>{server}</code> · Box-Code: <code>{box?.token ?? '…'}</code> (kommen automatisch dazu)</p>
        <div className="form-actions">
          <span className="spacer" />
          <button className="button primary" disabled={!port || !box || busy || !ssid.trim()}>
            {step === 'sending' ? 'Übertrage …' : 'Auf die Box übertragen'}
          </button>
        </div>
        {step === 'done' && status && (
          <div className={`setup-result ${status.wifi ? 'ok' : 'warn'}`}>
            <p>{status.wifi ? `✓ Mit „${status.ssid}“ verbunden (IP ${status.ip})` : `✗ WLAN „${status.ssid}“ nicht erreicht – Name/Passwort prüfen (nur 2,4 GHz)`}</p>
            <p>{status.rc522 ? '✓ Kartenleser gefunden' : '✗ Kartenleser nicht gefunden – Verkabelung prüfen (SDA 10, SCK 12, MOSI 11, MISO 13, RST 9, 3V3)'}</p>
            {status.wifi && <p>Fertig! Jetzt eine Karte einstecken. In der Musik-Übersicht steht die Box danach als „zuletzt aktiv“.</p>}
          </div>
        )}
        {step === 'done' && !status && <p className="error">Die Box hat sich nach dem Neustart nicht gemeldet – im Protokoll nachsehen.</p>}
      </form>

      {error && <p className="error">{error}</p>}

      <details className="card" open={log.length > 0 && step !== 'done'}>
        <summary>Protokoll der Box</summary>
        <pre ref={logRef} className="serial-log">{log.join('\n') || 'Noch nichts.'}</pre>
        {port && step !== 'flashing' && (
          <button type="button" className="button small" disabled={busy} onClick={() => void attempt(async () => {
            if (!consoleRef.current) {
              const con = new BoxConsole(port);
              con.onLine = addLog;
              con.onNote = addLog;
              await con.open();
              consoleRef.current = con;
            }
            const s = await consoleRef.current.status();
            if (s) setStatus(s);
            addLog(s ? `Zustand: WLAN ${s.wifi ? `verbunden (${s.ip})` : 'nicht verbunden'}, Kartenleser ${s.rc522 ? 'ok' : 'nicht gefunden'}` : 'Keine Antwort von der Box');
          })}>Zustand abfragen</button>
        )}
      </details>
    </div>
  );
}

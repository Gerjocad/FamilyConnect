import { useEffect, useState } from 'react';
import { NfcWriter, isCancelled } from '../nfcWriter';
import { Icon } from './Icon';

type State = { step: 'idle' } | { step: 'waiting'; hint?: string } | { step: 'done' } | { step: 'error'; message: string };

/** „Auf NFC-Aufkleber schreiben“: wartet auf den Aufkleber und schreibt die Adresse darauf */
export function NfcWriteButton({ uri }: { uri: string }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const waiting = state.step === 'waiting';

  useEffect(() => {
    if (!waiting) return;
    const listener = NfcWriter.addListener('retry', ({ message }) => setState({ step: 'waiting', hint: message }));
    // Dialog geschlossen → nicht weiter auf einen Aufkleber warten
    return () => {
      void listener.then((l) => l.remove());
      void NfcWriter.cancel().catch(() => {});
    };
  }, [waiting]);

  const start = () => {
    setState({ step: 'waiting' });
    NfcWriter.write({ uri }).then(
      () => setState({ step: 'done' }),
      (err: unknown) => setState(isCancelled(err) ? { step: 'idle' } : { step: 'error', message: (err as Error).message || 'Schreiben fehlgeschlagen' }),
    );
  };

  if (state.step === 'waiting') {
    return (
      <div className="nfc-write waiting" role="status">
        <span className="nfc-write-icon"><Icon name="nfc" size={28} /></span>
        <span>
          <strong>Halte jetzt den Aufkleber an die Rückseite deines Handys</strong>
          {state.hint && <small className="error">{state.hint}</small>}
        </span>
        <button type="button" className="button small" onClick={() => void NfcWriter.cancel()}>Abbrechen</button>
      </div>
    );
  }
  return (
    <>
      {state.step === 'done' && (
        <p className="nfc-write-done"><Icon name="check" size={18} /> Fertig – der Aufkleber ist beschrieben. Handy dranhalten = abgehakt.</p>
      )}
      {state.step === 'error' && <p className="error">{state.message}</p>}
      <button type="button" className={`button ${state.step === 'done' ? '' : 'primary'}`} onClick={start}>
        <Icon name="nfc" size={18} /> {state.step === 'idle' ? 'Auf NFC-Aufkleber schreiben' : state.step === 'done' ? 'Weiteren Aufkleber beschreiben' : 'Nochmal versuchen'}
      </button>
    </>
  );
}

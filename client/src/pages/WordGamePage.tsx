import { useState } from 'react';
import { Link } from 'react-router';
import { LETTERS, WORDS } from '../games';

const LIVES = 8;
const randomWord = () => WORDS[Math.floor(Math.random() * WORDS.length)];
// Bindestrich, Leerzeichen & Co. sind von Anfang an sichtbar
const isLetter = (ch: string) => LETTERS.includes(ch);

/** Wörter raten: Buchstaben tippen, bevor die 8 Herzen weg sind. Computer-Wort oder eigenes Wort für die anderen */
export function WordGamePage() {
  const [word, setWord] = useState(randomWord);
  const [guessed, setGuessed] = useState<string[]>([]);
  const [secret, setSecret] = useState('');
  const [own, setOwn] = useState(false);
  const [score, setScore] = useState({ won: 0, lost: 0 });

  const wrong = guessed.filter((l) => !word.includes(l)).length;
  const lives = LIVES - wrong;
  const solved = [...word].every((ch) => !isLetter(ch) || guessed.includes(ch));
  const over = solved || lives <= 0;

  const start = (w: string) => {
    setWord(w);
    setGuessed([]);
    setOwn(false);
    setSecret('');
  };
  const guess = (l: string) => {
    if (over || guessed.includes(l)) return;
    const next = [...guessed, l];
    setGuessed(next);
    const nowSolved = [...word].every((ch) => !isLetter(ch) || next.includes(ch));
    const nowLost = LIVES - next.filter((x) => !word.includes(x)).length <= 0;
    if (nowSolved) setScore((s) => ({ ...s, won: s.won + 1 }));
    else if (nowLost) setScore((s) => ({ ...s, lost: s.lost + 1 }));
  };

  if (own) {
    return (
      <div className="page word-game">
        <header className="page-header"><h1>🔤 Eigenes Wort</h1><Link to="/spiele" className="link-button">Alle Spiele</Link></header>
        <section className="card form">
          <p className="muted">Wort eintippen, ohne dass die anderen hinschauen 🙈 – dann das Handy weitergeben.</p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value.toUpperCase().replace(/[^A-ZÄÖÜß\- ]/g, '').replace(/ß/g, 'SS'))}
            placeholder="Geheimes Wort"
            maxLength={24}
            autoFocus
            aria-label="Geheimes Wort"
          />
          <div className="form-actions">
            <button className="button" onClick={() => setOwn(false)}>Abbrechen</button>
            <span className="spacer" />
            <button className="button primary" disabled={secret.replace(/[^A-ZÄÖÜ]/g, '').length < 2} onClick={() => start(secret.trim())}>Los geht's</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page word-game">
      <header className="page-header">
        <h1>🔤 Wörter raten</h1>
        <Link to="/spiele" className="link-button">Alle Spiele</Link>
      </header>
      <p className="word-lives" aria-label={`${lives} Leben`}>{'❤️'.repeat(Math.max(lives, 0))}{'🤍'.repeat(Math.min(wrong, LIVES))}</p>
      <p className="word-display" aria-live="polite">
        {[...word].map((ch, i) => (
          <span key={i} className={`word-letter ${!isLetter(ch) ? 'sep' : ''} ${over && !guessed.includes(ch) && isLetter(ch) ? 'missed' : ''}`}>
            {!isLetter(ch) || guessed.includes(ch) || over ? ch : '_'}
          </span>
        ))}
      </p>
      {over && <p className="game-status done">{solved ? 'Richtig! 🎉' : `Schade – das Wort war ${word}`}</p>}
      <div className="word-keys">
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            className={`word-key ${guessed.includes(l) ? (word.includes(l) ? 'hit' : 'miss') : ''}`}
            disabled={over || guessed.includes(l)}
            onClick={() => guess(l)}
          >
            {l}
          </button>
        ))}
      </div>
      <p className="muted game-score">Geschafft {score.won} · Nicht geschafft {score.lost}</p>
      <div className="game-footer row wrap">
        <button className="button primary" onClick={() => start(randomWord())}>Neues Wort</button>
        <button className="button" onClick={() => setOwn(true)}>Eigenes Wort für die anderen</button>
      </div>
    </div>
  );
}

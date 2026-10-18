import { useEffect } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { CHANGELOG, markChangesSeen } from '../changelog';
import { formatDate, parseLocal } from '../dates';

/** Was sich von Version zu Version geändert hat */
export function NewsPage() {
  useEffect(() => markChangesSeen(), []);

  return (
    <div className="page narrow">
      <header className="page-header">
        <Link to="/einstellungen" className="icon-button" aria-label="Zurück zu Familie & Profil"><Icon name="left" /></Link>
        <h1 className="spacer">Neuigkeiten</h1>
      </header>
      {CHANGELOG.map((entry, i) => (
        <section key={entry.version} className={`card release ${i === 0 ? 'latest' : ''}`}>
          <header className="release-header">
            <span className="release-version">{entry.version}</span>
            <span className="release-title">
              <h2>{entry.title}</h2>
              <small className="muted">
                {formatDate(parseLocal(entry.date))}
                {i === 0 && ' · aktuell'}
              </small>
            </span>
          </header>
          <ul className="release-changes">
            {entry.changes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          {entry.apk && <small className="muted release-apk"><Icon name="download" size={14} /> mit App-Update</small>}
        </section>
      ))}
    </div>
  );
}

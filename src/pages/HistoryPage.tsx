import { History, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AttemptCard } from '../components/AttemptCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import type { Difficulty, PracticeAttempt } from '../types';

type DifficultyFilter = 'all' | Difficulty;

export function HistoryPage() {
  const { attempts, deleteAttempts } = useApp();
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [pendingDelete, setPendingDelete] = useState<PracticeAttempt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => attempts.filter((attempt) => {
    const difficultyMatches = difficulty === 'all' || attempt.topic.difficulty === difficulty;
    const query = search.trim().toLocaleLowerCase();
    const duelNames = attempt.report.duel ? `${attempt.report.duel.speaker1.name} ${attempt.report.duel.speaker2.name}`.toLocaleLowerCase() : '';
    const searchMatches = !query || attempt.topic.prompt.toLocaleLowerCase().includes(query) || attempt.topic.category.toLocaleLowerCase().includes(query) || duelNames.includes(query);
    return difficultyMatches && searchMatches;
  }), [attempts, difficulty, search]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const duel = pendingDelete.report.duel;
      await deleteAttempts(duel ? [duel.speaker1.attemptId, duel.speaker2.attemptId] : [pendingDelete.id]);
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this practice.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page narrow-page">
      <div className="page-header">
        <span className="eyebrow"><History size={14} /> Practice library</span>
        <h1>History</h1>
        <p>Return to any argument, compare the evidence, or remove a session you no longer need.</p>
      </div>

      <div className="history-toolbar">
        <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topics" /></label>
        <div className="filter-pills" aria-label="Filter by difficulty">
          {(['all', 'easy', 'medium', 'hard'] as const).map((option) => (
            <button key={option} type="button" className={difficulty === option ? 'active' : ''} onClick={() => setDifficulty(option)}>{option}</button>
          ))}
        </div>
      </div>

      <div className="history-count">{filtered.length} {filtered.length === 1 ? 'practice' : 'practices'}</div>
      {filtered.length ? (
        <div className="attempt-list roomy">{filtered.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} onDelete={() => { setDeleteError(null); setPendingDelete(attempt); }} />)}</div>
      ) : (
        <div className="empty-panel centered"><span className="empty-icon"><History size={24} /></span><div><h3>Nothing found</h3><p>{attempts.length ? 'Try another search or difficulty.' : 'Your completed practices will appear here.'}</p></div></div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this practice?"
        description={<>{pendingDelete?.report.duel ? 'Both speakers’ analyses and any saved recordings from this 1v1 will be permanently removed.' : 'The analysis and any saved recording will be permanently removed.'}{deleteError && <div className="form-error" role="alert">{deleteError}</div>}</>}
        confirmLabel="Delete practice"
        busy={deleting}
        onCancel={() => { setDeleteError(null); setPendingDelete(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

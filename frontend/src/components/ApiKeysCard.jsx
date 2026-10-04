import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

/**
 * Personal API keys, for the MCP server.
 *
 * The plaintext key is shown exactly once, in the panel below the moment it is
 * minted, and never again -- the server keeps only a hash, so there is no endpoint
 * that could show it a second time. That is the property the whole card is built
 * around: the reveal is deliberately awkward (a copy button, a warning, a dismiss)
 * rather than a value sitting in a list.
 */
export default function ApiKeysCard() {
  const { toast } = useToast();
  const [keys, setKeys] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  // Same-origin in both environments: in production the backend serves the built
  // SPA, and in development Vite proxies /api to it. So this is correct either way,
  // and it does not need the server to publish another value on an unauthenticated
  // endpoint just to avoid a string the browser already knows.
  const mcpUrl = `${window.location.origin}/api/mcp`;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/keys');
      setKeys(data.keys);
    } catch {
      // A settings page that cannot list its keys should say so rather than
      // rendering an empty list, which reads as "you have none".
      setKeys('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post('/keys', { name });
      setName('');
      setRevealed(data);
      load();
    } catch (err) {
      const message = err.response?.data?.error || 'Could not create the key.';
      toast.error('Key not created', message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key) => {
    setRevokingId(key.id);
    try {
      await api.delete(`/keys/${key.id}`);
      toast.success('Key revoked', `"${key.name}" can no longer be used.`);
      load();
    } catch (err) {
      const message = err.response?.data?.error || 'Could not revoke the key.';
      toast.error('Not revoked', message);
    } finally {
      setRevokingId(null);
    }
  };

  const live = (keys || []).filter(k => k.active);
  const atCap = Array.isArray(keys) && live.length >= 10;

  return (
    <div className="card p-6 mb-6">
      <p className="font-semibold text-surface-900 dark:text-white">API keys</p>
      <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
        Connect an AI assistant to your CVs and the job board over MCP. A key is
        separate from your session, so it keeps working after you log out and you can
        revoke it on its own.
      </p>

      {/* The reveal. Deliberately unmissable and deliberately temporary. */}
      {revealed && (
        <div className="mt-5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Copy this key now. It will not be shown again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-white dark:bg-surface-900 border border-amber-300 dark:border-amber-700 px-3 py-2 text-xs font-mono text-surface-900 dark:text-surface-100">
              {revealed.key}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(revealed.key)}
              className="btn-secondary text-sm flex-shrink-0"
            >
              Copy
            </button>
          </div>
          {mcpUrl && (
            <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-200/80">
              Endpoint: <code className="font-mono">{mcpUrl}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="mt-3 text-xs font-medium text-amber-900 dark:text-amber-300 underline cursor-pointer"
          >
            I have copied it
          </button>
        </div>
      )}

      {/* Mint. */}
      <form onSubmit={handleCreate} className="mt-5 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What is this for? e.g. Claude Desktop"
          maxLength={60}
          aria-label="Name for the new key"
          className="input-field flex-1"
        />
        <button type="submit" disabled={creating || !name.trim() || atCap} className="btn-primary text-sm">
          {creating ? 'Creating...' : 'Create key'}
        </button>
      </form>
      {atCap && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          You have 10 active keys, which is the limit. Revoke one before adding another.
        </p>
      )}

      {/* List. */}
      <div className="mt-5">
        {keys === null && <p className="text-sm text-surface-500 dark:text-surface-400">Loading...</p>}

        {keys === 'error' && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Could not load your keys.
          </p>
        )}

        {Array.isArray(keys) && keys.length === 0 && (
          <p className="text-sm text-surface-500 dark:text-surface-400">
            No keys yet. The first one is shown once and cannot be retrieved again.
          </p>
        )}

        <ul className="space-y-2">
          {Array.isArray(keys) && keys.map(key => (
            <li
              key={key.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                key.active
                  ? 'border-surface-200 dark:border-surface-700'
                  : 'border-surface-200 dark:border-surface-800 opacity-60'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                  {key.name}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 font-mono">
                  {key.prefix}...
                  {key.active
                    ? key.lastUsedAt
                      ? ` · used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : ' · never used'
                    : ' · revoked'}
                </p>
              </div>
              {key.active && (
                <button
                  type="button"
                  onClick={() => handleRevoke(key)}
                  disabled={revokingId === key.id}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer disabled:opacity-50 flex-shrink-0"
                >
                  {revokingId === key.id ? 'Revoking...' : 'Revoke'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
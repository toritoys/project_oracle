import { useState, useRef, useEffect } from 'react';
import { getGroqKey, setGroqKey } from '../oracle/api';

interface Props {
  onKeyChange?: () => void;
}

export function GroqSettings({ onKeyChange }: Props) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => getGroqKey());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setKey(v);
    setGroqKey(v);
    onKeyChange?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <>
      <button
        className="groq-settings-btn"
        title="Settings"
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle Groq settings"
      >
        ⚙
      </button>

      {open && (
        <div className="groq-settings-drawer" onKeyDown={handleKeyDown}>
          <label>Groq API Key (optional)</label>
          <input
            ref={inputRef}
            type="password"
            value={key}
            onChange={handleChange}
            placeholder="gsk_..."
            autoComplete="off"
          />
          <div className="groq-settings-hint">
            Stored locally only. Free at console.groq.com.
          </div>
        </div>
      )}
    </>
  );
}

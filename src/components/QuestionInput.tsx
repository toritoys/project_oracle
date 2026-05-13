import { useRef, useEffect } from 'react';
import type { PhaseState } from '../oracle/types';

interface Props {
  phase: PhaseState;
  onSubmit: (question: string) => void;
  hasGroqKey: boolean;
}

export function QuestionInput({ phase, onSubmit, hasGroqKey }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const isLocked = phase !== 'idle';
  const isHidden = phase !== 'idle';

  const placeholder = hasGroqKey ? 'ask the oracle' : 'ask the oracle';

  useEffect(() => {
    if (phase === 'idle' && inputRef.current) {
      inputRef.current.value = '';
      // Small delay so the fade-in completes before focus
      setTimeout(() => inputRef.current?.focus(), 650);
    }
  }, [phase]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const q = inputRef.current?.value?.trim();
      if (q && phase === 'idle') {
        onSubmit(q);
        if (inputRef.current) inputRef.current.value = '';
      }
    }
  }

  return (
    <div className={`question-input-wrap${isHidden ? ' hidden' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        className="question-input"
        placeholder={placeholder}
        disabled={isLocked}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}

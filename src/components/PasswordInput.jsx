import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password field with an eye button that shows or hides what was typed. */
export default function PasswordInput({ value, onChange, autoComplete, id }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative mt-1">
      <input
        id={id}
        className="field mt-0 pr-12"
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-4 text-text-muted hover:text-brand bg-transparent border-0 shadow-none"
      >
        <Icon size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

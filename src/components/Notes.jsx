import { useEffect, useRef, useState } from 'react';
import { getNote, saveNote } from '../lib/db.js';

/** Personal notes for one lesson or module. Saved locally first, then synced. */
export default function Notes({ userId, lessonId, onSaved }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(true);
  const loaded = useRef(false);
  const lastSaved = useRef('');

  useEffect(() => {
    let live = true;
    loaded.current = false;
    getNote(userId, lessonId).then((t) => {
      if (live) {
        lastSaved.current = t;
        setText(t);
        loaded.current = true;
      }
    });
    return () => {
      live = false;
    };
  }, [userId, lessonId]);

  // Save only when the learner actually changed the text (opening a lesson must not trigger a save or sync).
  useEffect(() => {
    if (!loaded.current || text === lastSaved.current) return undefined;
    setSaved(false);
    const t = setTimeout(() => {
      saveNote(userId, lessonId, text).then(() => {
        lastSaved.current = text;
        setSaved(true);
        onSaved?.();
      });
    }, 500);
    return () => clearTimeout(t);
  }, [text, userId, lessonId, onSaved]);

  return (
    <div className="mt-6">
      <label htmlFor="notes" className="font-extrabold">My notes</label>
      <textarea
        id="notes"
        className="field min-h-[7rem]"
        placeholder="Write what you learned in your own words. Notes save on this device and sync to your account."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
      />
      <p className="muted mt-1" role="status">{saved ? 'Saved on this device' : 'Saving...'}</p>
    </div>
  );
}

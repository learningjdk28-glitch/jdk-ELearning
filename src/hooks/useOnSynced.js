import { useEffect, useRef } from 'react';

/** Runs `handler(item, result)` each time a queued item matching `match(item)` reaches the server. */
export default function useOnSynced(match, handler) {
  const ref = useRef({ match, handler });
  ref.current = { match, handler };
  useEffect(() => {
    const on = (e) => { if (ref.current.match(e.detail.item)) ref.current.handler(e.detail.item, e.detail.result); };
    window.addEventListener('jdk-synced', on);
    return () => window.removeEventListener('jdk-synced', on);
  }, []);
}

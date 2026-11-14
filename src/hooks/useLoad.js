import { useCallback, useEffect, useState } from 'react';

/** Runs an async loader with loading / error state and a reload function. Reloads when `deps` change. */
export default function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { setState({ data: await load(), loading: false, error: null }); }
    catch (error) { setState({ data: null, loading: false, error }); }
  }, [load]);
  useEffect(() => { reload(); }, [reload]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload, setData };
}

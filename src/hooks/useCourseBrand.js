import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { setCourseBrand } from '../lib/applyTheme.js';
import { withCache } from '../services/offline.js';

const courseIn = (pathname) => {
  const m = /^\/learn\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
};

/** On a course's pages, shows that course's colour (if its instructor chose one); elsewhere the person's own. */
export default function useCourseBrand(pathname) {
  const courseId = courseIn(pathname);
  useEffect(() => {
    if (!courseId || !supabase) { setCourseBrand(null); return undefined; }
    let alive = true;
    withCache(`course-brand:${courseId}`, async () => {
      const { data, error } = await supabase.from('courses').select('brand_color').eq('id', courseId).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.brand_color || null;
    }).then((value) => { if (alive) setCourseBrand(value); }).catch(() => { if (alive) setCourseBrand(null); });
    return () => { alive = false; };
  }, [courseId]);
  useEffect(() => () => setCourseBrand(null), []);
}

import { withSupabase } from 'npm:@supabase/server@1.4.1';
import { handleImportHunt } from './core.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, (request, context) =>
    handleImportHunt(request, context)
  )
};

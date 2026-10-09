(function attachAferoCloud(global) {
  'use strict';

  const clientByFactory = new WeakMap();
  const VALID_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'PASSWORD_RECOVERY', 'USER_UPDATED']);
  const OFFER_FIELDS = 'id,workspace_id,domain,url_final,title,niche,priority,score,signals,screenshot_url,preview_url,ads_url,first_seen_at,last_seen_at,recurrence_count,status,user_notes,tags';
  const DECISION_STATUSES = new Set(['new', 'saved', 'discarded', 'in_copy', 'in_page']);
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function requireWorkspaceId(workspaceId) {
    const value = String(workspaceId || '');
    if (!UUID_PATTERN.test(value)) throw new Error('Workspace inválido.');
    return value;
  }

  function validateCursor(cursor) {
    if (!cursor || !Number.isInteger(cursor.score) || cursor.score < 0 || cursor.score > 100 || typeof cursor.lastSeenAt !== 'string' || !UUID_PATTERN.test(String(cursor.id || ''))) {
      throw new Error('Cursor inválido.');
    }
    const parsedDate = new Date(cursor.lastSeenAt);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString() !== cursor.lastSeenAt) throw new Error('Cursor inválido.');
    return { score: cursor.score, lastSeenAt: cursor.lastSeenAt, id: String(cursor.id) };
  }

  function escapeIlike(value) {
    return String(value || '').replace(/[\\%_]/g, '\\$&');
  }

  function signalIsPresent(value) {
    return value === true || value === 'sim' || value === 'yes' || value === 1;
  }

  function isLegacyAnonKey(key, projectRef, localhost) {
    const parts = String(key || '').split('.');
    if (parts.length !== 3 || typeof global.atob !== 'function') return false;
    try {
      let encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (encoded.length % 4) encoded += '=';
      const payload = JSON.parse(global.atob(encoded));
      return payload && payload.role === 'anon' && (localhost || payload.ref === projectRef);
    } catch {
      return false;
    }
  }

  function matchesLocalSignals(item, filters) {
    const signals = item && item.signals && typeof item.signals === 'object' ? item.signals : {};
    if (filters.pixel && !signalIsPresent(signals.pixel_ads || signals.pixel)) return false;
    if (filters.vsl && !signalIsPresent(signals.vsl_player || signals.vsl)) return false;
    if (filters.quiz && !signalIsPresent(signals.funnel_quiz || signals.quiz)) return false;
    if ((filters.billing || filters.mrr) && !signalIsPresent(signals.billing_tech_detected || signals.mrr)) return false;
    if (filters.scaled && !signalIsPresent(signals.escalado || signals.scaled)) return false;
    if (filters.recurring && Number(item && item.recurrence_count) < 2) return false;
    return true;
  }

  function validateConfig(config) {
    const value = config || {};
    const url = String(value.supabaseUrl || '').trim();
    const key = String(value.publishableKey || '').trim();
    if (!url || !key) return { enabled: false, reason: 'missing_config' };
    if (key.startsWith('sb_secret_')) return { enabled: false, reason: 'invalid_key' };
    try {
      const parsed = new URL(url);
      const localhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localhost)) || (!localhost && !parsed.hostname.endsWith('.supabase.co'))) {
        return { enabled: false, reason: 'invalid_url' };
      }
      const projectRef = localhost ? '' : parsed.hostname.slice(0, -'.supabase.co'.length);
      if (!key.startsWith('sb_publishable_') && !isLegacyAnonKey(key, projectRef, localhost)) {
        return { enabled: false, reason: 'invalid_key' };
      }
      return { enabled: true, reason: 'ready' };
    } catch {
      return { enabled: false, reason: 'invalid_url' };
    }
  }

  function errorFrom(result, fallback) {
    if (!result || !result.error) return result ? result.data : undefined;
    if (result.error instanceof Error) throw result.error;
    throw new Error(fallback || 'Não foi possível concluir esta operação.');
  }

  function create(options) {
    const config = options && options.config ? options.config : {};
    const configState = validateConfig(config);
    const factory = options && options.supabaseFactory;
    if (!configState.enabled || typeof factory !== 'function') return disabledClient(configState.reason);
    if (clientByFactory.has(factory)) return clientByFactory.get(factory);

    const supabaseClient = factory(config.supabaseUrl, config.publishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    let session = null;
    let user = null;
    let subscribed = false;

    function applySession(nextSession) {
      session = nextSession || null;
      user = session && session.user ? session.user : null;
    }

    function requireClient() {
      if (!supabaseClient) throw new Error('O acesso cloud não está configurado.');
    }

    const client = {
      async initialize(onAuthEvent) {
        requireClient();
        const current = await supabaseClient.auth.getSession();
        const currentData = errorFrom(current, 'Não foi possível iniciar a sessão.');
        applySession(currentData && currentData.session);
        if (!subscribed) {
          const listener = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
            applySession(nextSession);
            if (typeof onAuthEvent === 'function' && VALID_EVENTS.has(event)) {
              const authEvent = { event, session, user };
              global.setTimeout(() => onAuthEvent(authEvent), 0);
            }
          });
          subscribed = true;
          client.unsubscribeAuth = () => listener && listener.data && listener.data.subscription && listener.data.subscription.unsubscribe();
        }
        return { enabled: true, session, user };
      },
      currentSession() { return session; },
      currentUser() { return user; },
      async signUp({ email, password, fullName }) {
        const result = await supabaseClient.auth.signUp({
          email, password,
          options: { data: { full_name: String(fullName || '').trim() }, emailRedirectTo: config.redirectUrl }
        });
        const data = errorFrom(result, 'Não foi possível criar a conta.');
        applySession(data && data.session);
        return { user: data && data.user || null, session: data && data.session || null, confirmationPending: Boolean(data && data.user && !data.session) };
      },
      async signInWithPassword({ email, password }) {
        const data = errorFrom(await supabaseClient.auth.signInWithPassword({ email, password }), 'Não foi possível entrar.');
        applySession(data && data.session);
        return { session, user };
      },
      async signInWithGoogle() {
        return errorFrom(await supabaseClient.auth.signInWithOAuth({
          provider: 'google', options: { scopes: 'openid email profile', redirectTo: config.redirectUrl }
        }), 'Não foi possível abrir o login Google.');
      },
      async sendPasswordReset(email) {
        return errorFrom(await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: config.redirectUrl }), 'Não foi possível enviar a recuperação.');
      },
      async updatePassword(password) {
        const data = errorFrom(await supabaseClient.auth.updateUser({ password }), 'Não foi possível atualizar a senha.');
        if (data && data.user) user = data.user;
        return data;
      },
      async signOut() {
        errorFrom(await supabaseClient.auth.signOut(), 'Não foi possível sair.');
        applySession(null);
      },
      async listWorkspaces() {
        const result = await supabaseClient
          .from('workspace_members')
          .select('role, created_at, workspace:workspaces(id,name,slug)')
          .order('created_at', { ascending: true });
        const data = errorFrom(result, 'Não foi possível listar os workspaces.') || [];
        return data
          .filter((membership) => membership && membership.workspace && membership.workspace.id)
          .map((membership) => ({ workspaceId: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug, role: membership.role }))
          .sort((left, right) => String(left.name).localeCompare(String(right.name)));
      },
      async hasPaidAccess() {
        const result = await supabaseClient.rpc('has_paid_access');
        return errorFrom(result, 'Não foi possível verificar o acesso.') === true;
      },
      async listOffers({ workspaceId, cursor, filters, signal } = {}) {
        const selectedWorkspaceId = requireWorkspaceId(workspaceId);
        const activeFilters = filters && typeof filters === 'object' ? filters : {};
        const nextCursor = cursor ? validateCursor(cursor) : null;
        let query = supabaseClient
          .from('offers')
          .select(OFFER_FIELDS, nextCursor ? undefined : { count: 'exact' })
          .eq('workspace_id', selectedWorkspaceId);
        if (nextCursor) {
          query = query.or(`score.lt.${nextCursor.score},and(score.eq.${nextCursor.score},last_seen_at.lt.\"${nextCursor.lastSeenAt}\"),and(score.eq.${nextCursor.score},last_seen_at.eq.\"${nextCursor.lastSeenAt}\",id.gt.${nextCursor.id})`);
        }
        const search = String(activeFilters.search || '').trim();
        if (search) query = query.ilike('title', `%${escapeIlike(search)}%`);
        for (const field of ['niche', 'priority', 'status']) {
          if (activeFilters[field]) query = query.eq(field, activeFilters[field]);
        }
        if (activeFilters.pixel) query = query.contains('signals', { pixel_ads: true });
        if (activeFilters.vsl) query = query.contains('signals', { vsl_player: true });
        if (activeFilters.quiz) query = query.contains('signals', { funnel_quiz: true });
        if (activeFilters.billing || activeFilters.mrr) query = query.or('signals->>billing_tech_detected.eq.true,signals->>mrr.eq.true');
        if (activeFilters.verified) query = query.contains('signals', { subscription_verified: true });
        if (activeFilters.scaled) query = query.contains('signals', { scaled: true });
        if (activeFilters.group) query = query.contains('signals', { group: String(activeFilters.group).slice(0, 80) });
        if (activeFilters.novel) query = query.contains('signals', { novel: true });
        if (activeFilters.recurring) query = query.gte('recurrence_count', 2);
        query = query
          .order('score', { ascending: false })
          .order('last_seen_at', { ascending: false })
          .order('id', { ascending: true })
          .limit(101);
        if (signal) query = query.abortSignal(signal);
        const result = await query;
        const rows = errorFrom(result, 'Não foi possível carregar o catálogo.') || [];
        const page = rows.slice(0, 100);
        const last = rows.length > 100 ? page[page.length - 1] : null;
        return {
          items: page,
          total: nextCursor ? null : (typeof result.count === 'number' ? result.count : null),
          nextCursor: last ? { score: last.score, lastSeenAt: last.last_seen_at, id: last.id } : null,
          localFilterLabel: null
        };
      },
      async importHunt({ workspaceId, file } = {}) {
        const selectedWorkspaceId = requireWorkspaceId(workspaceId);
        if (!file) throw new Error('Arquivo obrigatório.');
        const body = new FormData();
        body.append('workspace_id', selectedWorkspaceId);
        body.append('file', file);
        const result = await supabaseClient.functions.invoke('import-hunt', { body });
        if (result && result.error) {
          const error = result.error instanceof Error ? result.error : new Error('Não foi possível importar o arquivo.');
          error.request_id = result.data && result.data.request_id || result.error.request_id;
          throw error;
        }
        return result && result.data;
      },
      async updateOfferDecision({ workspaceId, offerId, status, userNotes, tags } = {}) {
        const selectedWorkspaceId = requireWorkspaceId(workspaceId);
        if (!DECISION_STATUSES.has(status)) throw new Error('Status inválido.');
        if (typeof userNotes !== 'string' || userNotes.length > 10000) throw new Error('Nota inválida.');
        if (!Array.isArray(tags) || tags.length > 24 || tags.some((tag) => typeof tag !== 'string')) throw new Error('Tags inválidas.');
        const result = await supabaseClient
          .from('offers')
          .update({ status, user_notes: userNotes, tags })
          .eq('workspace_id', selectedWorkspaceId)
          .eq('id', offerId)
          .select('id,status,user_notes,tags')
          .single();
        return errorFrom(result, 'Não foi possível salvar a decisão.');
      },
      async createHuntSignedUrl({ workspaceId, path } = {}) {
        const selectedWorkspaceId = requireWorkspaceId(workspaceId);
        const value = String(path || '');
        if (!value.startsWith(`${selectedWorkspaceId}/`) || value.split('/').includes('..')) throw new Error('Arquivo fora do workspace.');
        const result = await supabaseClient.storage.from('cacadas_csv').createSignedUrl(value, 60);
        const data = errorFrom(result, 'Não foi possível criar URL temporária.');
        return data && data.signedUrl;
      }
    };
    clientByFactory.set(factory, client);
    return client;
  }

  function disabledClient(reason) {
    const unavailable = () => { throw new Error('O acesso cloud não está configurado.'); };
    return {
      initialize: async () => ({ enabled: false, session: null, user: null, reason }),
      currentSession: () => null,
      currentUser: () => null,
      signUp: unavailable, signInWithPassword: unavailable, signInWithGoogle: unavailable,
      sendPasswordReset: unavailable, updatePassword: unavailable, signOut: unavailable, listWorkspaces: unavailable, hasPaidAccess: unavailable,
      listOffers: unavailable, importHunt: unavailable, updateOfferDecision: unavailable, createHuntSignedUrl: unavailable
    };
  }

  global.AferoCloud = Object.freeze({ validateConfig, create });
}(window));

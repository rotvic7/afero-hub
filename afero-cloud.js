(function attachAferoCloud(global) {
  'use strict';

  const clientByFactory = new WeakMap();
  const VALID_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'PASSWORD_RECOVERY', 'USER_UPDATED']);
  const OFFER_FIELDS = 'id,workspace_id,fingerprint,domain,url_final,title,niche,priority,score,signals,screenshot_url,preview_url,ads_url,first_seen_at,last_seen_at,recurrence_count,status,user_notes,tags';
  const DECISION_STATUSES = new Set(['new', 'saved', 'discarded', 'in_copy', 'in_page']);
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
  const SHARE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

  function requireFingerprint(value) {
    if (!FINGERPRINT_PATTERN.test(String(value || ''))) throw new Error('Identidade da oferta inválida.');
    return String(value);
  }

  function dateCursor(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error('Cursor inválido.');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Cursor inválido.');
    return date.toISOString();
  }

  function safeShareUrl(value) {
    try {
      const raw = String(value || '');
      if (raw.length > 4096 || /[\s\\]/.test(raw) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) return null;
      const url = new URL(raw);
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/\.[a-z]{2,63}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid|home|lan|onion)$/.test(host)) return null;
      for (const key of url.searchParams.keys()) if (/^(?:code|token|token_hash|access_token|refresh_token|id_token|authorization|password|session|session_id|jwt|api_key)$/i.test(key)) return null;
      if (/(?:^|[?&#;])(?:code|token|token_hash|access_token|refresh_token|id_token|authorization|password|session|session_id|jwt|api_key)=/i.test(decodeURIComponent(url.search + url.hash))) return null;
      return url.href;
    } catch { return null; }
  }

  function requireWorkspaceId(workspaceId) {
    const value = String(workspaceId || '');
    if (!UUID_PATTERN.test(value)) throw new Error('Workspace inválido.');
    return value;
  }

  function catalogTimestamp(value) {
    const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/);
    if (!match || Number.isNaN(new Date(value).getTime()) || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) throw new Error('Cursor inválido.');
    const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (day.getUTCFullYear() !== Number(match[1]) || day.getUTCMonth() + 1 !== Number(match[2]) || day.getUTCDate() !== Number(match[3])) throw new Error('Cursor inválido.');
    // Preserve Postgres offsets and all six fractional digits at the boundary.
    return value;
  }

  function validateCursor(cursor, sort) {
    if (!cursor || !Number.isInteger(cursor.score) || cursor.score < 0 || cursor.score > 100 || typeof cursor.lastSeenAt !== 'string' || !UUID_PATTERN.test(String(cursor.id || ''))) {
      throw new Error('Cursor inválido.');
    }
    if ((cursor.sort || 'score') !== sort) throw new Error('Cursor inválido.');
    if (sort === 'rec' && (!Number.isSafeInteger(cursor.recurrenceCount) || cursor.recurrenceCount < 1 || cursor.recurrenceCount > 2147483647)) throw new Error('Cursor inválido.');
    return { score: cursor.score, lastSeenAt: catalogTimestamp(cursor.lastSeenAt), id: String(cursor.id), recurrenceCount: cursor.recurrenceCount };
  }

  function catalogOrder(sort) {
    if (sort === 'novo') return ['last_seen_at', 'score', 'id'];
    if (sort === 'rec') return ['recurrence_count', 'score', 'last_seen_at', 'id'];
    return ['score', 'last_seen_at', 'id'];
  }

  function catalogBoundary(cursor, columns) {
    const values = { score: cursor.score, last_seen_at: JSON.stringify(cursor.lastSeenAt), recurrence_count: cursor.recurrenceCount, id: cursor.id };
    return columns.map((column, index) => {
      const conditions = columns.slice(0, index).map(previous => `${previous}.eq.${values[previous]}`);
      conditions.push(`${column}.${column === 'id' ? 'gt' : 'lt'}.${values[column]}`);
      return conditions.length === 1 ? conditions[0] : `and(${conditions.join(',')})`;
    }).join(',');
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

  function recoveryLinkError() {
    return Object.assign(new Error('Solicite um novo link de recuperação.'), { code: 'auth_callback_failed' });
  }

  function create(options) {
    const config = options && options.config ? options.config : {};
    const configState = validateConfig(config);
    const factory = options && options.supabaseFactory;
    if (!configState.enabled || typeof factory !== 'function') return disabledClient(configState.reason);
    if (clientByFactory.has(factory)) return clientByFactory.get(factory);

    let recoveryHash = '';
    let invalidRecoveryLink = false;
    let authCodePresent = false;
    function cleanCallbackUrl(removeCode) {
      if (!global.location || !global.history || typeof global.history.replaceState !== 'function') return;
      const url = new URL(global.location.href);
      if (url.searchParams.get('type') === 'recovery') {
        url.searchParams.delete('token_hash');
        url.searchParams.delete('type');
      }
      if (removeCode) url.searchParams.delete('code');
      global.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (global.location) {
      const callbackUrl = new URL(global.location.href);
      authCodePresent = callbackUrl.searchParams.has('code');
      if (callbackUrl.searchParams.get('type') === 'recovery' && callbackUrl.searchParams.has('token_hash')) {
        const hash = callbackUrl.searchParams.get('token_hash');
        if (/^[a-zA-Z0-9_-]{16,512}$/.test(hash)) recoveryHash = hash;
        else invalidRecoveryLink = true;
        // Keep the one-time credential only in memory, before loading any Hub data.
        cleanCallbackUrl(false);
      }
    }

    const supabaseClient = factory(config.supabaseUrl, config.publishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    let session = null;
    let user = null;
    let subscribed = false;
    let authVersion = 0;
    let identityVersion = 0;
    let recovery = false;

    function applySession(nextSession) {
      if ((user && user.id || null) !== (nextSession && nextSession.user && nextSession.user.id || null)) identityVersion++;
      session = nextSession || null;
      user = session && session.user ? session.user : null;
    }

    function requireClient() {
      if (!supabaseClient) throw new Error('O acesso cloud não está configurado.');
    }

    function authenticatedActor() {
      if (!user || !user.id) throw new Error('Entre na sua conta para usar favoritas e compartilhamentos.');
      return { id: user.id, version: identityVersion };
    }

    function ensureActor(actor) {
      if (!user || user.id !== actor.id || identityVersion !== actor.version) {
        throw Object.assign(new Error('A sessão mudou. Tente novamente.'), { code: 'session_changed' });
      }
    }

    async function personalRpc(name, parameters, signal) {
      const actor = authenticatedActor();
      let query = supabaseClient.rpc(name, parameters);
      if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
      const result = await query;
      ensureActor(actor);
      return errorFrom(result, 'Não foi possível concluir esta operação na sua conta.');
    }

    const client = {
      async initialize(onAuthEvent) {
        requireClient();
        if (!subscribed) {
          const listener = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
            authVersion++;
            if (event === 'PASSWORD_RECOVERY') recovery = true;
            else if (event === 'SIGNED_OUT') recovery = false;
            applySession(nextSession);
            if (typeof onAuthEvent === 'function' && VALID_EVENTS.has(event)) {
              const authEvent = { event, session, user };
              global.setTimeout(() => onAuthEvent(authEvent), 0);
            }
          });
          subscribed = true;
          client.unsubscribeAuth = () => listener && listener.data && listener.data.subscription && listener.data.subscription.unsubscribe();
        }
        if (invalidRecoveryLink) throw recoveryLinkError();
        const version = authVersion;
        const current = await supabaseClient.auth.getSession();
        if (authCodePresent && (current.error || !(current.data && current.data.session))) {
          cleanCallbackUrl(true);
          throw recoveryLinkError();
        }
        const currentData = errorFrom(current, 'Não foi possível iniciar a sessão.');
        if (version === authVersion) applySession(currentData && currentData.session);
        return { enabled: true, session, user, recovery, recoveryLink: Boolean(recoveryHash) };
      },
      currentSession() { return session; },
      currentUser() { return user; },
      async signUp({ email, password, fullName, captchaToken }) {
        const result = await supabaseClient.auth.signUp({
          email, password,
          options: { data: { full_name: String(fullName || '').trim() }, emailRedirectTo: config.redirectUrl, ...(captchaToken ? { captchaToken } : {}) }
        });
        const data = errorFrom(result, 'Não foi possível criar a conta.');
        applySession(data && data.session);
        return { user: data && data.user || null, session: data && data.session || null, confirmationPending: Boolean(data && data.user && !data.session) };
      },
      async signInWithPassword({ email, password, captchaToken }) {
        const data = errorFrom(await supabaseClient.auth.signInWithPassword({ email, password, ...(captchaToken ? { options: { captchaToken } } : {}) }), 'Não foi possível entrar.');
        applySession(data && data.session);
        return { session, user };
      },
      async signInWithGoogle() {
        return errorFrom(await supabaseClient.auth.signInWithOAuth({
          provider: 'google', options: { scopes: 'openid email profile', redirectTo: config.redirectUrl }
        }), 'Não foi possível abrir o login Google.');
      },
      async sendPasswordReset(email, captchaToken) {
        return errorFrom(await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: config.redirectUrl, ...(captchaToken ? { captchaToken } : {}) }), 'Não foi possível enviar a recuperação.');
      },
      async verifyPasswordRecovery() {
        if (!recoveryHash) throw recoveryLinkError();
        const tokenHash = recoveryHash;
        recoveryHash = '';
        let data;
        try { data = errorFrom(await supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })); }
        catch (_) { throw recoveryLinkError(); }
        if (!data || !data.session || !data.session.user || !data.session.user.id) throw recoveryLinkError();
        applySession(data.session);
        recovery = true;
        return { session, user };
      },
      async updatePassword(password) {
        const data = errorFrom(await supabaseClient.auth.updateUser({ password }), 'Não foi possível atualizar a senha.');
        if (data && data.user) user = data.user;
        recovery = false;
        return data;
      },
      async signOut() {
        errorFrom(await supabaseClient.auth.signOut(), 'Não foi possível sair.');
        applySession(null);
        recoveryHash = '';
        recovery = false;
      },
      async listWorkspaces() {
        if (!user || !user.id) throw new Error('Entre na sua conta para listar workspaces.');
        const result = await supabaseClient
          .from('workspace_members')
          .select('role, created_at, workspace:workspaces(id,name,slug)')
          .eq('user_id', user.id)
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
      async getLatestHunt({ workspaceId, signal } = {}) {
        const selectedWorkspaceId = requireWorkspaceId(workspaceId);
        let query = supabaseClient.from('hunts')
          .select('id,original_file_name,rows_imported,created_at')
          .eq('workspace_id', selectedWorkspaceId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false }).order('id', { ascending: true })
          .limit(1);
        if (signal) query = query.abortSignal(signal);
        return errorFrom(await query.maybeSingle(), 'Não foi possível localizar sua última caçada.') || null;
      },
      async listOffers({ workspaceId, cursor, filters, signal } = {}) {
        const selectedWorkspaceId = requireWorkspaceId(workspaceId);
        const activeFilters = filters && typeof filters === 'object' ? filters : {};
        const sort = ['score', 'novo', 'rec'].includes(activeFilters.sort) ? activeFilters.sort : 'score';
        const order = catalogOrder(sort);
        const nextCursor = cursor ? validateCursor(cursor, sort) : null;
        const huntId = activeFilters.huntId ? requireWorkspaceId(activeFilters.huntId) : '';
        let query = supabaseClient
          .from('offers')
          .select(OFFER_FIELDS + (huntId ? ',collection:hunt_offers!hunt_offers_offer_workspace_fkey!inner(hunt_id)' : ''), nextCursor ? undefined : { count: 'exact' })
          .eq('workspace_id', selectedWorkspaceId);
        if (huntId) query = query.eq('collection.hunt_id', huntId);
        if (nextCursor) {
          query = query.or(catalogBoundary(nextCursor, order));
        }
        const search = String(activeFilters.search || '').trim();
        if (search) {
          // Quote each PostgREST value; CSV/search punctuation cannot become filter syntax.
          const pattern = JSON.stringify(`%${escapeIlike(search)}%`);
          query = query.or(['title', 'domain', 'niche', 'signals->>gateway', 'signals->>tracker']
            .map((column) => `${column}.ilike.${pattern}`).join(','));
        }
        for (const field of ['niche', 'priority', 'status']) {
          if (activeFilters[field]) query = query.eq(field, activeFilters[field]);
        }
        if (activeFilters.pixel) query = query.contains('signals', { pixel_ads: true });
        if (activeFilters.doubleSignal) query = query.contains('signals', { double_signal: true });
        if (activeFilters.hideDiscarded) query = query.neq('status', 'discarded');
        if (activeFilters.vsl) query = query.contains('signals', { vsl_player: true });
        if (activeFilters.quiz) query = query.contains('signals', { funnel_quiz: true });
        if (activeFilters.billing || activeFilters.mrr) query = query.or('signals->>billing_tech_detected.eq.true,signals->>mrr.eq.true');
        if (activeFilters.verified) query = query.contains('signals', { subscription_verified: true });
        if (activeFilters.scaled) query = query.contains('signals', { scaled: true });
        if (activeFilters.group) query = query.contains('signals', { group: String(activeFilters.group).slice(0, 80) });
        if (activeFilters.novel) query = query.contains('signals', { novel: true });
        if (activeFilters.recurring) query = query.gte('recurrence_count', 2);
        for (const column of order) query = query.order(column, { ascending: column === 'id' });
        query = query.limit(101);
        if (signal) query = query.abortSignal(signal);
        const result = await query;
        const rows = errorFrom(result, 'Não foi possível carregar o catálogo.') || [];
        const page = rows.slice(0, 100);
        const hasMore = rows.length > 100 || (page.length > 0 && (typeof result.count === 'number' ? result.count > page.length : page.length >= 100));
        const last = hasMore ? page[page.length - 1] : null;
        const boundary = last ? { score: last.score, lastSeenAt: last.last_seen_at, id: last.id } : null;
        if (boundary && sort !== 'score') boundary.sort = sort;
        if (boundary && sort === 'rec') boundary.recurrenceCount = last.recurrence_count;
        return {
          items: page,
          total: nextCursor ? null : (typeof result.count === 'number' ? result.count : null),
          nextCursor: boundary,
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
          // FunctionsHttpError keeps the server response in context, not data.
          // Preserve only the public code/reference, never raw SQL or payloads.
          const response = result.error.context;
          let details = result.data;
          if (response && typeof response.clone === 'function') {
            error.status = response.status;
            try { details = await response.clone().json(); } catch (_) {}
          }
          if (details && /^[a-z_]{1,64}$/.test(details.code || '')) error.code = details.code;
          const reference = details && details.request_id || result.error.request_id;
          if (/^[a-zA-Z0-9-]{1,128}$/.test(reference || '')) error.request_id = reference;
          throw error;
        }
        return result && result.data;
      },
      async listFavorites({ cursor, workspaceId, signal } = {}) {
        const next = cursor ? { createdAt: dateCursor(cursor.createdAt), fingerprint: requireFingerprint(cursor.fingerprint) } : null;
        const rows = await personalRpc('list_offer_favorites', {
          p_after_created_at: next && next.createdAt,
          p_after_fingerprint: next && next.fingerprint,
          p_limit: 101,
          p_workspace_id: workspaceId ? requireWorkspaceId(workspaceId) : null
        }, signal) || [];
        const items = rows.slice(0, 100);
        const last = rows.length > 100 ? items[items.length - 1] : null;
        return { items, nextCursor: last ? { createdAt: dateCursor(last.created_at), fingerprint: last.offer_fingerprint } : null };
      },
      async favoriteOffer({ offerId } = {}) {
        const rows = await personalRpc('favorite_offer', { p_offer_id: requireWorkspaceId(offerId) });
        return Array.isArray(rows) ? rows[0] || null : rows;
      },
      async removeFavorite({ fingerprint } = {}) {
        return await personalRpc('remove_offer_favorite', { p_fingerprint: requireFingerprint(fingerprint) }) === true;
      },
      async markFavoriteReviewed({ fingerprint, observedAt } = {}) {
        const parameters = { p_fingerprint: requireFingerprint(fingerprint) };
        if (observedAt) parameters.p_observed_at = dateCursor(observedAt);
        const rows = await personalRpc('mark_offer_favorite_reviewed', parameters);
        return Array.isArray(rows) ? rows[0] || null : rows;
      },
      async createOfferShare({ offerId } = {}) {
        const rows = await personalRpc('create_offer_share', { p_offer_id: requireWorkspaceId(offerId) });
        const row = Array.isArray(rows) ? rows[0] : rows;
        const urlFinal = row && safeShareUrl(row.url_final);
        if (!row || !SHARE_TOKEN_PATTERN.test(row.token || '') || !urlFinal) throw new Error('Não foi possível criar um link público seguro.');
        return { token: row.token, urlFinal };
      },
      async resolveOfferShare(token) {
        if (!SHARE_TOKEN_PATTERN.test(String(token || ''))) throw new Error('Link de oferta inválido.');
        const version = identityVersion;
        const result = await supabaseClient.rpc('resolve_offer_share', { p_token: String(token) });
        if (version !== identityVersion) throw Object.assign(new Error('A sessão mudou. Tente novamente.'), { code: 'session_changed' });
        const rows = errorFrom(result, 'Não foi possível verificar o link de oferta.');
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) return null;
        const urlFinal = safeShareUrl(row.url_final);
        if (!FINGERPRINT_PATTERN.test(row.fingerprint || '') || !urlFinal) throw new Error('O link não possui uma página pública válida.');
        return { fingerprint: row.fingerprint, domain: String(row.domain || ''), urlFinal };
      },
      async findSharedOffer({ fingerprint, workspaceId, signal } = {}) {
        const actor = authenticatedActor();
        const identity = requireFingerprint(fingerprint);
        async function find(workspace) {
          let query = supabaseClient.from('offers').select(OFFER_FIELDS).eq('fingerprint', identity);
          if (workspace) query = query.eq('workspace_id', requireWorkspaceId(workspace));
          query = query.order('last_seen_at', { ascending: false }).order('id', { ascending: true }).limit(1);
          if (signal) query = query.abortSignal(signal);
          const rows = errorFrom(await query, 'Não foi possível localizar a oferta nas suas bases.') || [];
          ensureActor(actor);
          return rows[0] || null;
        }
        if (workspaceId) { const selected = await find(workspaceId); if (selected) return selected; }
        return find(null);
      },
      async listOfferObservations({ offerId, after, signal } = {}) {
        const actor = authenticatedActor();
        let query = supabaseClient.from('hunt_offers')
          .select('hunt_id,offer_id,workspace_id,observed_score,observed_priority,observed_signals,observed_at')
          .eq('offer_id', requireWorkspaceId(offerId));
        if (after) query = query.gt('observed_at', dateCursor(after));
        query = query.order('observed_at', { ascending: false }).order('hunt_id', { ascending: true }).limit(200);
        if (signal) query = query.abortSignal(signal);
        const rows = errorFrom(await query, 'Não foi possível consultar as coletas desta oferta.') || [];
        ensureActor(actor);
        return rows;
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
      sendPasswordReset: unavailable, verifyPasswordRecovery: unavailable, updatePassword: unavailable, signOut: unavailable, listWorkspaces: unavailable, hasPaidAccess: unavailable,
      getLatestHunt: unavailable, listOffers: unavailable, importHunt: unavailable, updateOfferDecision: unavailable, createHuntSignedUrl: unavailable,
      listFavorites: unavailable, favoriteOffer: unavailable, removeFavorite: unavailable, markFavoriteReviewed: unavailable,
      createOfferShare: unavailable, resolveOfferShare: unavailable, findSharedOffer: unavailable, listOfferObservations: unavailable
    };
  }

  global.AferoCloud = Object.freeze({ validateConfig, create });
}(window));

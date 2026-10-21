let tokenPromise: Promise<string> | undefined;

function csrfToken() {
  tokenPromise ??= globalThis.fetch('/api/local-security/csrf', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('Не удалось подготовить защищённый запрос.');
      const payload = await response.json() as { token?: string };
      if (!payload.token || !/^[a-f0-9]{64}$/.test(payload.token)) throw new Error('Некорректный ответ защиты запроса.');
      return payload.token;
    }).catch(error => { tokenPromise = undefined; throw error; });
  return tokenPromise;
}

async function csrfRejected(response: Response) {
  if (response.status !== 403) return false;
  const text = await response.clone().text();
  if (text === 'Invalid CSRF token') return true;
  try { return JSON.parse(text)?.error?.code === 'csrf_invalid'; }
  catch { return false; }
}

export async function secureFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
  if (target.origin !== window.location.origin) throw new Error('Запрос с учётными данными разрешён только к текущему приложению.');
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const tokenRequest = !['GET', 'HEAD', 'OPTIONS'].includes(method) ? csrfToken() : undefined;
  if (tokenRequest) headers.set('X-CSRF-Token', await tokenRequest);
  const response = await globalThis.fetch(input, { ...init, headers, credentials: 'same-origin' });
  if (!tokenRequest || !(await csrfRejected(response))) return response;
  if (tokenPromise === tokenRequest) tokenPromise = undefined;
  // Only an explicit pre-handler CSRF refusal is replayable. Streams and
  // Request bodies may already be consumed; leave them for an explicit retry.
  if (input instanceof Request || init.body instanceof ReadableStream) return response;
  headers.set('X-CSRF-Token', await csrfToken());
  return globalThis.fetch(input, { ...init, headers, credentials: 'same-origin' });
}

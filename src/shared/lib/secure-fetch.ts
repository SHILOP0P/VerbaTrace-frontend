let tokenPromise: Promise<string> | undefined;

async function csrfToken() {
  tokenPromise ??= globalThis.fetch('/api/local-security/csrf', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => {
      if (!response.ok) throw new Error('Не удалось подготовить защищённый запрос.');
      const payload = await response.json() as { token?: string };
      if (!payload.token || !/^[a-f0-9]{64}$/.test(payload.token)) throw new Error('Некорректный ответ защиты запроса.');
      return payload.token;
    }).catch(error => { tokenPromise = undefined; throw error; });
  return tokenPromise;
}

export async function secureFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const target = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
  if (target.origin !== window.location.origin) throw new Error('Запрос с учётными данными разрешён только к текущему приложению.');
  const headers = new Headers(init.headers);
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', await csrfToken());
  return globalThis.fetch(input, { ...init, headers, credentials: 'same-origin' });
}

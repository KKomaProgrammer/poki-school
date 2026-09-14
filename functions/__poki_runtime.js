export function onRequest() {
  const js = String.raw`(() => {
  'use strict';
  const tag = document.currentScript;
  if (!tag || window.__pokiSchoolRuntimeInstalled) return;
  window.__pokiSchoolRuntimeInstalled = true;

  const PAGE_ORIGIN = location.origin;
  const POKI_PREFIX = '/__poki_host/';
  const EXTERNAL_PREFIX = '/__external_host/';
  const upstream = tag.dataset.upstream || 'https://poki.com/';
  const currentBase = tag.dataset.currentBase || PAGE_ORIGIN;
  const currentHost = String(tag.dataset.currentHost || '').toLowerCase();

  function proxify(value) {
    if (value == null) return value;
    const raw = value instanceof URL ? value.href : String(value);
    if (!raw || /^(?:data|blob|javascript|about|mailto|tel):/i.test(raw)) return value;

    let u;
    try { u = new URL(raw, upstream); } catch (_) { return value; }

    if (u.origin === PAGE_ORIGIN) {
      if (u.pathname.startsWith(POKI_PREFIX) || u.pathname.startsWith(EXTERNAL_PREFIX)) return u.href;
      if (currentHost && currentHost !== 'poki.com') {
        return String(currentBase).replace(/\/$/, '') + u.pathname + u.search + u.hash;
      }
      return u.href;
    }

    if (String(u.hostname).toLowerCase() !== currentHost) return value;
    return String(currentBase).replace(/\/$/, '') + u.pathname + u.search + u.hash;
  }

  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function(input, init) {
      try {
        if (input instanceof Request) {
          const next = proxify(input.url);
          if (next !== input.url) input = new Request(next, input);
        } else input = proxify(input);
      } catch (_) {}
      return nativeFetch.call(this, input, init);
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    const args = Array.from(arguments);
    args[1] = proxify(url);
    return nativeOpen.apply(this, args);
  };

  const attrs = new Set(['src', 'href', 'action', 'poster', 'data']);
  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    const lower = String(name).toLowerCase();
    if (attrs.has(lower)) value = proxify(value);
    return nativeSetAttribute.call(this, name, value);
  };
})();`;

  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    }
  });
}

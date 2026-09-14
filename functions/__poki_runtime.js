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
  const currentBase = String(tag.dataset.currentBase || PAGE_ORIGIN).replace(/\/$/, '');
  const currentHost = String(tag.dataset.currentHost || '').toLowerCase();
  let proxyMap = {};
  try { proxyMap = JSON.parse(tag.dataset.proxyMap || '{}') || {}; } catch (_) {}
  if (currentHost) proxyMap[currentHost] = currentBase;

  function mappedBase(hostname) {
    const host = String(hostname || '').toLowerCase();
    return proxyMap[host] ? String(proxyMap[host]).replace(/\/$/, '') : '';
  }

  function pokiBase(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (host === 'poki.com') return PAGE_ORIGIN;
    if (host.endsWith('.poki.com')) return PAGE_ORIGIN + POKI_PREFIX + encodeURIComponent(host);
    return '';
  }

  function proxify(value) {
    if (value == null) return value;
    const raw = value instanceof URL ? value.href : String(value);
    if (!raw || /^(?:data|blob|javascript|about|mailto|tel):/i.test(raw)) return value;

    let u;
    try { u = new URL(raw, upstream); } catch (_) { return value; }

    if (u.origin === PAGE_ORIGIN) {
      if (u.pathname.startsWith(POKI_PREFIX) || u.pathname.startsWith(EXTERNAL_PREFIX)) return u.href;
      if (currentHost && currentHost !== 'poki.com') {
        return currentBase + u.pathname + u.search + u.hash;
      }
      return u.href;
    }

    if (u.protocol !== 'https:') return value;

    const builtin = pokiBase(u.hostname);
    if (builtin) return builtin + u.pathname + u.search + u.hash;

    const base = mappedBase(u.hostname);
    if (!base) return value;
    return base + u.pathname + u.search + u.hash;
  }

  function patchUrlSetter(proto, prop) {
    try {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(proto, prop, {
        configurable: desc.configurable,
        enumerable: desc.enumerable,
        get: desc.get,
        set(value) { return desc.set.call(this, proxify(value)); }
      });
    } catch (_) {}
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

  if (navigator.sendBeacon) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      return nativeBeacon(proxify(url), data);
    };
  }

  const attrs = new Set(['src', 'href', 'action', 'poster', 'data']);
  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    const lower = String(name).toLowerCase();
    if (attrs.has(lower)) value = proxify(value);
    return nativeSetAttribute.call(this, name, value);
  };

  [
    [HTMLImageElement, 'src'],
    [HTMLScriptElement, 'src'],
    [HTMLIFrameElement, 'src'],
    [HTMLLinkElement, 'href'],
    [HTMLAnchorElement, 'href'],
    [HTMLFormElement, 'action'],
    [HTMLSourceElement, 'src'],
    [HTMLVideoElement, 'src'],
    [HTMLVideoElement, 'poster'],
    [HTMLAudioElement, 'src'],
    [HTMLObjectElement, 'data']
  ].forEach(([ctor, prop]) => {
    if (ctor && ctor.prototype) patchUrlSetter(ctor.prototype, prop);
  });

  if (window.EventSource) {
    const NativeEventSource = window.EventSource;
    window.EventSource = function(url, config) {
      return new NativeEventSource(proxify(url), config);
    };
    window.EventSource.prototype = NativeEventSource.prototype;
  }
})();`;

  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    }
  });
}

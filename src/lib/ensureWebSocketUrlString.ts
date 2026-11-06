// Simli's LiveKit signaling passes a URL instance (`new URL(...)`) to `new WebSocket(url)`.
// Embedded preview environments (such as AI Studio's iframe wrapper) intercept WebSocket
// via a read-only getter on `window` and call `url.startsWith(...)`, assuming `url` is a string.
// Delegating string methods on `URL.prototype` to `this.href` allows `new WebSocket(new URL(...))`
// to pass those checks cleanly without mutating a getter-only `window.WebSocket`.

export function installWebSocketUrlStringShim(): void {
  if (typeof URL !== "undefined" && typeof URL.prototype === "object") {
    const proto = URL.prototype as unknown as Record<string, unknown>;
    if (typeof proto.startsWith !== "function") {
      Object.defineProperties(URL.prototype, {
        startsWith: {
          value(this: URL, searchString: string, position?: number) {
            return this.href.startsWith(searchString, position);
          },
          configurable: true,
          writable: true,
        },
        endsWith: {
          value(this: URL, searchString: string, endPosition?: number) {
            return this.href.endsWith(searchString, endPosition);
          },
          configurable: true,
          writable: true,
        },
        includes: {
          value(this: URL, searchString: string, position?: number) {
            return this.href.includes(searchString, position);
          },
          configurable: true,
          writable: true,
        },
        replace: {
          value(this: URL, searchValue: string | RegExp, replaceValue: string) {
            return this.href.replace(searchValue, replaceValue);
          },
          configurable: true,
          writable: true,
        },
        indexOf: {
          value(this: URL, searchString: string, position?: number) {
            return this.href.indexOf(searchString, position);
          },
          configurable: true,
          writable: true,
        },
        slice: {
          value(this: URL, start?: number, end?: number) {
            return this.href.slice(start, end);
          },
          configurable: true,
          writable: true,
        },
        trim: {
          value(this: URL) {
            return this.href.trim();
          },
          configurable: true,
          writable: true,
        },
      });
    }
  }
}

installWebSocketUrlStringShim();

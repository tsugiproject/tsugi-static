# tsugi-spa.md

**Design + Usage Notes for `tsugi-spa.js`**

This document explains what `tsugi-spa.js` does, how to configure it, and which invariants must be preserved if it is modified in the future (by humans or AI tools).

---

## What `tsugi-spa.js` is

`tsugi-spa.js` is a **single JS file** that provides two independent capabilities:

1. **Cookieless session propagation (“trans_sid-like”)** *(optional)*
2. **JS-first CSRF support** *(recommended)*

Both are designed for Tsugi-style applications that can operate in:

* **cookie mode** (LMS UI pages using `PHPSESSID` cookies), and/or
* **cookieless mode** (embedded tool pages using URL params / headers)

The file is intended to be safe to run during a **migration period** where:

* some servers still do server-side `trans_sid` rewriting (pre–PHP 9), and
* other servers do not (post–PHP 9).

---

## High-level behavior

### A) TRANS_SID (optional)

If configured (requires `window.TRANS_SID.name` and `window.TRANS_SID.value`), the script:

* rewrites navigation elements to include a session parameter:

  * `<a href>`
  * `<form method="get" action>`
  * `<iframe src>`
* injects a hidden field into `<form method="post">` (within the same tight scope)
* monkey-patches `fetch()` to attach a header (default `X-Trans-Sid`) for eligible requests

**Crucial constraint:** rewriting is limited to *configured path prefixes* and whitelisted hosts.

### B) CSRF (independent)

If configured with a token (via `<meta name="csrf-token">` or `window.CSRF_TOKEN`), the script:

* injects a hidden CSRF field into **all POST forms** (unless opted out)
* adds an `X-CSRF` header on `fetch()` calls

CSRF does **not** depend on TRANS_SID being enabled and works for:

* cookie-based sessions (LMS pages)
* cookieless sessions (tool pages)

---

## Why one file

`tsugi-spa.js` installs **exactly one** `fetch()` wrapper, to avoid “double monkey patch” issues where multiple wrappers accidentally drop headers or change request behavior.

Both TRANS_SID and CSRF add headers through this single wrapper.

---

## Configuration

### 1) TRANS_SID (optional)

If `name` and `value` are missing/empty, TRANS_SID features are disabled and CSRF still works.

Example:

```javascript
window.TRANS_SID = {
  name: "_LTI_TSUGI",
  value: "ec93fe964ac8d8aecdbb167fee5bf0f9",

  // Tight tool scope (do NOT use "/")
  pathPrefixes: ["/mod/tdiscus/"],

  // Exact host match (defaults to [location.host])
  hostWhitelist: ["www.py4e.com"],
  iframeWhitelist: ["www.py4e.com"],

  // Opt-out subtree
  optOutAttr: "data-no-trans-sid",

  // Idempotency across pre/post PHP9:
  alreadyPresentParams: ["_LTI_TSUGI", "PHPSESSID", "SID"],
  alreadyPresentPostFields: ["_LTI_TSUGI", "PHPSESSID", "SID"],

  fetch: {
    enabled: true,
    headerName: "X-Trans-Sid",
    addQueryParam: false,
    alreadyPresentHeaders: ["X-Trans-Sid", "Authorization"],
    excludePathPrefixes: ["/static/", "/assets/"],
    optOutFlag: "__transSidOptOut"
  },

  debug: false
};
```

**Notes**

* `pathPrefixes` should be very tight (example: `["/mod/tdiscus/"]`).
  This prevents leaking `_LTI_TSUGI` to unrelated paths on the same domain.
* Whitelists are **exact hostname matches**.
* `alreadyPresentParams` makes the script **safe when the server already rewrote URLs**.

---

### 2) CSRF (recommended)

CSRF requires a token exposed to JS via one of:

* `<meta name="csrf-token" content="...">`, or
* `window.CSRF_TOKEN = "..."`

Example:

```html
<meta name="csrf-token" content="...">
```

Optional config:

```javascript
window.CSRF = {
  enabled: true,
  tokenMetaName: "csrf-token",
  tokenGlobalName: "CSRF_TOKEN",
  fieldName: "csrf",
  headerName: "X-CSRF",
  optOutAttr: "data-no-csrf",
  debug: false
};
```

If no token is present, CSRF injection is skipped automatically.

---

## Opt-out mechanism

Two independent opt-out attributes exist:

* `data-no-trans-sid` prevents TRANS_SID rewriting inside a subtree
* `data-no-csrf` prevents CSRF injection inside a subtree

Examples:

```html
<div data-no-trans-sid>
  <a href="/mod/tdiscus/logout">will NOT get _LTI_TSUGI</a>
</div>

<div data-no-csrf>
  <form method="post" action="/dangerous">will NOT get CSRF hidden input</form>
</div>
```

---

## Idempotency guarantees

`tsugi-spa.js` is designed to avoid double-patching.

### TRANS_SID URL rewriting

If the URL already contains any param in `alreadyPresentParams`, no additional param is appended.

### TRANS_SID POST injection

If a POST form already contains a hidden field with any name in `alreadyPresentPostFields`, no additional field is injected.

### Fetch headers

If a request already has any header in `alreadyPresentHeaders`, the TRANS_SID header is not added.

This is specifically to support a transition period where the server may still be doing server-side trans_sid behavior.

---

## Dynamic content support

The script uses `MutationObserver` and also “last moment” handlers:

* click handler to rewrite `<a>` right before navigation
* submit handler to ensure POST forms have required hidden fields

This covers both server-rendered pages and pages that insert elements dynamically.

---

## Server-side expectations

### CSRF verification

Server should accept CSRF tokens from:

* POST field: `CSRF.fieldName` (default `csrf`)
* header: `CSRF.headerName` (default `X-CSRF`)

### Cookieless session identification (tools)

Server should accept session ids from:

* header: `TRANS_SID.fetch.headerName` (default `X-Trans-Sid`) — preferred
* query parameter: `TRANS_SID.name`

---

## Recommended security headers

If session identifiers ever appear in URLs, strongly consider:

* `Referrer-Policy: strict-origin-when-cross-origin`
* `Cache-Control: private, no-store`

---

## Invariants (do not break)

If this file is modified, preserve these invariants:

1. TRANS_SID rewriting remains **tightly scoped** by `pathPrefixes`.
2. Session tokens are never added to non-whitelisted hosts.
3. The script remains safe to run with server-side trans_sid enabled (idempotent).
4. POST URLs remain clean (POST uses hidden fields; URL rewriting is for navigation).
5. Only **one** `fetch()` wrapper is installed.

---

## Summary

`tsugi-spa.js` provides a pragmatic, JS-first bridge across:

* cookie vs cookieless session operation
* pre–PHP 9 vs post–PHP 9 servers
* classic server-rendered pages + dynamic DOM

It deliberately favors predictability and “tight scoping” to avoid the historic problems associated with global trans_sid rewriting.



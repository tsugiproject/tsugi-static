# tsugi-spa.md

**Design and Usage Guide for `tsugi-spa.js` (Guard + Onload + Dry-Run)**

---

# What this file is

`tsugi-spa.js` is a **single JavaScript file** that can provide two independent, optional capabilities:

1. **TRANS_SID** — controlled, browser-side “trans_sid-like” cookieless session propagation
2. **CSRF** — JavaScript-first CSRF protection (POST form injection + fetch header)

It is designed for Tsugi systems that operate as both:

* an **LMS** (cookie session via `PHPSESSID`)
* a **tool platform** (sometimes cookieless / embedded)

It is also designed to support a **transition period** where the same codebase must run on:

* servers that still do server-side `trans_sid` rewriting (pre–PHP 9), and
* servers that do not (post–PHP 9).

---

# Load behavior: Guard + Onload

## DOMContentLoaded only

The script runs only after **DOMContentLoaded**.

## Hard guard (does nothing unless configured)

On DOMContentLoaded it checks whether at least one feature is fully configured:

### TRANS_SID is “fully configured” only if:

* `window.TRANS_SID.name` is non-empty
* `window.TRANS_SID.value` is non-empty
* `window.TRANS_SID.pathPrefixes` has at least one entry

### CSRF is “fully configured” only if:

* CSRF is enabled (default: enabled), AND
* a CSRF token is available via:

  * `<meta name="csrf-token" content="...">`, OR
  * `window.CSRF_TOKEN` (or the configured `tokenGlobalName`)

### If neither is fully configured:

**The file exits immediately and has zero side effects:**

* no MutationObserver
* no submit/click handlers
* no fetch() monkey patch
* no DOM rewriting

This makes it safe to include `tsugi-spa.js` globally without “mystery behavior.”

---

# Dry-run mode (shadow rollout)

Both features support **dry-run mode**, intended for learning/testing:

* it logs what it **would** change
* it does not mutate DOM URLs or form fields
* it does not add headers/query params to requests

This is useful during migration:

* run your legacy behavior first
* load `tsugi-spa.js` afterwards in dry-run to see what it would have done
* then switch to active mode later

---

# Feature 1: TRANS_SID (optional)

## Purpose

TRANS_SID provides a controlled replacement for PHP’s historic `trans_sid` URL rewriting, but with tight scope control.

## Behavior (when enabled)

TRANS_SID can:

1. rewrite navigation URLs by appending a query parameter:

* `<a href>`
* `<form method="get" action>`
* `<iframe src>`

2. inject a hidden field into POST forms:

* `<form method="post">`

3. add a header on eligible fetch() calls:

* `X-Trans-Sid: <session value>`

## Scope controls

TRANS_SID rewriting occurs only if:

* the destination host matches `hostWhitelist` / `iframeWhitelist`
* the path begins with one of `pathPrefixes`

This prevents session leakage to unrelated paths.

---

## Example configuration

```javascript
window.TRANS_SID = {
  name: "_LTI_TSUGI",
  value: "ec93fe964ac8d8aecdbb167fee5bf0f9",

  // Tight scope - do NOT use "/"
  pathPrefixes: ["/mod/tdiscus/"],

  hostWhitelist: ["www.py4e.com"],
  iframeWhitelist: ["www.py4e.com"],

  // Migration idempotency: if any already present, do not add again
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

  debug: true,
  dryRun: true
};
```

---

## Opt-out for TRANS_SID

Disable TRANS_SID behavior in a DOM subtree:

```html
<div data-no-trans-sid>...</div>
```

(You may customize the attribute name via `optOutAttr`.)

---

# Feature 2: CSRF (independent of TRANS_SID)

## Purpose

CSRF injection works for both:

* cookie sessions (`PHPSESSID`)
* cookieless sessions (tools)

CSRF does not depend on TRANS_SID.

## Token sources

A token must be exposed to JavaScript via either:

### Meta tag (preferred)

```html
<meta name="csrf-token" content="...">
```

### Global variable

```javascript
window.CSRF_TOKEN = "...";
```

## Behavior (when enabled)

CSRF can:

1. inject a hidden field into all POST forms:

* `<input type="hidden" name="csrf" value="...">`

2. add a header to state-changing fetch() calls (POST, PUT, DELETE, PATCH — not GET, HEAD, OPTIONS; see Fetch wrapper):

* `X-CSRF: <token>`

---

## Example configuration

```javascript
window.CSRF = {
  enabled: true,
  tokenMetaName: "csrf-token",
  tokenGlobalName: "CSRF_TOKEN",
  fieldName: "csrf",
  headerName: "X-CSRF",
  optOutAttr: "data-no-csrf",
  fetch: {
    optOutFlag: "__csrfOptOut",    // per-call: fetch(url, { __csrfOptOut: true })
    // Scope (when only CSRF enabled; when both enabled, inherits from TRANS_SID):
    // hostWhitelist: ["www.example.com"],
    // pathPrefixes: ["/"],
    // excludePathPrefixes: ["/static/", "/assets/"]
  },
  debug: true,
  dryRun: true
};
```

---

## Opt-out for CSRF

### Forms (DOM subtree)

Disable CSRF injection in a subtree via the `data-no-csrf` attribute:

```html
<div data-no-csrf>...</div>
```

(You may customize the attribute name via `optOutAttr`.)

### Fetch (per-call)

For `fetch()` there is no form in the picture, so use a per-call opt-out flag in the init object:

```javascript
fetch("https://external-api.example/data", { __csrfOptOut: true });
```

This skips adding the `X-CSRF` header for that request. Use when calling third-party APIs, CDNs, or other endpoints that do not expect or may reject the header.

Configure the flag name via `CSRF.fetch.optOutFlag` (default: `__csrfOptOut`).

---

# Fetch wrapper

`tsugi-spa.js` installs **one and only one** fetch() wrapper, and only when at least one feature is fully configured.

The wrapper supports:

* TRANS_SID header injection (tight scope, per-call opt-out via `__transSidOptOut`)
* CSRF header injection (scoped — only for state-changing methods POST/PUT/DELETE/PATCH when URL passes allow logic; per-call opt-out via `__csrfOptOut`)

## Fetch scope (both features)

Both TRANS_SID and CSRF only add headers when the fetch URL passes allow processing:

* **Host**: must be in `hostWhitelist` (TRANS_SID provides this when both enabled; CSRF-only defaults to same origin)
* **Path**: must start with one of `pathPrefixes`, and must *not* start with any of `excludePathPrefixes`

When both features are enabled, CSRF fetch reuses TRANS_SID’s scope (hostWhitelist, pathPrefixes, excludePathPrefixes). When only CSRF is enabled, defaults are: same-origin host, all paths (`["/"]`), no exclusions. Override via `CSRF.fetch.hostWhitelist`, `pathPrefixes`, `excludePathPrefixes`.

## Dry-run behavior for fetch

In dry-run mode, the wrapper logs what it *would* add but **does not** mutate headers or query params. The actual `fetch()` still executes, so the request goes through **without** the TRANS_SID or CSRF headers. Authenticated endpoints that require these headers may return 401/403 during dry-run. This is intentional: dry-run is for observing what would change, not for simulating a fully patched request.

## When to use CSRF fetch opt-out

CSRF is added only to fetches whose URLs pass the scope check (requests to our server). External URLs (different host) are excluded by default and do not receive the header. Use `__csrfOptOut: true` only when calling a same-host path that is in scope but should not get the header (e.g. a legacy endpoint that does not expect it).

---

# Compatibility with server-side trans_sid

During migration, the server may already have rewritten URLs and/or injected fields.

TRANS_SID avoids double-patching via:

* `alreadyPresentParams` (URLs)
* `alreadyPresentPostFields` (forms)
* `alreadyPresentHeaders` (fetch)

If any “already present” indicator exists, the script does nothing for that item.

---

# Server-side expectations (recommended)

## Session identification (tools)

Server should accept cookieless sessions via:

1. `X-Trans-Sid` header
2. `_LTI_TSUGI` query parameter (or whatever `TRANS_SID.name` is)

## CSRF verification

Server should accept CSRF tokens via:

1. POST field (`CSRF.fieldName`)
2. header (`CSRF.headerName`)

---

# Security recommendations

If session identifiers ever appear in URLs:

* `Referrer-Policy: strict-origin-when-cross-origin`
* `Cache-Control: private, no-store`

---

# Invariants (do not break)

1. TRANS_SID must remain tightly scoped by `pathPrefixes`.
2. Session identifiers must never be added to non-whitelisted hosts.
3. Idempotency must remain intact for mixed pre/post PHP 9 deployments.
4. POST URLs must remain clean (POST uses hidden inputs).
5. Only one fetch() wrapper may be installed.
6. The guard must keep the file inert unless configured.

---

# Summary

`tsugi-spa.js` is a low-friction way to:

* observe behavior in dry-run mode,
* migrate away from server-side trans_sid safely,
* add CSRF coverage without hand-editing many templates,
* keep cookie and cookieless operation working in one codebase.


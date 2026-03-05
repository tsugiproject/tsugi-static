# trans_sid_design.md

**Design Notes for the Browser-Based `TRANS_SID` System**

## Overview

This repository includes a browser-side mechanism named **`TRANS_SID`** that replaces PHP's historical `session.use_trans_sid` functionality.

The goal is to allow a system to **propagate session identifiers without relying on cookies**, while maintaining compatibility across a transition period where some servers still perform server-side rewriting and others do not.

The implementation is intentionally conservative, predictable, and tightly scoped to avoid the historical problems associated with PHP's built-in `trans_sid`.

---

# Why This Exists

Older versions of PHP could automatically propagate session identifiers in URLs:

```
https://example.com/page.php?PHPSESSID=abc123
```

This behavior was enabled with:

```
session.use_trans_sid = On
```

However the feature has been deprecated and is expected to disappear entirely in **PHP 9.0**.

Many modern applications do not need this feature because they rely on cookies.
This project cannot rely entirely on cookies because it operates in environments such as:

* LMS iframe contexts
* cross-site embedded tools
* strict browser privacy environments

Therefore a **controlled browser-side implementation** replaces the PHP feature.

---

# Architectural Goals

The design prioritizes the following principles:

1. **Predictable behavior**
2. **No accidental session leakage**
3. **Compatibility with server-side rewriting during migration**
4. **Tight URL scoping**
5. **Minimal global state**
6. **Compatibility with server-rendered applications**

---

# Core Mechanism

The system propagates the session identifier through three mechanisms.

## 1. URL Rewriting for Navigation

Eligible navigation elements receive a query parameter:

```
?_LTI_TSUGI=<session value>
```

Affected elements:

* `<a href>`
* `<form method="get">`
* `<iframe src>`

This ensures that session identifiers propagate during page navigation.

---

## 2. Hidden Inputs for POST Forms

POST forms do **not** modify their URLs.

Instead a hidden field is injected:

```
<input type="hidden" name="_LTI_TSUGI" value="...">
```

This preserves clean URLs while still passing the session identifier.

---

## 3. Header Injection for Fetch Requests

All eligible `fetch()` calls receive a header:

```
X-Trans-Sid: <session value>
```

This avoids leaking tokens in URLs for API requests.

---

# URL Scope Control

Unlike PHP's historical behavior, this implementation **never rewrites the entire site**.

URL rewriting is limited to configured path prefixes.

Example configuration:

```
pathPrefixes: ["/mod/tdiscus/"]
```

Only URLs beginning with that prefix are modified.

Examples:

| URL                       | Behavior      |
| ------------------------- | ------------- |
| `/mod/tdiscus/thread.php` | rewritten     |
| `/mod/tdiscus/`           | rewritten     |
| `/mod/other/`             | not rewritten |
| `/`                       | not rewritten |

This prevents session identifiers from appearing on unrelated pages.

---

# Host Whitelisting

Rewriting only occurs when the destination host is explicitly allowed.

Example:

```
hostWhitelist: ["www.py4e.com"]
```

For iframes:

```
iframeWhitelist: ["www.py4e.com"]
```

This prevents session identifiers from leaking to third-party sites.

---

# Compatibility with Server-Side Rewriting

The system must function during a migration period where servers may still perform `trans_sid`.

To support this, the script is **idempotent**.

It detects the presence of existing session indicators and refuses to add duplicates.

Indicators include:

### Query Parameters

```
alreadyPresentParams
```

Example values:

```
["_LTI_TSUGI", "PHPSESSID", "SID"]
```

If any of these are present in a URL, the script does not modify it.

---

### POST Hidden Fields

```
alreadyPresentPostFields
```

If a form already contains a hidden session field, the script does nothing.

---

### HTTP Headers

```
alreadyPresentHeaders
```

If a fetch request already contains a recognized session header, no additional header is added.

---

# Opt-Out Regions

A subtree of the DOM may disable rewriting entirely using:

```
data-no-trans-sid
```

Example:

```
<div data-no-trans-sid>
    <a href="/logout">Logout</a>
</div>
```

This is useful for:

* logout endpoints
* public pages
* debugging tools
* external redirect handlers

---

# Dynamic Content Handling

The script observes the DOM using `MutationObserver`.

This allows rewriting to occur when elements are dynamically inserted after page load.

---

# Safety Features

The implementation deliberately avoids several risky behaviors.

It does **not**:

* rewrite external links
* rewrite URLs outside configured prefixes
* override existing session parameters
* modify POST URLs
* inject duplicate parameters

These constraints prevent session leakage and unpredictable behavior.

---

# Recommended Server Logic

Servers should accept the session identifier in this order:

```
1. X-Trans-Sid header
2. query parameter
3. POST field
```

This allows the system to support both navigation and API requests.

---

# Example Configuration

```
window.TRANS_SID = {
  name: "_LTI_TSUGI",
  value: "ec93fe964ac8d8aecdbb167fee5bf0f9",

  pathPrefixes: ["/mod/tdiscus/"],

  hostWhitelist: ["www.py4e.com"],
  iframeWhitelist: ["www.py4e.com"],

  alreadyPresentParams: ["_LTI_TSUGI", "PHPSESSID", "SID"],
  alreadyPresentPostFields: ["_LTI_TSUGI", "PHPSESSID", "SID"],

  fetch: {
      enabled: true,
      headerName: "X-Trans-Sid",
      alreadyPresentHeaders: ["X-Trans-Sid", "Authorization"]
  }
};
```

---

# Security Considerations

If session identifiers appear in URLs, the following headers are recommended:

```
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: private, no-store
```

These reduce the risk of session identifiers leaking via referrer headers or caching.

---

# Intended Use

This system is designed for applications that:

* primarily use **server-rendered page navigation**
* operate within **controlled host environments**
* cannot reliably rely on cookies

It is not intended as a general-purpose session management solution for arbitrary websites.

---

# Summary

`TRANS_SID` provides a safe, controlled replacement for PHP's deprecated URL session propagation.

It maintains compatibility across server versions while preventing the problems historically associated with `trans_sid`.

Future modifications should preserve the following invariants:

1. Rewriting must remain tightly scoped.
2. External hosts must never receive session identifiers.
3. The system must remain idempotent with server-side rewriting.
4. POST URLs must remain clean.
5. Header-based propagation must remain supported.

If these rules remain intact, the system will continue to function safely and predictably.


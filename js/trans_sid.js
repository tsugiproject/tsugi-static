<script>
/*
===============================================================================
TRANS_SID (v1): In-browser trans_sid + fetch header marker
-------------------------------------------------------------------------------
Goal
  Provide a controlled, client-side replacement for PHP's historical
  `session.use_trans_sid` URL rewriting so the same codebase can run during a
  transition period:

    • Pre–PHP 9 servers (may still do server-side trans_sid rewriting)
    • Post–PHP 9 servers (no longer rewrite)

Key property: IDEMPOTENT
  This script must be safe to run even if the server already added session
  identifiers. It should "fill gaps" but never double-patch.

What it does
  A) Navigation URL propagation (query param):
      • <a href>          → append ?name=value (when eligible)
      • <form method=get> → append to action
      • <iframe src>      → append to src (whitelist-controlled)

  B) POST form propagation (hidden field only):
      • <form method=post> → ensure hidden <input name=name value=value>

  C) Fetch propagation (header; preferred over query params):
      • window.fetch(...)  → add header (default "X-Trans-Sid") on eligible calls

Eligibility rules (tight scope)
  A URL is eligible only if:
    1) host is in the appropriate whitelist (hostWhitelist / iframeWhitelist)
    2) pathname starts with one of pathPrefixes (tight tool scope)
    3) the element is not inside an opt-out subtree

Idempotency rules (server-side compatibility)
  The script will NOT add query params / hidden fields / headers if ANY of the
  "already present" indicators exist:

    • alreadyPresentParams      (query params already on URL)
    • alreadyPresentPostFields  (hidden inputs already on POST forms)
    • alreadyPresentHeaders     (headers already on fetch requests)

This lets PHP keep doing trans_sid during migration without double-adds.

-------------------------------------------------------------------------------
CONFIG (single global object)
-------------------------------------------------------------------------------
Define BEFORE this script runs:

window.TRANS_SID = {
  // REQUIRED
  name:  "_LTI_TSUGI",
  value: "ec93fe964ac8d8aecdbb167fee5bf0f9",

  // REQUIRED: tight prefixes (avoid "/")
  pathPrefixes: ["/mod/tdiscus/"],

  // Optional (defaults to [location.host])
  hostWhitelist:   ["www.py4e.com"],
  iframeWhitelist: ["www.py4e.com"],

  // Optional: disable rewriting within subtree
  optOutAttr: "data-no-trans-sid",

  // Transition-period idempotency helpers:
  // Treat any of these query params as "session already present".
  alreadyPresentParams: ["_LTI_TSUGI", "PHPSESSID", "SID"],

  // Treat any of these hidden POST inputs as "already has session".
  alreadyPresentPostFields: ["_LTI_TSUGI", "PHPSESSID", "SID"],

  fetch: {
    enabled: true,

    // Header to add for eligible fetch calls
    headerName: "X-Trans-Sid",

    // If true, also add query param to fetch URLs (usually false)
    addQueryParam: false,

    // Skip adding header if ANY of these headers are already present
    // (e.g., if some code uses Authorization instead)
    alreadyPresentHeaders: ["X-Trans-Sid", "Authorization"],

    // Optional: never touch these paths (after prefix allow)
    excludePathPrefixes: ["/static/", "/assets/"],

    // Per-call opt-out flag:
    // fetch(url, { __transSidOptOut: true })
    optOutFlag: "__transSidOptOut"
  },

  debug: false
};

-------------------------------------------------------------------------------
OPT-OUT EXAMPLE
-------------------------------------------------------------------------------
<div data-no-trans-sid>
  <a href="/mod/tdiscus/logout">won't be rewritten</a>
</div>

-------------------------------------------------------------------------------
SERVER RECOMMENDATION
-------------------------------------------------------------------------------
On requests that matter, check in this order:
  1) X-Trans-Sid header (preferred)
  2) query param(s) (name / PHPSESSID / SID during migration)
  3) POST field(s)

-------------------------------------------------------------------------------
SECURITY NOTE
-------------------------------------------------------------------------------
If tokens appear in URLs, strongly consider:
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: private, no-store
===============================================================================
*/

(() => {
  const cfg = window.TRANS_SID || {};

  // Avoid double-install if script is included twice
  if (cfg._installed) return;
  cfg._installed = true;

  const NAME  = (cfg.name  || "").trim();
  const VALUE = (cfg.value || "").trim();
  if (!NAME || !VALUE) return;

  const DEBUG = !!cfg.debug;
  const OPT_OUT_ATTR = (cfg.optOutAttr || "data-no-trans-sid").trim();

  // Prefixes may be string or array; default is "rewrite nothing" (safe)
  const PATH_PREFIXES = (() => {
    if (Array.isArray(cfg.pathPrefixes)) return cfg.pathPrefixes.map(s => String(s)).filter(Boolean);
    if (typeof cfg.pathPrefixes === "string" && cfg.pathPrefixes.trim()) return [cfg.pathPrefixes.trim()];
    return [];
  })();

  const HOST_WHITELIST = Array.isArray(cfg.hostWhitelist) ? cfg.hostWhitelist.map(String).filter(Boolean) : [location.host];
  const IFRAME_WHITELIST = Array.isArray(cfg.iframeWhitelist) ? cfg.iframeWhitelist.map(String).filter(Boolean) : HOST_WHITELIST;

  // Idempotency param/field lists
  const PRESENT_PARAMS = Array.isArray(cfg.alreadyPresentParams)
    ? cfg.alreadyPresentParams.map(String).filter(Boolean)
    : [NAME];

  const PRESENT_POST_FIELDS = Array.isArray(cfg.alreadyPresentPostFields)
    ? cfg.alreadyPresentPostFields.map(String).filter(Boolean)
    : [NAME];

  // fetch config
  const fcfg = cfg.fetch || {};
  const FETCH_ENABLED = fcfg.enabled !== false;
  const FETCH_HEADER = (fcfg.headerName || "X-Trans-Sid").trim();
  const FETCH_ADD_QUERY = !!fcfg.addQueryParam;
  const FETCH_PRESENT_HEADERS = Array.isArray(fcfg.alreadyPresentHeaders)
    ? fcfg.alreadyPresentHeaders.map(String).filter(Boolean)
    : [FETCH_HEADER];

  const FETCH_EXCLUDE_PREFIXES = Array.isArray(fcfg.excludePathPrefixes)
    ? fcfg.excludePathPrefixes.map(String).filter(Boolean)
    : [];

  const FETCH_OPT_OUT_FLAG = (fcfg.optOutFlag || "__transSidOptOut").trim();

  const log = (...args) => { if (DEBUG) console.log("[trans_sid]", ...args); };

  // ---- Helpers --------------------------------------------------------------

  const hasOptOut = (el) => !!(el && el.closest && el.closest(`[${OPT_OUT_ATTR}]`));

  const safeUrl = (raw) => { try { return new URL(raw, location.href); } catch { return null; } };

  const isAllowedHost = (url, whitelist) => whitelist.includes(url.host);

  // Tight prefix match.
  // NOTE: If you configure "/mod/tdiscus/" then "/mod/tdiscus" won't match.
  // If you want both, include both variants in pathPrefixes.
  const isInScopePath = (url) => {
    if (!PATH_PREFIXES.length) return false;
    return PATH_PREFIXES.some(p => url.pathname.startsWith(p));
  };

  const hasAnyParam = (url, names) => names.some(n => url.searchParams.has(n));

  const isExcludedFetchPath = (url) =>
    FETCH_EXCLUDE_PREFIXES.some(p => url.pathname.startsWith(p));

  const shouldConsiderUrl = (url, whitelist) => {
    if (!url) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!isAllowedHost(url, whitelist)) return false;
    if (!isInScopePath(url)) return false;
    return true;
  };

  // For rewriting, we also require that none of the "present params" exist already.
  const shouldRewriteUrl = (url, whitelist) => {
    if (!shouldConsiderUrl(url, whitelist)) return false;
    if (hasAnyParam(url, PRESENT_PARAMS)) return false; // idempotency
    return true;
  };

  const addParamToUrlString = (raw, whitelist) => {
    const url = safeUrl(raw);
    if (!shouldRewriteUrl(url, whitelist)) return raw;
    url.searchParams.set(NAME, VALUE);
    return url.toString();
  };

  // ---- DOM rewriting --------------------------------------------------------

  const rewriteAnchor = (a) => {
    if (!a || !a.getAttribute || hasOptOut(a)) return;
    const href = a.getAttribute("href");
    if (!href) return;

    const lower = href.trim().toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) return;
    if (href.trim().startsWith("#")) return;

    const next = addParamToUrlString(href, HOST_WHITELIST);
    if (next !== href) {
      a.setAttribute("href", next);
      log("<a>", href, "->", next);
    }
  };

  const formHasAnyHiddenField = (f, names) => {
    for (const n of names) {
      // Keep this simple: hidden inputs only
      const sel = `input[type="hidden"][name="${CSS.escape(n)}"]`;
      if (f.querySelector(sel)) return true;
    }
    return false;
  };

  const rewriteForm = (f) => {
    if (!f || !f.getAttribute || hasOptOut(f)) return;
    const method = (f.getAttribute("method") || "get").toLowerCase();

    if (method === "post") {
      // Idempotency: if any "present post field" exists, do nothing.
      // This allows server-side code (pre-PHP9) to already inject fields.
      if (formHasAnyHiddenField(f, PRESENT_POST_FIELDS)) return;

      // Ensure our hidden field exists
      let inp = f.querySelector(`input[type="hidden"][name="${CSS.escape(NAME)}"]`);
      if (!inp) {
        inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = NAME;
        f.appendChild(inp);
      }
      inp.value = VALUE;
      return;
    }

    // GET: rewrite action (or default to current URL)
    const action = f.getAttribute("action") || (location.pathname + location.search);
    const next = addParamToUrlString(action, HOST_WHITELIST);
    if (next !== action) {
      f.setAttribute("action", next);
      log("<form GET>", action, "->", next);
    }
  };

  const rewriteIframe = (ifr) => {
    if (!ifr || !ifr.getAttribute || hasOptOut(ifr)) return;
    const src = ifr.getAttribute("src");
    if (!src) return;

    const next = addParamToUrlString(src, IFRAME_WHITELIST);
    if (next !== src) {
      ifr.setAttribute("src", next);
      log("<iframe>", src, "->", next);
    }
  };

  const rewriteAll = (root) => {
    if (!root || !(root instanceof Element || root === document)) return;

    // include root itself if it matches
    if (root instanceof HTMLAnchorElement && root.hasAttribute("href")) rewriteAnchor(root);
    if (root instanceof HTMLFormElement) rewriteForm(root);
    if (root instanceof HTMLIFrameElement && root.hasAttribute("src")) rewriteIframe(root);

    const q = (sel) => (root === document ? document.querySelectorAll(sel) : root.querySelectorAll(sel));
    q(`a[href]:not([${OPT_OUT_ATTR}])`).forEach(rewriteAnchor);
    q(`form:not([${OPT_OUT_ATTR}])`).forEach(rewriteForm);
    q(`iframe[src]:not([${OPT_OUT_ATTR}])`).forEach(rewriteIframe);
  };

  // Initial pass
  rewriteAll(document);

  // Safety nets: late clicks/submits and dynamic DOM insertions
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a) rewriteAnchor(a);
  }, true);

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f instanceof HTMLFormElement) rewriteForm(f);
  }, true);

  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (hasOptOut(node)) continue;
        rewriteAll(node);
      }
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // ---- fetch() monkey-patch -------------------------------------------------
  // Adds FETCH_HEADER to eligible fetch calls. Idempotent w.r.t existing headers.

  if (FETCH_ENABLED && typeof window.fetch === "function" && !cfg._fetchWrapped) {
    cfg._fetchWrapped = true;
    const origFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
      // Per-call opt-out:
      // fetch(url, { __transSidOptOut: true })
      if (init && init[FETCH_OPT_OUT_FLAG]) {
        const { [FETCH_OPT_OUT_FLAG]: _drop, ...rest } = init;
        return origFetch(input, rest);
      }

      const url =
        (typeof input === "string") ? safeUrl(input) :
        (input instanceof Request)  ? safeUrl(input.url) :
        null;

      const touch =
        url &&
        shouldConsiderUrl(url, HOST_WHITELIST) &&
        !isExcludedFetchPath(url);

      if (!touch) return origFetch(input, init);

      // Merge headers: Request headers then init.headers override
      const headers = new Headers((input instanceof Request) ? input.headers : undefined);
      if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));

      // Idempotency: if ANY "present header" is already set, do nothing
      const alreadyHas = FETCH_PRESENT_HEADERS.some(h => headers.has(h));
      if (!alreadyHas) headers.set(FETCH_HEADER, VALUE);

      // Optional query param for fetch URLs (usually OFF)
      let newInput = input;
      if (FETCH_ADD_QUERY) {
        if (!hasAnyParam(url, PRESENT_PARAMS)) {
          url.searchParams.set(NAME, VALUE);
        }

        if (typeof input === "string") {
          newInput = url.toString();
        } else if (input instanceof Request) {
          newInput = new Request(url.toString(), input);
        }
      }

      if (newInput instanceof Request) {
        return origFetch(new Request(newInput, { ...init, headers }));
      }
      return origFetch(newInput, { ...init, headers });
    };
  }

  // ---- Small namespaced helpers --------------------------------------------
  // For programmatic navigation:
  cfg.add = (u) => addParamToUrlString(u, HOST_WHITELIST);
  cfg.addIframe = (u) => addParamToUrlString(u, IFRAME_WHITELIST);

})();
</script>

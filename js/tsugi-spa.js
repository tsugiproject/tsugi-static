/*!
 * tsugi-spa.js
 * -----------------------------------------------------------------------------
 * A single-file, JS-first “page-load app helper” for Tsugi-like PHP systems.
 *
 * Purpose:
 *   1) Optional "trans_sid"-style propagation for cookieless sessions:
 *        - rewrite <a href>, <form GET action>, <iframe src> within a tight scope
 *        - inject hidden field into <form POST> within scope
 *        - add X-Trans-Sid header to eligible fetch() calls
 *
 *   2) JS-first CSRF support (independent of trans_sid):
 *        - inject hidden CSRF field into ALL POST forms (unless opted out)
 *        - add X-CSRF header to fetch() calls
 *
 * Key properties:
 *   - Safe if TRANS_SID is not configured (CSRF still works).
 *   - Safe if CSRF is not configured (TRANS_SID can still work).
 *   - Safe to run during migration where PHP server-side trans_sid may still
 *     append session parameters: we avoid double-patching (idempotent).
 *   - Only ONE fetch() monkey-patch is installed (no stacking).
 *
 * -----------------------------------------------------------------------------
 * CONFIGURATION
 * -----------------------------------------------------------------------------
 *
 * A) TRANS_SID (optional)
 *    If you omit TRANS_SID.name/value, all trans-sid features are disabled and
 *    ONLY CSRF features run.
 *
 *    window.TRANS_SID = {
 *      name:  "_LTI_TSUGI",
 *      value: "ec93fe...",
 *
 *      // Tight scope. Do NOT use "/". Example:
 *      pathPrefixes: ["/mod/tdiscus/"],
 *
 *      // Exact hosts allowed for <a>/<form GET> rewriting (default [location.host])
 *      hostWhitelist: ["www.py4e.com"],
 *
 *      // Exact hosts allowed for <iframe src> rewriting (default hostWhitelist)
 *      iframeWhitelist: ["www.py4e.com"],
 *
 *      // Opt-out attribute: disables rewriting in a subtree (default "data-no-trans-sid")
 *      optOutAttr: "data-no-trans-sid",
 *
 *      // Idempotency: if any of these params are already present, we do not add ours
 *      alreadyPresentParams: ["_LTI_TSUGI", "PHPSESSID", "SID"],
 *
 *      // POST hidden-field idempotency: if any of these exist, don't inject trans sid field
 *      alreadyPresentPostFields: ["_LTI_TSUGI", "PHPSESSID", "SID"],
 *
 *      fetch: {
 *        enabled: true,
 *        headerName: "X-Trans-Sid",
 *        addQueryParam: false,
 *        alreadyPresentHeaders: ["X-Trans-Sid", "Authorization"],
 *        excludePathPrefixes: ["/static/", "/assets/"],
 *        optOutFlag: "__transSidOptOut"
 *      },
 *
 *      debug: false
 *    };
 *
 * B) CSRF (optional, but recommended)
 *    CSRF works for both cookie and cookieless modes. It does NOT depend on TRANS_SID.
 *
 *    You must expose the CSRF token to JS via either:
 *      - <meta name="csrf-token" content="...">
 *        OR
 *      - window.CSRF_TOKEN = "..."
 *
 *    window.CSRF = {
 *      enabled: true,
 *      tokenMetaName: "csrf-token",      // meta name attribute (default "csrf-token")
 *      tokenGlobalName: "CSRF_TOKEN",    // window property name (default "CSRF_TOKEN")
 *      fieldName: "csrf",               // hidden input name for POST forms (default "csrf")
 *      headerName: "X-CSRF",            // header name for fetch() (default "X-CSRF")
 *      optOutAttr: "data-no-csrf",       // opt-out subtree attribute (default "data-no-csrf")
 *      debug: false
 *    };
 *
 * -----------------------------------------------------------------------------
 * OPT-OUT EXAMPLES
 * -----------------------------------------------------------------------------
 *   <div data-no-trans-sid> ... </div>   // disables trans_sid rewriting inside
 *   <div data-no-csrf> ... </div>        // disables CSRF injection inside
 *
 * -----------------------------------------------------------------------------
 * SERVER-SIDE EXPECTATIONS (recommended)
 * -----------------------------------------------------------------------------
 *   For CSRF verification accept token from:
 *     - POST field: <fieldName>
 *     - Header: <headerName>
 *
 *   For cookieless session identification accept:
 *     - Header: X-Trans-Sid (preferred)
 *     - Query param: TRANS_SID.name
 *
 * -----------------------------------------------------------------------------
 * SECURITY NOTE
 * -----------------------------------------------------------------------------
 * If session identifiers appear in URLs, consider:
 *   Referrer-Policy: strict-origin-when-cross-origin
 *   Cache-Control: private, no-store
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------
  const isArr = Array.isArray;
  const str = (v) => (v === undefined || v === null) ? "" : String(v);
  const trim = (s) => str(s).trim();

  const safeUrl = (raw) => { try { return new URL(raw, location.href); } catch { return null; } };
  const startsWithAny = (s, prefixes) => prefixes.some(p => s.startsWith(p));

  // ---------------------------------------------------------------------------
  // Config: TRANS_SID (optional)
  // ---------------------------------------------------------------------------
  const TS = window.TRANS_SID || {};
  const TS_NAME  = trim(TS.name);
  const TS_VALUE = trim(TS.value);
  const TS_ENABLED = !!(TS_NAME && TS_VALUE);

  const TS_DEBUG = !!TS.debug;
  const tsLog = (...a) => { if (TS_DEBUG) console.log("[TRANS_SID]", ...a); };

  const TS_OPT_OUT = trim(TS.optOutAttr) || "data-no-trans-sid";

  const TS_PATH_PREFIXES = (() => {
    if (isArr(TS.pathPrefixes)) return TS.pathPrefixes.map(str).filter(Boolean);
    if (trim(TS.pathPrefixes)) return [trim(TS.pathPrefixes)];
    return []; // safest default: rewrite nothing
  })();

  const TS_HOST_WHITELIST = isArr(TS.hostWhitelist)
    ? TS.hostWhitelist.map(str).filter(Boolean)
    : [location.host];

  const TS_IFRAME_WHITELIST = isArr(TS.iframeWhitelist)
    ? TS.iframeWhitelist.map(str).filter(Boolean)
    : TS_HOST_WHITELIST;

  const TS_PRESENT_PARAMS = isArr(TS.alreadyPresentParams)
    ? TS.alreadyPresentParams.map(str).filter(Boolean)
    : (TS_ENABLED ? [TS_NAME] : []);

  const TS_PRESENT_POST_FIELDS = isArr(TS.alreadyPresentPostFields)
    ? TS.alreadyPresentPostFields.map(str).filter(Boolean)
    : (TS_ENABLED ? [TS_NAME] : []);

  const TS_FCFG = TS.fetch || {};
  const TS_FETCH_ENABLED = TS_ENABLED && (TS_FCFG.enabled !== false);
  const TS_FETCH_HEADER = trim(TS_FCFG.headerName) || "X-Trans-Sid";
  const TS_FETCH_ADD_QUERY = !!TS_FCFG.addQueryParam;
  const TS_FETCH_PRESENT_HEADERS = isArr(TS_FCFG.alreadyPresentHeaders)
    ? TS_FCFG.alreadyPresentHeaders.map(str).filter(Boolean)
    : [TS_FETCH_HEADER];
  const TS_FETCH_EXCLUDE_PREFIXES = isArr(TS_FCFG.excludePathPrefixes)
    ? TS_FCFG.excludePathPrefixes.map(str).filter(Boolean)
    : [];
  const TS_FETCH_OPT_OUT_FLAG = trim(TS_FCFG.optOutFlag) || "__transSidOptOut";

  // TRANS_SID helpers (only meaningful if enabled)
  const tsHasOptOut = (el) => !!(el && el.closest && el.closest(`[${TS_OPT_OUT}]`));
  const tsAllowedHost = (url, wl) => wl.includes(url.host);
  const tsInScopePath = (url) => TS_PATH_PREFIXES.length && startsWithAny(url.pathname, TS_PATH_PREFIXES);
  const tsHasAnyParam = (url, names) => names.some(n => url.searchParams.has(n));
  const tsShouldConsiderUrl = (url, wl) =>
    !!url &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    tsAllowedHost(url, wl) &&
    tsInScopePath(url);

  const tsShouldRewriteUrl = (url, wl) =>
    tsShouldConsiderUrl(url, wl) &&
    !tsHasAnyParam(url, TS_PRESENT_PARAMS);

  const tsAddParamToUrlString = (raw, wl) => {
    const url = safeUrl(raw);
    if (!tsShouldRewriteUrl(url, wl)) return raw;
    url.searchParams.set(TS_NAME, TS_VALUE);
    return url.toString();
  };

  const tsFormHasAnyHiddenField = (form, names) => {
    for (const n of names) {
      if (!n) continue;
      const sel = `input[type="hidden"][name="${CSS.escape(n)}"]`;
      if (form.querySelector(sel)) return true;
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Config: CSRF (optional, independent)
  // ---------------------------------------------------------------------------
  const CS = window.CSRF || {};
  const CS_ENABLED = (CS.enabled !== false);

  const CS_DEBUG = !!CS.debug;
  const csLog = (...a) => { if (CS_DEBUG) console.log("[CSRF]", ...a); };

  const CS_OPT_OUT = trim(CS.optOutAttr) || "data-no-csrf";
  const csHasOptOut = (el) => !!(el && el.closest && el.closest(`[${CS_OPT_OUT}]`));

  const CS_META_NAME = trim(CS.tokenMetaName) || "csrf-token";
  const CS_GLOBAL_NAME = trim(CS.tokenGlobalName) || "CSRF_TOKEN";
  const CS_FIELD = trim(CS.fieldName) || "csrf";
  const CS_HEADER = trim(CS.headerName) || "X-CSRF";

  const csrfToken = (() => {
    // meta first
    const meta = document.querySelector(`meta[name="${CSS.escape(CS_META_NAME)}"]`);
    const m = trim(meta ? meta.getAttribute("content") : "");
    if (m) return m;

    // then window var
    return trim(window[CS_GLOBAL_NAME]);
  })();

  const CS_TOKEN_ENABLED = CS_ENABLED && !!csrfToken;

  // ---------------------------------------------------------------------------
  // DOM rewriting: TRANS_SID
  // ---------------------------------------------------------------------------
  function tsRewriteAnchor(a) {
    if (!TS_ENABLED) return;
    if (!a || !a.getAttribute || tsHasOptOut(a)) return;

    const href = a.getAttribute("href");
    if (!href) return;

    const lower = href.trim().toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) return;
    if (href.trim().startsWith("#")) return;

    const next = tsAddParamToUrlString(href, TS_HOST_WHITELIST);
    if (next !== href) {
      a.setAttribute("href", next);
      tsLog("<a>", href, "->", next);
    }
  }

  function tsRewriteForm(form) {
    if (!TS_ENABLED) return;
    if (!form || !form.getAttribute || tsHasOptOut(form)) return;

    const method = (form.getAttribute("method") || "get").toLowerCase();

    if (method === "post") {
      // Idempotency: if server already injected any known field, leave it alone.
      if (tsFormHasAnyHiddenField(form, TS_PRESENT_POST_FIELDS)) return;

      let inp = form.querySelector(`input[type="hidden"][name="${CSS.escape(TS_NAME)}"]`);
      if (!inp) {
        inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = TS_NAME;
        form.appendChild(inp);
      }
      inp.value = TS_VALUE;
      return;
    }

    // GET: rewrite action (or default to current URL)
    const action = form.getAttribute("action") || (location.pathname + location.search);
    const next = tsAddParamToUrlString(action, TS_HOST_WHITELIST);
    if (next !== action) {
      form.setAttribute("action", next);
      tsLog("<form GET>", action, "->", next);
    }
  }

  function tsRewriteIframe(ifr) {
    if (!TS_ENABLED) return;
    if (!ifr || !ifr.getAttribute || tsHasOptOut(ifr)) return;

    const src = ifr.getAttribute("src");
    if (!src) return;

    const next = tsAddParamToUrlString(src, TS_IFRAME_WHITELIST);
    if (next !== src) {
      ifr.setAttribute("src", next);
      tsLog("<iframe>", src, "->", next);
    }
  }

  // ---------------------------------------------------------------------------
  // DOM rewriting: CSRF (POST forms)
  // ---------------------------------------------------------------------------
  function csEnsurePostFormToken(form) {
    if (!CS_TOKEN_ENABLED) return;
    if (!(form instanceof HTMLFormElement)) return;
    if (csHasOptOut(form)) return;

    const method = (form.getAttribute("method") || "get").toLowerCase();
    if (method !== "post") return;

    let inp = form.querySelector(`input[type="hidden"][name="${CSS.escape(CS_FIELD)}"]`);
    if (!inp) {
      inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = CS_FIELD;
      form.appendChild(inp);
      csLog("injected CSRF field into form", form.action || "(no action)");
    }
    inp.value = csrfToken;
  }

  // ---------------------------------------------------------------------------
  // Shared DOM pass + MutationObserver
  // ---------------------------------------------------------------------------
  function patchSubtree(root) {
    // root can be document or an Element
    if (!root || !(root instanceof Element || root === document)) return;

    // Include root itself if it matches
    if (root instanceof HTMLAnchorElement && root.hasAttribute("href")) tsRewriteAnchor(root);
    if (root instanceof HTMLFormElement) {
      tsRewriteForm(root);
      csEnsurePostFormToken(root);
    }
    if (root instanceof HTMLIFrameElement && root.hasAttribute("src")) tsRewriteIframe(root);

    const q = (sel) => (root === document ? document.querySelectorAll(sel) : root.querySelectorAll(sel));

    // Trans sid rewrites (skip opt-out quickly via selector)
    if (TS_ENABLED) {
      q(`a[href]:not([${TS_OPT_OUT}])`).forEach(tsRewriteAnchor);
      q(`form:not([${TS_OPT_OUT}])`).forEach(tsRewriteForm);
      q(`iframe[src]:not([${TS_OPT_OUT}])`).forEach(tsRewriteIframe);
    }

    // CSRF injection into post forms (skip opt-out)
    if (CS_TOKEN_ENABLED) {
      q(`form:not([${CS_OPT_OUT}])`).forEach(csEnsurePostFormToken);
    }
  }

  // Initial pass
  patchSubtree(document);

  // Submit safety net (form created right before submit)
  document.addEventListener("submit", (e) => {
    if (e.target instanceof HTMLFormElement) {
      tsRewriteForm(e.target);
      csEnsurePostFormToken(e.target);
    }
  }, true);

  // Click safety net (rewrite just-in-time)
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a) tsRewriteAnchor(a);
  }, true);

  // MutationObserver for dynamic content
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;

        // If entire subtree is opted out of both, skip quickly
        if (TS_ENABLED && tsHasOptOut(node) && (!CS_TOKEN_ENABLED || csHasOptOut(node))) continue;

        patchSubtree(node);
      }
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // ---------------------------------------------------------------------------
  // One-and-only fetch() monkey-patch (adds both headers when applicable)
  // ---------------------------------------------------------------------------
  (() => {
    if (window.__TSUGI_SPA_FETCH_WRAPPED__) return;
    if (typeof window.fetch !== "function") return;

    window.__TSUGI_SPA_FETCH_WRAPPED__ = true;

    const origFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
      // Allow a caller to opt out of TRANS_SID header injection on a per-call basis.
      // (CSRF header injection currently has no opt-out flag; add one if you want.)
      const transSidOptOut = !!(init && init[TS_FETCH_OPT_OUT_FLAG]);

      // Remove the opt-out flag before forwarding.
      if (init && init[TS_FETCH_OPT_OUT_FLAG]) {
        const { [TS_FETCH_OPT_OUT_FLAG]: _drop, ...rest } = init;
        init = rest;
      }

      // Determine URL (if possible)
      const url =
        (typeof input === "string") ? safeUrl(input) :
        (input instanceof Request)  ? safeUrl(input.url) :
        null;

      // Merge headers: Request headers then init.headers override
      const headers = new Headers((input instanceof Request) ? input.headers : undefined);
      if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));

      // ---- TRANS_SID header injection (tight scope, optional) ----
      if (TS_FETCH_ENABLED && !transSidOptOut && url) {
        const touch =
          tsShouldConsiderUrl(url, TS_HOST_WHITELIST) &&
          !startsWithAny(url.pathname, TS_FETCH_EXCLUDE_PREFIXES);

        if (touch) {
          const already = TS_FETCH_PRESENT_HEADERS.some(h => headers.has(h));
          if (!already) headers.set(TS_FETCH_HEADER, TS_VALUE);

          // Optional: add query param to fetch URL (usually false)
          if (TS_FETCH_ADD_QUERY && !tsHasAnyParam(url, TS_PRESENT_PARAMS)) {
            url.searchParams.set(TS_NAME, TS_VALUE);
            if (typeof input === "string") input = url.toString();
            else if (input instanceof Request) input = new Request(url.toString(), input);
          }
        }
      }

      // ---- CSRF header injection (independent, optional) ----
      // If CSRF token is configured, attach it. You can choose to attach only on
      // same-origin, or only for unsafe methods; this version attaches always.
      if (CS_TOKEN_ENABLED) {
        if (!headers.has(CS_HEADER)) headers.set(CS_HEADER, csrfToken);
      }

      // Forward to real fetch
      if (input instanceof Request) {
        return origFetch(new Request(input, { ...init, headers }));
      }
      return origFetch(input, { ...init, headers });
    };
  })();

  // Namespaced helpers (minimal additional globals)
  // Safe even if TS_ENABLED is false: these will just return input unchanged.
  TS.add = (u) => TS_ENABLED ? tsAddParamToUrlString(u, TS_HOST_WHITELIST) : u;
  TS.addIframe = (u) => TS_ENABLED ? tsAddParamToUrlString(u, TS_IFRAME_WHITELIST) : u;

})();

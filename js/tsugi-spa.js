/*!
 * tsugi-spa.js
 * -----------------------------------------------------------------------------
 * One-file helper for Tsugi-style “mostly page-load” apps:
 *   - Optional TRANS_SID (cookieless session propagation)
 *   - Optional CSRF (JS-first CSRF injection + fetch header)
 *
 * NEW BEHAVIOR (guard + onload):
 *   - This file does NOTHING unless it is configured “enough” at load time.
 *   - It waits for DOMContentLoaded before doing any work.
 *   - If neither TRANS_SID nor CSRF is fully configured at that time, it:
 *       • does NOT install MutationObserver
 *       • does NOT monkey-patch fetch()
 *       • does NOT attach click/submit handlers
 *
 * See tsugi-spa.md for usage.
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  const isArr = Array.isArray;
  const str = (v) => (v === undefined || v === null) ? "" : String(v);
  const trim = (s) => str(s).trim();
  const startsWithAny = (s, prefixes) => prefixes.some(p => s.startsWith(p));
  const safeUrl = (raw) => { try { return new URL(raw, location.href); } catch { return null; } };

  // ---------------------------------------------------------------------------
  // Run on DOMContentLoaded (handled onload)
  // ---------------------------------------------------------------------------
  const run = () => {
    // -------------------------------------------------------------------------
    // Read configs at load time
    // -------------------------------------------------------------------------
    const TS = window.TRANS_SID || {};
    const CS = window.CSRF || {};

    // --- TRANS_SID "fully configured" criteria ---
    // We require:
    //   - name + value
    //   - at least one path prefix (tight scoping)
    const TS_NAME  = trim(TS.name);
    const TS_VALUE = trim(TS.value);

    const TS_PATH_PREFIXES = (() => {
      if (isArr(TS.pathPrefixes)) return TS.pathPrefixes.map(str).filter(Boolean);
      if (trim(TS.pathPrefixes)) return [trim(TS.pathPrefixes)];
      return [];
    })();

    const TS_ENABLED = !!(TS_NAME && TS_VALUE && TS_PATH_PREFIXES.length > 0);

    // --- CSRF "fully configured" criteria ---
    // We require a token exposed to JS via:
    //   - <meta name="csrf-token" content="..."> OR
    //   - window.CSRF_TOKEN (or configured tokenGlobalName)
    const CS_ENABLED = (CS.enabled !== false);
    const CS_META_NAME = trim(CS.tokenMetaName) || "csrf-token";
    const CS_GLOBAL_NAME = trim(CS.tokenGlobalName) || "CSRF_TOKEN";

    const csrfToken = (() => {
      const meta = document.querySelector(`meta[name="${CSS.escape(CS_META_NAME)}"]`);
      const m = trim(meta ? meta.getAttribute("content") : "");
      if (m) return m;
      return trim(window[CS_GLOBAL_NAME]);
    })();

    const CS_TOKEN_ENABLED = CS_ENABLED && !!csrfToken;

    // -------------------------------------------------------------------------
    // HARD GUARD: If not configured, do NOTHING (no observers, no fetch patch).
    // -------------------------------------------------------------------------
    if (!TS_ENABLED && !CS_TOKEN_ENABLED) return;

    // Avoid double-install if script is included twice
    if (window.__TSUGI_SPA_INSTALLED__) return;
    window.__TSUGI_SPA_INSTALLED__ = true;

    // -------------------------------------------------------------------------
    // TRANS_SID derived config
    // -------------------------------------------------------------------------
    const TS_DEBUG = !!TS.debug;
    const tsLog = (...a) => { if (TS_DEBUG) console.log("[TRANS_SID]", ...a); };

    const TS_OPT_OUT = trim(TS.optOutAttr) || "data-no-trans-sid";

    const TS_HOST_WHITELIST = isArr(TS.hostWhitelist)
      ? TS.hostWhitelist.map(str).filter(Boolean)
      : [location.host];

    const TS_IFRAME_WHITELIST = isArr(TS.iframeWhitelist)
      ? TS.iframeWhitelist.map(str).filter(Boolean)
      : TS_HOST_WHITELIST;

    const TS_PRESENT_PARAMS = isArr(TS.alreadyPresentParams)
      ? TS.alreadyPresentParams.map(str).filter(Boolean)
      : [TS_NAME];

    const TS_PRESENT_POST_FIELDS = isArr(TS.alreadyPresentPostFields)
      ? TS.alreadyPresentPostFields.map(str).filter(Boolean)
      : [TS_NAME];

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

    // -------------------------------------------------------------------------
    // CSRF derived config
    // -------------------------------------------------------------------------
    const CS_DEBUG = !!CS.debug;
    const csLog = (...a) => { if (CS_DEBUG) console.log("[CSRF]", ...a); };

    const CS_OPT_OUT = trim(CS.optOutAttr) || "data-no-csrf";
    const CS_FIELD = trim(CS.fieldName) || "csrf";
    const CS_HEADER = trim(CS.headerName) || "X-CSRF";

    const csHasOptOut = (el) => !!(el && el.closest && el.closest(`[${CS_OPT_OUT}]`));

    // -------------------------------------------------------------------------
    // DOM rewriting: TRANS_SID
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // DOM rewriting: CSRF
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // Shared DOM patcher
    // -------------------------------------------------------------------------
    function patchSubtree(root) {
      if (!root || !(root instanceof Element || root === document)) return;

      // Include root itself if it matches
      if (root instanceof HTMLAnchorElement && root.hasAttribute("href")) tsRewriteAnchor(root);
      if (root instanceof HTMLFormElement) {
        tsRewriteForm(root);
        csEnsurePostFormToken(root);
      }
      if (root instanceof HTMLIFrameElement && root.hasAttribute("src")) tsRewriteIframe(root);

      const q = (sel) => (root === document ? document.querySelectorAll(sel) : root.querySelectorAll(sel));

      if (TS_ENABLED) {
        q(`a[href]:not([${TS_OPT_OUT}])`).forEach(tsRewriteAnchor);
        q(`form:not([${TS_OPT_OUT}])`).forEach(tsRewriteForm);
        q(`iframe[src]:not([${TS_OPT_OUT}])`).forEach(tsRewriteIframe);
      }

      if (CS_TOKEN_ENABLED) {
        q(`form:not([${CS_OPT_OUT}])`).forEach(csEnsurePostFormToken);
      }
    }

    // Initial pass
    patchSubtree(document);

    // Submit safety net
    document.addEventListener("submit", (e) => {
      if (e.target instanceof HTMLFormElement) {
        tsRewriteForm(e.target);
        csEnsurePostFormToken(e.target);
      }
    }, true);

    // Click safety net (just-in-time link rewrite)
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

    // -------------------------------------------------------------------------
    // One-and-only fetch() monkey patch (ONLY if configured)
    // -------------------------------------------------------------------------
    if (typeof window.fetch === "function" && (TS_FETCH_ENABLED || CS_TOKEN_ENABLED)) {
      if (!window.__TSUGI_SPA_FETCH_WRAPPED__) {
        window.__TSUGI_SPA_FETCH_WRAPPED__ = true;

        const origFetch = window.fetch.bind(window);

        window.fetch = (input, init = {}) => {
          // TRANS_SID per-call opt-out flag (if configured)
          let transSidOptOut = false;
          if (TS_FETCH_ENABLED && init && init[TS_FETCH_OPT_OUT_FLAG]) {
            transSidOptOut = true;
            const { [TS_FETCH_OPT_OUT_FLAG]: _drop, ...rest } = init;
            init = rest;
          }

          const url =
            (typeof input === "string") ? safeUrl(input) :
            (input instanceof Request)  ? safeUrl(input.url) :
            null;

          // Merge headers: Request headers then init.headers override
          const headers = new Headers((input instanceof Request) ? input.headers : undefined);
          if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));

          // TRANS_SID header injection (tight scope)
          if (TS_FETCH_ENABLED && !transSidOptOut && url) {
            const touch =
              tsShouldConsiderUrl(url, TS_HOST_WHITELIST) &&
              !startsWithAny(url.pathname, TS_FETCH_EXCLUDE_PREFIXES);

            if (touch) {
              const already = TS_FETCH_PRESENT_HEADERS.some(h => headers.has(h));
              if (!already) headers.set(TS_FETCH_HEADER, TS_VALUE);

              // Optional query param for fetch URLs
              if (TS_FETCH_ADD_QUERY && !tsHasAnyParam(url, TS_PRESENT_PARAMS)) {
                url.searchParams.set(TS_NAME, TS_VALUE);
                if (typeof input === "string") input = url.toString();
                else if (input instanceof Request) input = new Request(url.toString(), input);
              }
            }
          }

          // CSRF header injection (independent)
          if (CS_TOKEN_ENABLED) {
            if (!headers.has(CS_HEADER)) headers.set(CS_HEADER, csrfToken);
          }

          if (input instanceof Request) return origFetch(new Request(input, { ...init, headers }));
          return origFetch(input, { ...init, headers });
        };
      }
    }

    // Minimal helpers (safe)
    // Note: we only attach helpers if TRANS_SID is enabled.
    if (TS_ENABLED) {
      TS.add = (u) => tsAddParamToUrlString(u, TS_HOST_WHITELIST);
      TS.addIframe = (u) => tsAddParamToUrlString(u, TS_IFRAME_WHITELIST);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();

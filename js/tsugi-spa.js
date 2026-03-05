/*!
 * tsugi-spa.js  (with DRY-RUN support)
 * -----------------------------------------------------------------------------
 * One-file helper for Tsugi-style “mostly page-load” apps:
 *   - Optional TRANS_SID (cookieless session propagation)
 *   - Optional CSRF (JS-first CSRF injection + fetch header)
 *
 * GUARD + ONLOAD:
 *   - Runs only after DOMContentLoaded.
 *   - Does NOTHING unless TRANS_SID or CSRF is fully configured at load time.
 *
 * DRY-RUN:
 *   - Set window.TRANS_SID.dryRun = true to log what would be changed
 *     without mutating the DOM or request headers/URLs.
 *   - CSRF also supports window.CSRF.dryRun = true (log-only).
 *
 * Notes:
 *   - Only ONE fetch() wrapper is installed (no stacking).
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
  // Run on DOMContentLoaded
  // ---------------------------------------------------------------------------
  const run = () => {
    const TS = window.TRANS_SID || {};
    const CS = window.CSRF || {};

    // --- TRANS_SID "fully configured" criteria ---
    const TS_NAME  = trim(TS.name);
    const TS_VALUE = trim(TS.value);

    const TS_PATH_PREFIXES = (() => {
      if (isArr(TS.pathPrefixes)) return TS.pathPrefixes.map(str).filter(Boolean);
      if (trim(TS.pathPrefixes)) return [trim(TS.pathPrefixes)];
      return [];
    })();

    const TS_ENABLED = !!(TS_NAME && TS_VALUE && TS_PATH_PREFIXES.length > 0);
    const TS_DEBUG = !!TS.debug;
    const TS_DRYRUN = !!TS.dryRun;
    const tsLog = (...a) => { if (TS_DEBUG || TS_DRYRUN) console.log("[TSUGI-SPA][TRANS_SID]", ...a); };

    // --- CSRF "fully configured" criteria ---
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
    const CS_DEBUG = !!CS.debug;
    const CS_DRYRUN = !!CS.dryRun;
    const csLog = (...a) => { if (CS_DEBUG || CS_DRYRUN) console.log("[TSUGI-SPA][CSRF]", ...a); };

    // HARD GUARD: no config => do nothing (no observers, no fetch patch)
    if (!TS_ENABLED && !CS_TOKEN_ENABLED) return;

    // Avoid double-install if included twice
    if (window.__TSUGI_SPA_INSTALLED__) return;
    window.__TSUGI_SPA_INSTALLED__ = true;

    // -------------------------------------------------------------------------
    // TRANS_SID derived config
    // -------------------------------------------------------------------------
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
    const CS_OPT_OUT = trim(CS.optOutAttr) || "data-no-csrf";
    const CS_FIELD = trim(CS.fieldName) || "csrf";
    const CS_HEADER = trim(CS.headerName) || "X-CSRF";
    const csHasOptOut = (el) => !!(el && el.closest && el.closest(`[${CS_OPT_OUT}]`));

    const CS_FCFG = CS.fetch || {};
    const CS_FETCH_OPT_OUT_FLAG = trim(CS_FCFG.optOutFlag) || "__csrfOptOut";

    // CSRF fetch scope: reuse TRANS_SID scope when available, else same-origin + all paths
    const CS_FETCH_HOST_WHITELIST = isArr(CS_FCFG.hostWhitelist)
      ? CS_FCFG.hostWhitelist.map(str).filter(Boolean)
      : (TS_ENABLED ? TS_HOST_WHITELIST : [location.host]);
    const CS_FETCH_PATH_PREFIXES = isArr(CS_FCFG.pathPrefixes)
      ? CS_FCFG.pathPrefixes.map(str).filter(Boolean)
      : (TS_ENABLED && TS_PATH_PREFIXES.length ? TS_PATH_PREFIXES : ["/"]);
    const CS_FETCH_EXCLUDE_PREFIXES = isArr(CS_FCFG.excludePathPrefixes)
      ? CS_FCFG.excludePathPrefixes.map(str).filter(Boolean)
      : (TS_ENABLED ? TS_FETCH_EXCLUDE_PREFIXES : []);

    const csShouldConsiderUrlForFetch = (url) =>
      !!url &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      CS_FETCH_HOST_WHITELIST.includes(url.host) &&
      CS_FETCH_PATH_PREFIXES.some(p => url.pathname.startsWith(p)) &&
      !CS_FETCH_EXCLUDE_PREFIXES.some(p => url.pathname.startsWith(p));

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
        if (TS_DRYRUN) {
          tsLog("DRYRUN <a> would patch", href, "->", next);
        } else {
          a.setAttribute("href", next);
          tsLog("<a>", href, "->", next);
        }
      }
    }

    function tsRewriteForm(form) {
      if (!TS_ENABLED) return;
      if (!form || !form.getAttribute || tsHasOptOut(form)) return;

      const method = (form.getAttribute("method") || "get").toLowerCase();

      if (method === "post") {
        // Idempotency: if server already injected any known field, leave it alone.
        if (tsFormHasAnyHiddenField(form, TS_PRESENT_POST_FIELDS)) return;

        // Ensure hidden field
        const exists = !!form.querySelector(`input[type="hidden"][name="${CSS.escape(TS_NAME)}"]`);
        if (TS_DRYRUN) {
          tsLog("DRYRUN <form POST> would ensure hidden", TS_NAME, "=", TS_VALUE, exists ? "(update)" : "(insert)");
          return;
        }

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
        if (TS_DRYRUN) {
          tsLog("DRYRUN <form GET> would patch action", action, "->", next);
        } else {
          form.setAttribute("action", next);
          tsLog("<form GET>", action, "->", next);
        }
      }
    }

    function tsRewriteIframe(ifr) {
      if (!TS_ENABLED) return;
      if (!ifr || !ifr.getAttribute || tsHasOptOut(ifr)) return;

      const src = ifr.getAttribute("src");
      if (!src) return;

      const next = tsAddParamToUrlString(src, TS_IFRAME_WHITELIST);
      if (next !== src) {
        if (TS_DRYRUN) {
          tsLog("DRYRUN <iframe> would patch", src, "->", next);
        } else {
          ifr.setAttribute("src", next);
          tsLog("<iframe>", src, "->", next);
        }
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

      const hasField = !!form.querySelector(`input[type="hidden"][name="${CSS.escape(CS_FIELD)}"]`);

      if (CS_DRYRUN) {
        csLog("DRYRUN <form POST> would ensure hidden", CS_FIELD, "=<token>", hasField ? "(update)" : "(insert)");
        return;
      }

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

    // Event safety nets (noop in dryrun except logs)
    document.addEventListener("submit", (e) => {
      if (e.target instanceof HTMLFormElement) {
        tsRewriteForm(e.target);
        csEnsurePostFormToken(e.target);
      }
    }, true);

    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) tsRewriteAnchor(a);
    }, true);

    // MutationObserver for dynamic content
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          patchSubtree(node);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // -------------------------------------------------------------------------
    // One-and-only fetch() monkey patch (supports dryrun)
    // -------------------------------------------------------------------------
    if (typeof window.fetch === "function" && (TS_FETCH_ENABLED || CS_TOKEN_ENABLED)) {
      if (!window.__TSUGI_SPA_FETCH_WRAPPED__) {
        window.__TSUGI_SPA_FETCH_WRAPPED__ = true;

        const origFetch = window.fetch.bind(window);

        window.fetch = (input, init = {}) => {
          // Per-call opt-out flags (strip from init before passing to origFetch)
          const i = init ?? {};
          const transSidOptOut = !!(i[TS_FETCH_OPT_OUT_FLAG]);
          const csrfOptOut = !!(i[CS_FETCH_OPT_OUT_FLAG]);
          const { [TS_FETCH_OPT_OUT_FLAG]: _ts, [CS_FETCH_OPT_OUT_FLAG]: _cs, ...stripped } = i;
          init = stripped;

          const url =
            (typeof input === "string") ? safeUrl(input) :
            (input instanceof Request)  ? safeUrl(input.url) :
            null;

          // Merge headers: Request headers then init.headers override
          const headers = new Headers((input instanceof Request) ? input.headers : undefined);
          if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));

          const method = (init.method || (input instanceof Request ? input.method : undefined) || "GET").toUpperCase();

          // TRANS_SID header injection (tight scope)
          if (TS_FETCH_ENABLED && !transSidOptOut && url) {
            const touch =
              tsShouldConsiderUrl(url, TS_HOST_WHITELIST) &&
              !startsWithAny(url.pathname, TS_FETCH_EXCLUDE_PREFIXES);

            if (touch) {
              const already = TS_FETCH_PRESENT_HEADERS.some(h => headers.has(h));
              if (!already) {
                if (TS_DRYRUN) tsLog("DRYRUN fetch would add header", TS_FETCH_HEADER);
                else headers.set(TS_FETCH_HEADER, TS_VALUE);
              }

              // Optional query param on fetch URL
              if (TS_FETCH_ADD_QUERY && !tsHasAnyParam(url, TS_PRESENT_PARAMS)) {
                if (TS_DRYRUN) {
                  tsLog("DRYRUN fetch would add query param", TS_NAME);
                } else {
                  url.searchParams.set(TS_NAME, TS_VALUE);
                  if (typeof input === "string") input = url.toString();
                  else if (input instanceof Request) input = new Request(url.toString(), input);
                }
              }
            }
          }

          // CSRF header injection (only state-changing methods: POST, PUT, DELETE, PATCH; skip GET, HEAD, OPTIONS)
          const csrfMethodOk = !["GET", "HEAD", "OPTIONS"].includes(method);
          if (CS_TOKEN_ENABLED && !csrfOptOut && csrfMethodOk && url && csShouldConsiderUrlForFetch(url)) {
            if (!headers.has(CS_HEADER)) {
              if (CS_DRYRUN) csLog("DRYRUN fetch would add header", CS_HEADER);
              else headers.set(CS_HEADER, csrfToken);
            }
          }

          // In DRYRUN mode we still perform the actual fetch; we just don't mutate
          // headers/URLs. (So behavior stays unchanged.)
          if (input instanceof Request) return origFetch(new Request(input, { ...init, headers }));
          return origFetch(input, { ...init, headers });
        };
      }
    }

    // Helpers (attach only if TRANS_SID enabled)
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

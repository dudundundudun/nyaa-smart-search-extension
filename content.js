(function () {
  if (window.__nyaaSmartSearchLoaded) return;
  window.__nyaaSmartSearchLoaded = true;

  let state = {
    enabledDomains: ["nyaa.si", "nyaa.land", "sukebei.nyaa.si", "nhentai.net", "exhentai.org", "e-hentai.org", "danbooru.donmai.us", "gelbooru.com"],
    siteProfiles: {},
    chips: [],
    favorites: [],
    history: [],
    customSelectors: {},
    settings: { pageTagHover: true },
    customTagDatabase: [],
    builtinTagDb: null,
    showAllSaved: false,
    showAllRecent: false,
    editingId: null,
    addingChipInline: false,
    activeNsFilter: "",
    pickingElement: false
  };

  let activeInput = null;
  let hostEl = null;
  let shadow = null;
  let dropdownEl = null;
  let chipsContainer = null;
  let resultsContainer = null;
  let inbarHost = null;
  let inbarShadow = null;
  let hoverPillHost = null;
  let hoverPillShadow = null;
  let hoveredTagText = "";
  let isDropdownOpen = false;
  let dragSrcIndex = null;
  let searchDebounceTimer = null;

  function getCleanHostname() {
    return location.hostname.replace(/^www\./, "").toLowerCase();
  }

  function getProfileKey() {
    const host = getCleanHostname();
    if (host === "nyaa.si" || host === "nyaa.land" || host.endsWith(".nyaa.si") || host.endsWith(".nyaa.land")) {
      return "nyaa.si";
    }
    if (host === "e-hentai.org" || host === "exhentai.org" || host.endsWith(".e-hentai.org") || host.endsWith(".exhentai.org")) {
      return "exhentai.org";
    }
    return host;
  }

  function getSiteCategory() {
    const key = getProfileKey();
    if (key === "nyaa.si" || key.includes("sukebei")) return "nyaa";
    if (key.includes("exhentai") || key.includes("e-hentai") || key.includes("nhentai")) return "hentai";
    if (key.includes("booru")) return "booru";
    return "all";
  }

  function isNyaaSite() {
    return getProfileKey() === "nyaa.si";
  }

  function isSiteEnabled() {
    const host = getCleanHostname();
    return (state.enabledDomains || []).some(d => host === d || host.endsWith("." + d));
  }

  async function ensureBuiltinTagDb() {
    if (state.builtinTagDb) return state.builtinTagDb;
    try {
      const url = chrome.runtime.getURL("data/tags_db.json");
      const resp = await fetch(url);
      state.builtinTagDb = await resp.json();
    } catch (e) {
      state.builtinTagDb = { nyaa: [], booru: [], hentai: [] };
    }
    return state.builtinTagDb;
  }

  function getActiveTagPool() {
    const db = state.builtinTagDb || { nyaa: [], booru: [], hentai: [] };
    const cat = getSiteCategory();
    let pool = [];
    if (cat === "nyaa") pool = [...(db.nyaa || [])];
    else if (cat === "hentai") pool = [...(db.hentai || []), ...(db.booru || [])];
    else if (cat === "booru") pool = [...(db.booru || []), ...(db.hentai || [])];
    else pool = [...(db.nyaa || []), ...(db.hentai || []), ...(db.booru || [])];

    if (Array.isArray(state.customTagDatabase) && state.customTagDatabase.length > 0) {
      pool = [...state.customTagDatabase, ...pool];
    }
    return pool;
  }

  async function loadState() {
    const data = await chrome.storage.local.get([
      "enabledDomains",
      "siteProfiles",
      "customSelectors",
      "settings",
      "customTagDatabase"
    ]);
    if (data.enabledDomains) state.enabledDomains = data.enabledDomains;
    if (data.customSelectors) state.customSelectors = data.customSelectors;
    if (data.settings) state.settings = data.settings;
    if (Array.isArray(data.customTagDatabase)) state.customTagDatabase = data.customTagDatabase;

    const profiles = data.siteProfiles || {};
    state.siteProfiles = profiles;
    const key = getProfileKey();
    const currentProfile = profiles[key] || { chips: [], favorites: [], history: [] };
    state.chips = Array.isArray(currentProfile.chips) ? currentProfile.chips : [];
    state.favorites = Array.isArray(currentProfile.favorites) ? currentProfile.favorites : [];
    state.history = Array.isArray(currentProfile.history) ? currentProfile.history : [];
  }

  async function saveCurrentProfile() {
    const key = getProfileKey();
    const { siteProfiles = {} } = await chrome.storage.local.get(["siteProfiles"]);
    siteProfiles[key] = {
      chips: state.chips,
      favorites: state.favorites,
      history: state.history
    };
    state.siteProfiles = siteProfiles;
    await chrome.storage.local.set({ siteProfiles });
  }

  function findSearchInput() {
    const host = getCleanHostname();
    if (state.customSelectors && state.customSelectors[host]) {
      const custom = document.querySelector(state.customSelectors[host]);
      if (custom) return custom;
    }
    const selectors = [
      'input.search-bar[name="q"]',
      'input[name="q"]',
      'input[name="f_search"]',
      'input[name="tags"]',
      'input[type="search"]',
      'input[name="search"]',
      'input[name="query"]',
      'input[role="searchbox"]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="Поиск" i]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function setInputValue(input, val, focus = true) {
    if (!input) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(input, val);
    } else {
      input.value = val;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (focus) {
      input.focus();
      const len = val.length;
      try { input.setSelectionRange(len, len); } catch (e) {}
    }
    updateInbarButtons();
    renderChipsSection();
    renderResultsSection();
  }

  // Extract last token (after last space outside quotes, or simply last space-separated fragment)
  function getCurrentTokenInfo(val) {
    const str = String(val || "");
    const lastSpace = str.lastIndexOf(" ");
    const prefix = lastSpace >= 0 ? str.slice(0, lastSpace + 1) : "";
    const token = lastSpace >= 0 ? str.slice(lastSpace + 1) : str;
    return { prefix, token };
  }

  function replaceLastTokenWith(tagText) {
    if (!activeInput) return;
    const val = activeInput.value || "";
    const { prefix } = getCurrentTokenInfo(val);
    const formatted = tagText.includes(" ") && !tagText.startsWith("[") && !tagText.startsWith('"') && !tagText.startsWith("-")
      ? (getSiteCategory() === "hentai" && tagText.includes(":") ? `${tagText.split(":")[0]}:"${tagText.split(":")[1]}$"` : `"${tagText}"`)
      : tagText;
    const nextVal = (prefix + formatted).trimEnd() + (tagText.endsWith(":") ? "" : " ");
    setInputValue(activeInput, nextVal, true);
    openDropdown();
  }

  function wrapLastTokenWithQuotes() {
    if (!activeInput) return;
    const trimmed = (activeInput.value || "").trimEnd();
    if (!trimmed) return;
    const { prefix, token } = getCurrentTokenInfo(trimmed);
    if (!token) return;
    const nextToken = token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : `"${token}"`;
    setInputValue(activeInput, prefix + nextToken + " ", true);
  }

  function negateLastToken() {
    if (!activeInput) return;
    const trimmed = (activeInput.value || "").trimEnd();
    if (!trimmed) {
      setInputValue(activeInput, "-", true);
      return;
    }
    const { prefix, token } = getCurrentTokenInfo(trimmed);
    if (!token) {
      setInputValue(activeInput, prefix + "-", true);
      return;
    }
    const nextToken = token.startsWith("-") ? token.slice(1) : "-" + token;
    setInputValue(activeInput, prefix + nextToken + " ", true);
  }

  function getNyaaSelects() {
    if (!isNyaaSite()) return { category: "", filter: "" };
    const catSelect = document.querySelector('select[name="c"]');
    const filterSelect = document.querySelector('select[name="f"]');
    return {
      category: catSelect ? catSelect.value : "",
      filter: filterSelect ? filterSelect.value : ""
    };
  }

  function applyNyaaSelects(item) {
    if (!item || !isNyaaSite()) return;
    if (item.category) {
      const catSelect = document.querySelector('select[name="c"]');
      if (catSelect) {
        catSelect.value = item.category;
        catSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (item.filter) {
      const filterSelect = document.querySelector('select[name="f"]');
      if (filterSelect) {
        filterSelect.value = item.filter;
        filterSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  async function recordQueryToHistory(queryText) {
    const clean = (queryText || "").trim().replace(/\s+/g, " ");
    if (clean.length < 2) return;
    const history = [...state.history];
    const idx = history.findIndex(h => h.text.toLowerCase() === clean.toLowerCase());
    if (idx >= 0) {
      history[idx].count = (history[idx].count || 1) + 1;
      history[idx].lastUsed = Date.now();
      history[idx].text = clean;
    } else {
      history.unshift({ id: "hist_" + Date.now(), text: clean, count: 1, lastUsed: Date.now() });
    }
    history.sort((a, b) => (b.count || 1) - (a.count || 1) || (b.lastUsed || 0) - (a.lastUsed || 0));
    state.history = history.slice(0, 50);
    await saveCurrentProfile();
  }

  async function submitSearch(queryText, itemMeta = null, newTab = false) {
    if (!activeInput) return;
    setInputValue(activeInput, queryText, false);
    if (itemMeta) applyNyaaSelects(itemMeta);
    await recordQueryToHistory(queryText);
    closeDropdown();

    const form = activeInput.closest("form");
    if (newTab && form && form.action && activeInput.name) {
      try {
        const url = new URL(form.action, location.href);
        url.searchParams.set(activeInput.name, queryText.trim());
        window.open(url.toString(), "_blank");
        return;
      } catch (e) {}
    }

    if (form) {
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        return;
      }
      form.submit();
    } else {
      activeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }
  }

  async function toggleFavorite(queryText) {
    const clean = (queryText || "").trim().replace(/\s+/g, " ");
    if (!clean) return;
    const favorites = [...state.favorites];
    const idx = favorites.findIndex(f => f.text.toLowerCase() === clean.toLowerCase());
    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      const selects = getNyaaSelects();
      favorites.unshift({
        id: "fav_" + Date.now(),
        text: clean,
        category: selects.category,
        filter: selects.filter,
        addedAt: Date.now()
      });
    }
    state.favorites = favorites;
    await saveCurrentProfile();
    updateInbarButtons();
    renderResultsSection();
  }

  function isFavorited(queryText) {
    const clean = (queryText || "").trim().toLowerCase();
    if (!clean) return false;
    return state.favorites.some(f => f.text.trim().toLowerCase() === clean);
  }

  function deleteLastWord() {
    if (!activeInput) return;
    const val = activeInput.value.trimEnd();
    if (!val) {
      setInputValue(activeInput, "", true);
      return;
    }
    const matchBracket = val.match(/^(.*?)\s*\[[^\]]+\]$/);
    let nextVal = "";
    if (matchBracket) {
      nextVal = matchBracket[1];
    } else {
      const lastSpace = val.lastIndexOf(" ");
      nextVal = lastSpace >= 0 ? val.slice(0, lastSpace) : "";
    }
    setInputValue(activeInput, nextVal ? nextVal + " " : "", true);
    openDropdown();
  }

  function getChipStateInInput(chip, inputVal) {
    const cleanChip = chip.replace(/^-/, "");
    const esc = cleanChip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\s)-${esc}(?=\\s|$)`, "i").test(inputVal)) return "excluded";
    if (new RegExp(`(^|\\s)${esc}(?=\\s|$)`, "i").test(inputVal)) return "included";
    return "off";
  }

  // mode: "include" (LMB) or "exclude" (RMB)
  function toggleChipInInput(chip, mode = "include") {
    if (!activeInput) return;
    let current = activeInput.value.trim();
    const baseChip = chip.replace(/^-/, "");
    const targetToken = mode === "exclude" ? `-${baseChip}` : baseChip;
    const escBase = baseChip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Remove any existing include or exclude version of this chip first
    const reAny = new RegExp(`(^|\\s)-?${escBase}(?=\\s|$)`, "ig");
    const curState = getChipStateInInput(chip, current);

    if ((mode === "include" && curState === "included") || (mode === "exclude" && curState === "excluded")) {
      // Toggle off
      current = current.replace(reAny, " ").replace(/\s+/g, " ").trim();
    } else {
      // Replace or append targetToken
      current = current.replace(reAny, " ").replace(/\s+/g, " ").trim();
      current = current ? `${current} ${targetToken}` : targetToken;
    }

    setInputValue(activeInput, current ? current + " " : "", true);
    openDropdown();
  }

  function appendTokenToInput(token) {
    if (!activeInput) return;
    const current = activeInput.value.trim();
    if (!current) {
      setInputValue(activeInput, token + " ", true);
    } else if (!current.toLowerCase().includes(token.toLowerCase())) {
      setInputValue(activeInput, current + " " + token + " ", true);
    } else {
      setInputValue(activeInput, current + " ", true);
    }
    openDropdown();
  }

  function queryTagDatabase(query, limit = 25) {
    const q = (query || "").trim().toLowerCase();
    const ns = state.activeNsFilter;
    const pool = getActiveTagPool();
    if (!q && !ns) return [];

    const prefixMatches = [];
    const subMatches = [];
    const seen = new Set();

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      const tag = item.t;
      if (!tag) continue;
      const lowerTag = tag.toLowerCase();
      if (seen.has(lowerTag)) continue;

      if (ns && !lowerTag.startsWith(ns)) continue;
      if (!q) {
        seen.add(lowerTag);
        prefixMatches.push(item);
        if (prefixMatches.length >= limit) break;
        continue;
      }

      if (lowerTag.startsWith(q) || (ns && lowerTag.slice(ns.length).startsWith(q))) {
        seen.add(lowerTag);
        prefixMatches.push(item);
      } else if (lowerTag.includes(q) || (item.d && item.d.toLowerCase().includes(q))) {
        seen.add(lowerTag);
        subMatches.push(item);
      }
      if (prefixMatches.length >= limit && subMatches.length >= limit) break;
    }
    return [...prefixMatches, ...subMatches].slice(0, limit);
  }

  function createInbarControls(input) {
    if (inbarHost) {
      inbarHost.remove();
      inbarHost = null;
    }
    inbarHost = document.createElement("div");
    inbarHost.id = "nyaa-smart-inbar-host";
    inbarHost.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;";
    document.body.appendChild(inbarHost);

    inbarShadow = inbarHost.attachShadow({ mode: "open" });
    inbarShadow.innerHTML = `
      <style>
        .inbar-wrap {
          display: flex; align-items: center; justify-content: flex-end;
          gap: 5px; pointer-events: auto; height: 100%; padding-right: 6px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .ib-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border-radius: 50%; border: none;
          background: rgba(82, 82, 91, 0.85); color: #e4e4e7;
          font-size: 14px; line-height: 1; cursor: pointer; padding: 0;
          transition: background 0.12s, color 0.12s, transform 0.1s; user-select: none;
        }
        .ib-btn:hover { background: #71717a; color: #fff; transform: scale(1.06); }
        .ib-btn.clear-btn { font-size: 15px; font-weight: 600; }
        .ib-btn.clear-btn:hover { background: #ed2553; color: #fff; }
        .ib-btn.word-btn { border-radius: 4px; width: 24px; font-size: 12px; background: rgba(63, 63, 70, 0.85); }
        .hidden { display: none !important; }
      </style>
      <div class="inbar-wrap">
        <button type="button" class="ib-btn word-btn hidden" id="ib-del-word" title="Стереть последнее слово / тег (⌫)">⌫</button>
        <button type="button" class="ib-btn clear-btn hidden" id="ib-clear" title="Очистить всю строку и открыть список (×)">×</button>
      </div>
    `;

    inbarShadow.getElementById("ib-clear").addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setInputValue(activeInput, "", true);
      openDropdown();
    });
    inbarShadow.getElementById("ib-del-word").addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteLastWord();
    });

    positionInbarControls();
    updateInbarButtons();
  }

  function positionInbarControls() {
    if (!activeInput || !inbarHost) return;
    const rect = activeInput.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      inbarHost.style.display = "none";
      return;
    }
    inbarHost.style.display = "block";
    const wrapHeight = Math.min(rect.height, 34);
    inbarHost.style.top = `${rect.top + (rect.height - wrapHeight) / 2}px`;
    inbarHost.style.left = `${rect.right - 60}px`;
    inbarHost.style.width = `58px`;
    inbarHost.style.height = `${wrapHeight}px`;
  }

  function updateInbarButtons() {
    if (!activeInput || !inbarShadow) return;
    const hasText = (activeInput.value || "").length > 0;
    const clearBtn = inbarShadow.getElementById("ib-clear");
    const wordBtn = inbarShadow.getElementById("ib-del-word");
    if (!activeInput.dataset.origPaddingRight) {
      activeInput.dataset.origPaddingRight = activeInput.style.paddingRight || "12px";
    }
    if (hasText) {
      clearBtn.classList.remove("hidden");
      wordBtn.classList.remove("hidden");
      activeInput.style.paddingRight = "60px";
    } else {
      clearBtn.classList.add("hidden");
      wordBtn.classList.add("hidden");
      activeInput.style.paddingRight = activeInput.dataset.origPaddingRight;
    }
  }

  function createDropdownHost() {
    if (hostEl) return;
    hostEl = document.createElement("div");
    hostEl.id = "nyaa-smart-dropdown-host";
    hostEl.style.cssText = "position:fixed;z-index:2147483647;display:none;";
    document.body.appendChild(hostEl);

    shadow = hostEl.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .nh-dropdown {
          background: #1f1f1f;
          color: #d9d9d9;
          border: 1px solid #383838;
          border-top: none;
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.7);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13.5px;
          max-height: 490px;
          display: flex;
          flex-direction: column;
          user-select: none;
        }
        .nh-results {
          overflow-y: auto;
          flex: 1;
        }
        .nh-results::-webkit-scrollbar { width: 8px; }
        .nh-results::-webkit-scrollbar-track { background: #181818; }
        .nh-results::-webkit-scrollbar-thumb { background: #4d4d4d; border-radius: 4px; }

        .chips-bar {
          display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
          padding: 7px 10px; background: #161616; border-bottom: 1px solid #2e2e2e;
        }
        .chips-label {
          font-size: 11px; color: #8c8c8c; margin-right: 3px;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .chip-wrap {
          display: inline-flex; align-items: center; position: relative;
        }
        .chip-btn {
          background: #2b2b2b; color: #d4d4d4; border: 1px solid #3f3f3f;
          border-radius: 4px; padding: 2px 7px; font-size: 12px; cursor: pointer;
          transition: all 0.12s; font-family: Consolas, Monaco, "Courier New", monospace;
        }
        .chip-btn:hover { background: #3a3a3a; color: #fff; border-color: #666; }
        .chip-btn.included { background: #7c5816; color: #fff3d1; border-color: #c28b22; }
        .chip-btn.excluded { background: #5c1927; color: #ffd4dd; border-color: #c4314b; text-decoration: line-through; }
        .chip-del {
          display: none; margin-left: -4px; background: #3a1a22; color: #ff8ca3;
          border: 1px solid #6b2938; border-radius: 0 4px 4px 0; padding: 2px 4px;
          font-size: 11px; cursor: pointer; line-height: 1;
        }
        .chip-wrap:hover .chip-del { display: inline-block; }
        .chip-wrap:hover .chip-btn { border-top-right-radius: 0; border-bottom-right-radius: 0; }
        .chip-add-btn {
          background: transparent; color: #9c9c9c; border: 1px dashed #4a4a4a;
          border-radius: 4px; padding: 2px 7px; font-size: 11.5px; cursor: pointer;
        }
        .chip-add-btn:hover { color: #fff; border-color: #888; }
        .inline-chip-box {
          display: inline-flex; align-items: center; gap: 4px;
        }
        .inline-chip-input {
          background: #111; color: #fff; border: 1px solid #ed2553;
          border-radius: 4px; padding: 2px 7px; font-size: 12px; width: 145px; outline: none;
        }

        /* Quick Operator & Namespace Toolbar */
        .ops-bar {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 6px; padding: 5px 10px;
          background: #1b1b1b; border-bottom: 1px solid #2b2b2b;
        }
        .ops-group { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .op-btn {
          background: #27272a; color: #cbd5e1; border: 1px solid #3f3f46;
          border-radius: 3px; padding: 2px 7px; font-size: 11.5px; cursor: pointer;
          transition: background 0.1s;
        }
        .op-btn:hover { background: #3f3f46; color: #fff; }
        .op-btn.active { background: #2563eb; color: #fff; border-color: #3b82f6; }
        .op-btn.search-submit-btn {
          background: #ed2553; color: #fff; border-color: #ed2553; font-weight: 600; padding: 3px 10px;
        }
        .op-btn.search-submit-btn:hover { background: #d41c47; }

        .search-for-row {
          display: flex; align-items: stretch; background: #343434;
          border-bottom: 1px solid #2d2d2d; min-height: 36px;
        }
        .search-for-main {
          flex: 1; display: flex; align-items: center; padding: 6px 12px;
          cursor: pointer; color: #b5b5b5; gap: 8px; overflow: hidden;
        }
        .search-for-main:hover { background: #404040; }
        .search-for-query {
          color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .nh-section-hdr {
          padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; color: #7e7e7e; background: #181818; border-bottom: 1px solid #272727;
        }
        .nh-row {
          display: flex; align-items: stretch; background: #1f1f1f;
          border-bottom: 1px solid #2a2a2a; min-height: 34px; transition: background 0.08s;
        }
        .nh-row:hover { background: #292929; }
        .nh-row.dragging { opacity: 0.45; background: #333; }
        .nh-cell-main {
          flex: 1; display: flex; align-items: center; padding: 5px 12px;
          gap: 8px; cursor: pointer; overflow: hidden;
        }
        .nh-star-icon { color: #f5b942; font-size: 14px; flex-shrink: 0; width: 16px; text-align: center; }
        .nh-clock-icon { color: #9e9e9e; font-size: 13px; flex-shrink: 0; width: 16px; text-align: center; }
        .nh-tag-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .cat-artist { color: #f87171; }
        .dot-artist { background: #f87171; }
        .cat-character { color: #4ade80; }
        .dot-character { background: #4ade80; }
        .cat-copyright, .cat-parody { color: #c084fc; }
        .dot-copyright, .dot-parody { background: #c084fc; }
        .cat-female { color: #f472b6; }
        .dot-female { background: #f472b6; }
        .cat-male { color: #60a5fa; }
        .dot-male { background: #60a5fa; }
        .cat-language, .cat-meta { color: #fbbf24; }
        .dot-language, .dot-meta { background: #fbbf24; }
        .cat-nyaa { color: #38bdf8; }
        .dot-nyaa { background: #38bdf8; }
        .cat-general, .cat-group { color: #e2e8f0; }
        .dot-general, .dot-group { background: #94a3b8; }

        .nh-text {
          color: #e6e6e6; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nh-text.mono { font-family: Consolas, Monaco, "Courier New", monospace; font-size: 13px; }
        .nh-desc {
          color: #8a8a8a; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-left: 4px;
        }
        .nh-count {
          color: #8a8a8a; font-size: 12px; margin-left: auto; padding-left: 8px; flex-shrink: 0;
        }
        .nh-cell-action {
          width: 34px; display: flex; align-items: center; justify-content: center;
          border-left: 1px solid #2a2a2a; color: #b0b0b0; cursor: pointer;
          font-size: 14px; flex-shrink: 0; background: transparent; transition: background 0.1s, color 0.1s;
        }
        .nh-cell-action:hover { background: #343434; color: #fff; }
        .nh-cell-action.star-cell.active, .nh-cell-action.star-cell:hover { color: #f5b942; }
        .nh-cell-action.del-cell:hover { background: #4a1c26; color: #ff6b8b; }
        .nh-cell-action.drag-cell {
          cursor: grab; width: 24px; font-size: 12px; color: #666;
          border-left: none; border-right: 1px solid #2a2a2a;
        }
        .nh-more-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 12px; background: #1a1a1a; border-bottom: 1px solid #2c2c2c;
          color: #9e9e9e; font-size: 12.5px; cursor: pointer;
        }
        .nh-more-row:hover { background: #252525; color: #d9d9d9; }
        .nh-add-fav-btn { color: #f5b942; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 3px; }
        .nh-add-fav-btn:hover { background: rgba(245, 185, 66, 0.15); }
        .nh-edit-wrap { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 8px; background: #262626; }
        .nh-edit-input { flex: 1; background: #141414; color: #fff; border: 1px solid #555; border-radius: 3px; padding: 4px 8px; font-size: 13px; }
        .nh-edit-save { background: #2ea043; color: #fff; border: none; border-radius: 3px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-weight: 600; }
        .nh-edit-cancel { background: #444; color: #ddd; border: none; border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 12px; }
      </style>
      <div class="nh-dropdown" id="nh-dropdown">
        <div id="nh-header-zone"></div>
        <div class="nh-results" id="nh-results"></div>
      </div>
    `;
    dropdownEl = shadow.getElementById("nh-dropdown");
    chipsContainer = shadow.getElementById("nh-header-zone");
    resultsContainer = shadow.getElementById("nh-results");
  }

  function positionDropdown() {
    if (!activeInput || !hostEl) return;
    const rect = activeInput.getBoundingClientRect();
    const group = activeInput.closest(".input-group");
    let width = rect.width;
    let left = rect.left;
    if (group) {
      const gRect = group.getBoundingClientRect();
      width = Math.max(rect.width, gRect.right - rect.left);
    }
    width = Math.max(width, 460);
    if (left + width > window.innerWidth - 12) {
      left = Math.max(8, window.innerWidth - width - 12);
    }
    hostEl.style.top = `${rect.bottom}px`;
    hostEl.style.left = `${left}px`;
    hostEl.style.width = `${width}px`;
  }

  async function openDropdown() {
    if (!activeInput || !isSiteEnabled()) return;
    await ensureBuiltinTagDb();
    createDropdownHost();
    isDropdownOpen = true;
    positionDropdown();
    renderChipsSection();
    renderResultsSection();
    hostEl.style.display = "block";
  }

  function closeDropdown() {
    isDropdownOpen = false;
    state.editingId = null;
    state.addingChipInline = false;
    if (hostEl) hostEl.style.display = "none";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderChipsSection() {
    if (!chipsContainer || !activeInput) return;
    const trimmedVal = (activeInput.value || "").trim();
    const siteCat = getSiteCategory();

    let html = `<div class="chips-bar">
      <span class="chips-label" title="ЛКМ: добавить/убрать | ПКМ: исключить (-тег)">Теги (${escapeHtml(getProfileKey())}):</span>`;

    for (const chip of state.chips) {
      const chipState = getChipStateInInput(chip, trimmedVal);
      const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "";
      html += `<span class="chip-wrap">
        <button type="button" class="chip-btn ${cls}" data-chip="${escapeHtml(chip)}" title="ЛКМ: +тег | ПКМ: -тег (исключить)">${escapeHtml(chip)}</button>
        <button type="button" class="chip-del" data-del-chip="${escapeHtml(chip)}" title="Удалить чипс">×</button>
      </span>`;
    }

    if (state.addingChipInline) {
      html += `<span class="inline-chip-box">
        <input type="text" class="inline-chip-input" id="nh-inline-chip-input" placeholder="Введите тег..." autocomplete="off" />
      </span>`;
    } else {
      html += `<button type="button" class="chip-add-btn" id="nh-add-chip" title="Добавить быстрый чипс с подсказками">+ тег</button>`;
    }
    html += `</div>`;

    // Quick Operators + Namespace filters
    const namespaces = siteCat === "hentai"
      ? ["female:", "male:", "artist:", "parody:", "character:", "language:"]
      : siteCat === "booru"
      ? ["order:score", "rating:general", "rating:explicit"]
      : [];

    html += `<div class="ops-bar">
      <div class="ops-group">
        <button type="button" class="op-btn" id="op-negate" title="Добавить/убрать минус (-) перед последним словом">− Исключить</button>
        <button type="button" class="op-btn" id="op-quote" title="Взять последнее слово в кавычки">&quot;&quot; Точно</button>
        <button type="button" class="op-btn" id="op-or" title="Добавить оператор OR">OR</button>`;
    for (const ns of namespaces) {
      const isAct = state.activeNsFilter === ns;
      html += `<button type="button" class="op-btn ${isAct ? "active" : ""}" data-ns="${escapeHtml(ns)}" title="Фильтр базы по ${escapeHtml(ns)}">${escapeHtml(ns)}</button>`;
    }
    html += `</div>
      <button type="button" class="op-btn search-submit-btn" id="op-submit" title="Запустить поиск мышкой">🔍 Найти</button>
    </div>`;

    chipsContainer.innerHTML = html;
    bindChipsEvents();
  }

  function renderResultsSection(inlineChipQuery = null) {
    if (!resultsContainer || !activeInput) return;
    const rawVal = activeInput.value || "";
    const trimmedVal = rawVal.trim();
    const lowerVal = trimmedVal.toLowerCase();
    const { token } = getCurrentTokenInfo(rawVal);

    let html = "";

    // If user is typing inside inline "+ тег" box, show matching tags to add as a chip
    if (state.addingChipInline && inlineChipQuery !== null) {
      const matches = queryTagDatabase(inlineChipQuery, 20);
      html += `<div class="nh-section-hdr">Кликните по тегу, чтобы добавить в быстрые чипсы:</div>`;
      if (!matches.length) {
        html += `<div class="nh-row"><div class="nh-cell-main"><span class="nh-desc">Нажмите Enter, чтобы добавить «${escapeHtml(inlineChipQuery)}»</span></div></div>`;
      } else {
        matches.forEach(item => {
          html += `
            <div class="nh-row" data-action="pick-inline-chip" data-tag="${escapeHtml(item.t)}">
              <div class="nh-cell-main">
                <span class="nh-tag-dot dot-${escapeHtml(item.c || "general")}"></span>
                <span class="nh-text mono cat-${escapeHtml(item.c || "general")}">${escapeHtml(item.t)}</span>
                ${item.d ? `<span class="nh-desc">${escapeHtml(item.d)}</span>` : ""}
              </div>
            </div>`;
        });
      }
      resultsContainer.innerHTML = html;
      bindResultsEvents();
      return;
    }

    // 1. "Search for <query>" row
    if (trimmedVal.length > 0) {
      const favActive = isFavorited(trimmedVal);
      html += `
        <div class="search-for-row">
          <div class="search-for-main" data-action="submit-current">
            <span>↵</span>
            <span>Найти:</span>
            <span class="search-for-query">${escapeHtml(trimmedVal)}</span>
          </div>
          <div class="nh-cell-action star-cell ${favActive ? "active" : ""}" data-action="star-current" title="Сохранить в Избранное (★)">
            ${favActive ? "★" : "☆"}
          </div>
        </div>
      `;
    }

    // 2. Autocomplete suggestions by LAST TOKEN (from tag DB)
    const tokenClean = token.replace(/^[-+"]/, "");
    if (tokenClean.length >= 1 || state.activeNsFilter) {
      const dbMatches = queryTagDatabase(tokenClean, 25);
      if (dbMatches.length > 0) {
        html += `<div class="nh-section-hdr">Подсказки из базы тегов (клик — вставить)</div>`;
        dbMatches.forEach(item => {
          const catCls = escapeHtml(item.c || "general");
          const popStr = item.p >= 1000 ? `${Math.round(item.p / 1000)}k` : (item.p || "");
          html += `
            <div class="nh-row">
              <div class="nh-cell-main" data-action="insert-token" data-tag="${escapeHtml(item.t)}">
                <span class="nh-tag-dot dot-${catCls}"></span>
                <span class="nh-text mono cat-${catCls}">${escapeHtml(item.t)}</span>
                ${item.d ? `<span class="nh-desc">${escapeHtml(item.d)}</span>` : ""}
                ${popStr ? `<span class="nh-count">${popStr}</span>` : ""}
              </div>
              <div class="nh-cell-action" data-action="run-query" data-query="${escapeHtml(item.t)}" title="Искать только этот тег">🔍</div>
              <div class="nh-cell-action star-cell" data-action="add-chip-direct" data-tag="${escapeHtml(item.t)}" title="Закрепить в чипсах сверху">+</div>
            </div>
          `;
        });
      }
    }

    // 3. Per-site Favorites
    const filteredFavs = lowerVal
      ? state.favorites.filter(f => f.text.toLowerCase().includes(lowerVal))
      : state.favorites;
    const favLimit = state.showAllSaved || lowerVal ? filteredFavs.length : Math.min(4, filteredFavs.length);
    const visibleFavs = filteredFavs.slice(0, favLimit);

    if (visibleFavs.length > 0) {
      html += `<div class="nh-section-hdr">★ Избранные запросы (СКМ — в новой вкладке)</div>`;
    }
    visibleFavs.forEach((fav, idx) => {
      if (state.editingId === fav.id) {
        html += `
          <div class="nh-row" data-id="${escapeHtml(fav.id)}">
            <div class="nh-edit-wrap">
              <input type="text" class="nh-edit-input" id="edit-text-${escapeHtml(fav.id)}" value="${escapeHtml(fav.text)}" placeholder="Текст запроса..." />
              <button type="button" class="nh-edit-save" data-action="save-edit" data-id="${escapeHtml(fav.id)}">OK</button>
              <button type="button" class="nh-edit-cancel" data-action="cancel-edit">Отмена</button>
            </div>
          </div>`;
        return;
      }
      html += `
        <div class="nh-row" draggable="${!lowerVal}" data-idx="${idx}" data-id="${escapeHtml(fav.id)}">
          ${!lowerVal ? `<div class="nh-cell-action drag-cell" title="Перетащить">⠿</div>` : ""}
          <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(fav.text)}" data-id="${escapeHtml(fav.id)}">
            <span class="nh-star-icon">★</span>
            <span class="nh-text mono">${escapeHtml(fav.text)}</span>
          </div>
          <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(fav.text)}" title="Подставить в строку">→</div>
          <div class="nh-cell-action" data-action="edit-fav" data-id="${escapeHtml(fav.id)}" title="Редактировать">✎</div>
          <div class="nh-cell-action del-cell" data-action="delete-fav" data-id="${escapeHtml(fav.id)}" title="Удалить">×</div>
        </div>`;
    });

    if (!lowerVal) {
      const hiddenFavCount = Math.max(0, filteredFavs.length - 4);
      html += `
        <div class="nh-more-row" data-action="toggle-more-saved">
          <span>${hiddenFavCount > 0
            ? (state.showAllSaved ? "▴ Свернуть сохранённые" : `▾ Показать ещё ${hiddenFavCount} (всего ${filteredFavs.length})`)
            : `★ Сохранённые фавориты (${filteredFavs.length})`}</span>
          <span class="nh-add-fav-btn" data-action="add-new-fav">+ Добавить фаворит</span>
        </div>`;
    }

    // 4. Per-site History
    const favSet = new Set(state.favorites.map(f => f.text.trim().toLowerCase()));
    const filteredHist = state.history.filter(h => !lowerVal || h.text.toLowerCase().includes(lowerVal));
    const histLimit = state.showAllRecent || lowerVal ? filteredHist.length : Math.min(5, filteredHist.length);
    const visibleHist = filteredHist.slice(0, histLimit);

    visibleHist.forEach(item => {
      const isFav = favSet.has(item.text.trim().toLowerCase());
      html += `
        <div class="nh-row">
          <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(item.text)}">
            <span class="nh-clock-icon">🕒</span>
            <span class="nh-text mono">${escapeHtml(item.text)}</span>
            <span class="nh-count">${item.count || 1}×</span>
          </div>
          <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(item.text)}" title="Подставить в строку">→</div>
          <div class="nh-cell-action star-cell ${isFav ? "active" : ""}" data-action="promote-hist" data-query="${escapeHtml(item.text)}" title="В избранное">${isFav ? "★" : "☆"}</div>
          <div class="nh-cell-action del-cell" data-action="delete-hist" data-id="${escapeHtml(item.id)}" title="Удалить">×</div>
        </div>`;
    });

    if (!lowerVal && filteredHist.length > 5) {
      const hiddenHistCount = filteredHist.length - 5;
      html += `
        <div class="nh-more-row" data-action="toggle-more-recent">
          <span>${state.showAllRecent ? "▴ Свернуть недавние" : `▾ Ещё ${hiddenHistCount} недавних`}</span>
          <span data-action="clear-all-hist" style="font-size:11.5px;color:#777;">Очистить историю</span>
        </div>`;
    }

    resultsContainer.innerHTML = html;
    bindResultsEvents();
  }

  function bindChipsEvents() {
    if (!chipsContainer) return;

    chipsContainer.onmousedown = (e) => {
      if (e.target.tagName !== "INPUT") e.preventDefault();
    };

    chipsContainer.querySelectorAll(".chip-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleChipInInput(btn.dataset.chip, "include");
      });
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleChipInInput(btn.dataset.chip, "exclude");
      });
    });

    chipsContainer.querySelectorAll(".chip-del").forEach(delBtn => {
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const chip = delBtn.dataset.delChip;
        state.chips = state.chips.filter(c => c !== chip);
        await saveCurrentProfile();
        renderChipsSection();
      });
    });

    const addChipBtn = chipsContainer.querySelector("#nh-add-chip");
    if (addChipBtn) {
      addChipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.addingChipInline = true;
        renderChipsSection();
        renderResultsSection("");
        const inp = chipsContainer.querySelector("#nh-inline-chip-input");
        if (inp) inp.focus();
      });
    }

    const inlineInp = chipsContainer.querySelector("#nh-inline-chip-input");
    if (inlineInp) {
      inlineInp.addEventListener("input", () => {
        renderResultsSection(inlineInp.value);
      });
      inlineInp.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const val = inlineInp.value.trim();
          if (val && !state.chips.includes(val)) {
            state.chips.push(val);
            await saveCurrentProfile();
          }
          state.addingChipInline = false;
          renderChipsSection();
          renderResultsSection();
          if (activeInput) activeInput.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          state.addingChipInline = false;
          renderChipsSection();
          renderResultsSection();
          if (activeInput) activeInput.focus();
        }
      });
    }

    chipsContainer.querySelector("#op-negate")?.addEventListener("click", (e) => { e.stopPropagation(); negateLastToken(); });
    chipsContainer.querySelector("#op-quote")?.addEventListener("click", (e) => { e.stopPropagation(); wrapLastTokenWithQuotes(); });
    chipsContainer.querySelector("#op-or")?.addEventListener("click", (e) => { e.stopPropagation(); appendTokenToInput("OR"); });
    chipsContainer.querySelector("#op-submit")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeInput) submitSearch(activeInput.value);
    });

    chipsContainer.querySelectorAll("[data-ns]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ns = btn.dataset.ns;
        if (ns.endsWith(":")) {
          state.activeNsFilter = state.activeNsFilter === ns ? "" : ns;
          renderChipsSection();
          renderResultsSection();
        } else {
          toggleChipInInput(ns, "include");
        }
      });
    });
  }

  function bindResultsEvents() {
    if (!resultsContainer) return;

    resultsContainer.onmousedown = (e) => {
      if (e.target.tagName !== "INPUT") e.preventDefault();
    };

    resultsContainer.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("auxclick", (e) => {
        if (e.button === 1 && el.dataset.action === "run-query") {
          e.preventDefault();
          e.stopPropagation();
          submitSearch(el.dataset.query, null, true);
        }
      });

      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === "pick-inline-chip") {
          const tag = el.dataset.tag;
          if (tag && !state.chips.includes(tag)) {
            state.chips.push(tag);
            await saveCurrentProfile();
          }
          state.addingChipInline = false;
          renderChipsSection();
          renderResultsSection();
          if (activeInput) activeInput.focus();
        } else if (action === "insert-token") {
          state.activeNsFilter = "";
          replaceLastTokenWith(el.dataset.tag);
        } else if (action === "add-chip-direct") {
          const tag = el.dataset.tag;
          if (tag && !state.chips.includes(tag)) {
            state.chips.push(tag);
            await saveCurrentProfile();
            renderChipsSection();
          }
        } else if (action === "submit-current") {
          if (activeInput) submitSearch(activeInput.value);
        } else if (action === "star-current") {
          if (activeInput) toggleFavorite(activeInput.value);
        } else if (action === "run-query") {
          const favItem = state.favorites.find(f => f.id === el.dataset.id);
          submitSearch(el.dataset.query, favItem || null);
        } else if (action === "append-query") {
          appendTokenToInput(el.dataset.query);
        } else if (action === "edit-fav") {
          state.editingId = el.dataset.id;
          renderResultsSection();
          resultsContainer.querySelector(`#edit-text-${state.editingId}`)?.focus();
        } else if (action === "cancel-edit") {
          state.editingId = null;
          renderResultsSection();
        } else if (action === "save-edit") {
          const id = el.dataset.id;
          const textInp = resultsContainer.querySelector(`#edit-text-${id}`);
          if (textInp && textInp.value.trim()) {
            const idx = state.favorites.findIndex(f => f.id === id);
            if (idx >= 0) {
              state.favorites[idx].text = textInp.value.trim();
              await saveCurrentProfile();
            }
          }
          state.editingId = null;
          renderResultsSection();
        } else if (action === "delete-fav") {
          state.favorites = state.favorites.filter(f => f.id !== el.dataset.id);
          await saveCurrentProfile();
          updateInbarButtons();
          renderResultsSection();
        } else if (action === "toggle-more-saved") {
          state.showAllSaved = !state.showAllSaved;
          renderResultsSection();
        } else if (action === "add-new-fav") {
          const newFavId = "fav_" + Date.now();
          const initialText = (activeInput && activeInput.value.trim()) || (isNyaaSite() ? "[SubsPlease] " : "");
          state.favorites.unshift({ id: newFavId, text: initialText, category: "", filter: "", addedAt: Date.now() });
          state.editingId = newFavId;
          state.showAllSaved = true;
          await saveCurrentProfile();
          renderResultsSection();
          resultsContainer.querySelector(`#edit-text-${newFavId}`)?.focus();
        } else if (action === "promote-hist") {
          await toggleFavorite(el.dataset.query);
        } else if (action === "delete-hist") {
          state.history = state.history.filter(h => h.id !== el.dataset.id);
          await saveCurrentProfile();
          renderResultsSection();
        } else if (action === "toggle-more-recent") {
          state.showAllRecent = !state.showAllRecent;
          renderResultsSection();
        } else if (action === "clear-all-hist") {
          state.history = [];
          await saveCurrentProfile();
          renderResultsSection();
        }
      });
    });

    resultsContainer.querySelectorAll(".nh-row[draggable='true']").forEach(row => {
      row.addEventListener("dragstart", (e) => {
        dragSrcIndex = Number(row.dataset.idx);
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        const targetIdx = Number(row.dataset.idx);
        if (dragSrcIndex !== null && dragSrcIndex !== targetIdx) {
          const moved = state.favorites.splice(dragSrcIndex, 1)[0];
          state.favorites.splice(targetIdx, 0, moved);
          await saveCurrentProfile();
          renderResultsSection();
        }
      });
      row.addEventListener("dragend", () => { row.classList.remove("dragging"); dragSrcIndex = null; });
    });
  }

  // On-Page Hover Tag Collector (nhentai, ExHentai, Danbooru, Gelbooru)
  function initPageTagCollector() {
    if (hoverPillHost) return;
    hoverPillHost = document.createElement("div");
    hoverPillHost.id = "nyaa-smart-hover-tag-pill";
    hoverPillHost.style.cssText = "position:fixed;z-index:2147483645;display:none;";
    document.body.appendChild(hoverPillHost);
    hoverPillShadow = hoverPillHost.attachShadow({ mode: "open" });
    hoverPillShadow.innerHTML = `
      <style>
        .pill-btn {
          background: #ed2553; color: #fff; border: 1px solid #ff5c82;
          border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700;
          cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.45);
          font-family: -apple-system, sans-serif;
        }
        .pill-btn:hover { background: #2ea043; border-color: #4ade80; }
      </style>
      <button type="button" class="pill-btn" id="collect-btn" title="Клик: в быстрые чипсы | Shift+клик: в строку поиска">+ тег</button>
    `;

    const collectBtn = hoverPillShadow.getElementById("collect-btn");
    collectBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredTagText) return;
      if (e.shiftKey && activeInput) {
        appendTokenToInput(hoveredTagText);
      } else if (!state.chips.includes(hoveredTagText)) {
        state.chips.push(hoveredTagText);
        await saveCurrentProfile();
        if (isDropdownOpen) renderChipsSection();
      }
      collectBtn.textContent = "✓";
      setTimeout(() => { collectBtn.textContent = "+ тег"; }, 900);
    });

    document.addEventListener("mouseover", (e) => {
      if (!isSiteEnabled() || state.settings?.pageTagHover === false) return;
      const target = e.target.closest("a.tag, .tag a, #taglist a, .search-tag, a[href*='/tag/'], a[href*='tags=']");
      if (!target) {
        if (!hoverPillHost.contains(e.target)) {
          hoverPillHost.style.display = "none";
        }
        return;
      }
      const rawName = (target.querySelector(".name")?.textContent || target.textContent || "").trim();
      if (!rawName || rawName.length > 50) return;
      hoveredTagText = rawName.replace(/\s*\(\d+\)$/, "").trim();
      const rect = target.getBoundingClientRect();
      hoverPillHost.style.top = `${Math.max(4, rect.top - 2)}px`;
      hoverPillHost.style.left = `${Math.min(window.innerWidth - 65, rect.right + 4)}px`;
      hoverPillHost.style.display = "block";
    });
  }

  function attachToInput(input) {
    if (!input || activeInput === input) return;
    activeInput = input;
    activeInput.setAttribute("autocomplete", "off");
    createInbarControls(activeInput);

    activeInput.addEventListener("focus", () => {
      if (isSiteEnabled()) {
        updateInbarButtons();
        openDropdown();
      }
    });
    activeInput.addEventListener("click", () => {
      if (isSiteEnabled()) openDropdown();
    });
    activeInput.addEventListener("input", () => {
      if (!isSiteEnabled()) return;
      updateInbarButtons();
      renderChipsSection();
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (!isDropdownOpen) openDropdown();
        else renderResultsSection();
      }, 60);
    });
    activeInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDropdown();
    });

    const form = activeInput.closest("form");
    if (form && !form.dataset.smartSearchBound) {
      form.dataset.smartSearchBound = "1";
      form.addEventListener("submit", () => {
        if (activeInput && activeInput.value.trim()) {
          recordQueryToHistory(activeInput.value);
        }
      });
    }
  }

  function detachUI() {
    closeDropdown();
    if (inbarHost) { inbarHost.remove(); inbarHost = null; }
    if (activeInput && activeInput.dataset.origPaddingRight) {
      activeInput.style.paddingRight = activeInput.dataset.origPaddingRight;
    }
    activeInput = null;
  }

  async function initOrRefresh() {
    await loadState();
    if (!isSiteEnabled()) {
      detachUI();
      return;
    }
    const input = findSearchInput();
    if (input) {
      attachToInput(input);
      positionInbarControls();
      updateInbarButtons();
    }
    initPageTagCollector();
  }

  document.addEventListener("mousedown", (e) => {
    if (state.pickingElement) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (
      (activeInput && path.includes(activeInput)) ||
      (hostEl && path.includes(hostEl)) ||
      (inbarHost && path.includes(inbarHost)) ||
      (hoverPillHost && path.includes(hoverPillHost))
    ) {
      return;
    }
    closeDropdown();
  });

  window.addEventListener("resize", () => {
    if (activeInput) {
      positionInbarControls();
      if (isDropdownOpen) positionDropdown();
    }
  });
  window.addEventListener("scroll", () => {
    if (activeInput) {
      positionInbarControls();
      if (isDropdownOpen) positionDropdown();
    }
  }, true);

  chrome.storage.onChanged.addListener(async () => {
    await loadState();
    if (!isSiteEnabled()) {
      detachUI();
    } else {
      if (!activeInput) {
        const input = findSearchInput();
        if (input) attachToInput(input);
      }
      updateInbarButtons();
      if (isDropdownOpen) {
        renderChipsSection();
        renderResultsSection();
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "START_PICKER") {
      startElementPicker();
      sendResponse({ ok: true });
    } else if (msg.type === "FAVORITES_UPDATED") {
      loadState().then(() => {
        updateInbarButtons();
        if (isDropdownOpen) {
          renderChipsSection();
          renderResultsSection();
        }
      });
    }
  });

  function startElementPicker() {
    state.pickingElement = true;
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#ed2553;color:#fff;padding:8px 16px;border-radius:6px;z-index:2147483647;font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    banner.textContent = "Кликните на нужное поле поиска на странице (или нажмите Esc для отмены)";
    document.body.appendChild(banner);

    const onClick = async (e) => {
      const target = e.target.closest("input, textarea");
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        let selector = "input";
        if (target.id) selector = `#${CSS.escape(target.id)}`;
        else if (target.name) selector = `input[name="${CSS.escape(target.name)}"]`;
        else if (target.className) selector = `input.${target.className.trim().split(/\s+/).join(".")}`;

        const host = getCleanHostname();
        state.customSelectors[host] = selector;
        await chrome.storage.local.set({ customSelectors: state.customSelectors });
        detachUI();
        attachToInput(target);
        openDropdown();
      }
    };
    const onKey = (e) => { if (e.key === "Escape") cleanup(); };
    function cleanup() {
      state.pickingElement = false;
      banner.remove();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  initOrRefresh();
})();

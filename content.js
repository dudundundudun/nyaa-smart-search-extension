(function () {
  if (window.__nyaaSmartSearchLoaded) return;
  window.__nyaaSmartSearchLoaded = true;

  const DEFAULT_SITE_PROFILES = {
    "nyaa.si": {
      chips: ["[SubsPlease]", "1080p", "HEVC", "Batch", "10bit", "[Erai-raws]", "Dual Audio", "(Uncensored)", "-chinese"],
      favorites: [
        { id: "fav_default_1", text: "[SubsPlease] 1080p", category: "1_2", filter: "0", addedAt: 1700000000000 },
        { id: "fav_default_2", text: "(Uncensored)", category: "", filter: "", addedAt: 1700000000001 },
        { id: "fav_default_3", text: "[Erai-raws] 1080p HEVC", category: "", filter: "", addedAt: 1700000000002 },
        { id: "fav_default_4", text: "1080p Batch", category: "", filter: "", addedAt: 1700000000003 }
      ]
    },
    "nhentai.net": {
      chips: [
        "russian", "english", "translated", "\"full color\"", "uncensored",
        "\"sole female\"", "\"sole male\"", "\"big breasts\"", "stockings",
        "nakadashi", "defloration", "milf", "ahegao", "-yaoi"
      ],
      favorites: [
        { id: "fav_nh_1", text: "russian translated", category: "", filter: "", addedAt: 1700000000010 },
        { id: "fav_nh_2", text: "english \"full color\" uncensored", category: "", filter: "", addedAt: 1700000000011 }
      ]
    },
    "exhentai.org": {
      chips: [
        "language:russian$", "language:english$", "language:translated$",
        "other:uncensored$", "other:\"full color$\"", "female:\"sole female$\"",
        "male:\"sole male$\"", "female:\"big breasts$\"", "female:stockings$",
        "female:nakadashi$", "female:defloration$", "female:milf$", "-male:yaoi$"
      ],
      favorites: [
        { id: "fav_eh_1", text: "language:russian$", category: "", filter: "", addedAt: 1700000000020 },
        { id: "fav_eh_2", text: "language:english$ language:translated$ other:uncensored$", category: "", filter: "", addedAt: 1700000000021 }
      ]
    },
    "danbooru.donmai.us": {
      chips: [
        "1girl", "solo", "highres", "absurdres", "long_hair", "breasts",
        "looking_at_viewer", "blush", "thighhighs", "order:score", "rating:general", "-animated"
      ],
      favorites: [
        { id: "fav_db_1", text: "1girl solo highres order:score", category: "", filter: "", addedAt: 1700000000030 }
      ]
    },
    "gelbooru.com": {
      chips: [
        "1girl", "solo", "highres", "absurdres", "long_hair", "breasts",
        "looking_at_viewer", "thighhighs", "uncensored", "sort:score:desc", "-animated"
      ],
      favorites: [
        { id: "fav_gb_1", text: "1girl solo highres sort:score:desc", category: "", filter: "", addedAt: 1700000000040 }
      ]
    }
  };

  let state = {
    enabledDomains: ["nyaa.si", "nyaa.land", "sukebei.nyaa.si", "nhentai.net", "exhentai.org", "e-hentai.org", "danbooru.donmai.us", "gelbooru.com"],
    siteProfiles: {},
    chips: [],
    favorites: [],
    history: [],
    customSelectors: {},
    settings: { pageTagHover: true, showRuTranslations: true },
    customTagDatabase: [],
    customDbLoaded: false,
    builtinTagDb: null,
    showAllSaved: false,
    showAllRecent: false,
    showAllQuickTags: false,
    editingId: null,
    addingChipInline: false,
    activeNsFilter: "",
    activeTabGroup: "top",
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
  let toastEl = null;
  let hoveredTagText = "";
  let isDropdownOpen = false;
  let globalListenersAttached = false;
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
    if (key.includes("exhentai") || key.includes("e-hentai")) return "exhentai";
    if (key.includes("nhentai") || key.includes("hitomi") || key.includes("pururin")) return "nhentai";
    if (key.includes("booru") || key.includes("rule34") || key.includes("yande") || key.includes("konachan")) return "booru";
    return "all";
  }

  function getDefaultProfileForCurrentSite() {
    const key = getProfileKey();
    if (DEFAULT_SITE_PROFILES[key]) {
      return JSON.parse(JSON.stringify(DEFAULT_SITE_PROFILES[key]));
    }
    const cat = getSiteCategory();
    if (cat === "exhentai") return JSON.parse(JSON.stringify(DEFAULT_SITE_PROFILES["exhentai.org"]));
    if (cat === "nhentai") return JSON.parse(JSON.stringify(DEFAULT_SITE_PROFILES["nhentai.net"]));
    if (cat === "booru") return JSON.parse(JSON.stringify(DEFAULT_SITE_PROFILES["danbooru.donmai.us"]));
    return {
      chips: ["1080p", "Russian", "English", "Uncensored", "Full Color"],
      favorites: []
    };
  }

  function isNyaaSite() {
    return getProfileKey() === "nyaa.si";
  }

  function isSiteEnabled() {
    const host = getCleanHostname();
    return (state.enabledDomains || []).some(d => host === d || host.endsWith("." + d));
  }

  // Quote-aware & bracket-aware query tokenizer
  function tokenizeSearchQuery(str) {
    const tokens = [];
    const s = String(str || "").trim();
    if (!s) return tokens;
    const re = /-?(?:[a-z0-9_]+:"[^"]*"|"[^"]*"|\[[^\]]*\]|\([^)]*\)|\S+)/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[0]) tokens.push(m[0]);
    }
    return tokens;
  }

  function normalizeBaseToken(tok) {
    return String(tok || "").trim().replace(/^-/, "").toLowerCase();
  }

  function formatTagForSite(rawTag) {
    const tag = String(rawTag || "").trim();
    if (!tag || tag.endsWith(":")) return tag;
    const isNeg = tag.startsWith("-");
    const clean = isNeg ? tag.slice(1) : tag;
    const cat = getSiteCategory();

    let res = clean;
    if (cat === "nhentai") {
      const stripped = clean.replace(/^(female|male|other|language):/i, "").replace(/\$$/, "").replace(/^"|"$/g, "");
      res = stripped.includes(" ") ? `"${stripped}"` : stripped;
    } else if (cat === "exhentai") {
      if (clean.includes('"') || clean.endsWith("$") || clean.startsWith("rating:") || clean.startsWith("pages:")) {
        res = clean;
      } else if (clean.includes(":")) {
        const [ns, rest] = clean.split(":");
        res = rest.includes(" ") ? `${ns}:"${rest}$"` : `${ns}:${rest}$`;
      } else {
        res = clean.includes(" ") ? `"${clean}$"` : clean;
      }
    } else {
      if (clean.includes(" ") && !clean.startsWith("[") && !clean.startsWith("(") && !clean.startsWith('"')) {
        res = `"${clean}"`;
      }
    }
    return isNeg ? `-${res}` : res;
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
    if (!state.customDbLoaded) {
      state.customDbLoaded = true;
      const { customTagDatabase } = await chrome.storage.local.get(["customTagDatabase"]);
      if (Array.isArray(customTagDatabase)) state.customTagDatabase = customTagDatabase;
    }
    return state.builtinTagDb;
  }

  function getActiveTagPool() {
    const db = state.builtinTagDb || { nyaa: [], booru: [], hentai: [] };
    const cat = getSiteCategory();
    let pool = [];
    if (cat === "nyaa") {
      pool = [...(db.nyaa || [])];
    } else if (cat === "exhentai") {
      pool = [...(db.hentai || []), ...(db.booru || [])];
    } else if (cat === "nhentai") {
      const rawHentai = [...(db.hentai || []), ...(db.booru || [])];
      const seenNh = new Set();
      for (const item of rawHentai) {
        if (!item.t || item.t.endsWith(":")) continue;
        const cleanT = item.t.replace(/^(female|male|other|language):/i, "");
        if (seenNh.has(cleanT.toLowerCase())) continue;
        seenNh.add(cleanT.toLowerCase());
        pool.push({
          t: cleanT,
          c: item.c,
          g: item.g,
          d: item.d || "",
          p: item.p
        });
      }
    } else if (cat === "booru") {
      pool = [...(db.booru || []), ...(db.hentai || [])];
    } else {
      pool = [...(db.nyaa || []), ...(db.hentai || []), ...(db.booru || [])];
    }

    if (Array.isArray(state.customTagDatabase) && state.customTagDatabase.length > 0) {
      pool = [...state.customTagDatabase, ...pool];
    }
    return pool;
  }

  // Map tag to Russian description if available in builtin DB
  function getTagDescription(tagText) {
    const pool = getActiveTagPool();
    const norm = normalizeBaseToken(tagText).replace(/\$$/, "").replace(/"/g, "");
    for (const item of pool) {
      if (!item.d) continue;
      const itemNorm = normalizeBaseToken(formatTagForSite(item.t)).replace(/\$$/, "").replace(/"/g, "");
      const rawNorm = normalizeBaseToken(item.t).replace(/^(female|male|other|language):/i, "");
      if (itemNorm === norm || rawNorm === norm) return item.d;
    }
    return "";
  }

  // Self-learning frequency tags from user's history & favorites
  function getSmartFrequentTags(limit = 7) {
    const counts = new Map();
    const chipNormSet = new Set(state.chips.map(c => normalizeBaseToken(formatTagForSite(c))));

    for (const fav of state.favorites) {
      for (const tok of tokenizeSearchQuery(fav.text)) {
        if (tok.toUpperCase() === "OR" || tok.length < 2) continue;
        const norm = normalizeBaseToken(tok);
        if (chipNormSet.has(norm)) continue;
        counts.set(tok, (counts.get(tok) || 0) + 3);
      }
    }
    for (const h of state.history) {
      const weight = Math.min(10, h.count || 1);
      for (const tok of tokenizeSearchQuery(h.text)) {
        if (tok.toUpperCase() === "OR" || tok.length < 2) continue;
        const norm = normalizeBaseToken(tok);
        if (chipNormSet.has(norm)) continue;
        counts.set(tok, (counts.get(tok) || 0) + weight);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(e => e[0]);
  }

  async function loadState(includeCustomDb = false) {
    const keysToFetch = ["enabledDomains", "siteProfiles", "customSelectors", "settings"];
    if (includeCustomDb) keysToFetch.push("customTagDatabase");

    const data = await chrome.storage.local.get(keysToFetch);
    if (data.enabledDomains) state.enabledDomains = data.enabledDomains;
    if (data.customSelectors) state.customSelectors = data.customSelectors;
    if (data.settings) state.settings = { pageTagHover: true, showRuTranslations: true, ...data.settings };
    if (includeCustomDb && Array.isArray(data.customTagDatabase)) {
      state.customTagDatabase = data.customTagDatabase;
      state.customDbLoaded = true;
    }

    const profiles = data.siteProfiles || {};
    state.siteProfiles = profiles;
    const key = getProfileKey();
    const defProf = getDefaultProfileForCurrentSite();
    const currentProfile = profiles[key] || { chips: [], favorites: [], history: [] };

    let needsSave = false;
    let chips = Array.isArray(currentProfile.chips) ? currentProfile.chips : [];
    const hasBrokenExChips = key === "exhentai.org" && chips.some(c => c.endsWith(":"));
    if (chips.length === 0 || hasBrokenExChips) {
      chips = [...defProf.chips];
      needsSave = true;
    }

    let favorites = Array.isArray(currentProfile.favorites) ? currentProfile.favorites : [];
    if (favorites.length === 0 && defProf.favorites && defProf.favorites.length > 0 && (!profiles[key] || !profiles[key].history?.length)) {
      favorites = [...defProf.favorites];
      needsSave = true;
    }

    state.chips = chips;
    state.favorites = favorites;
    state.history = Array.isArray(currentProfile.history) ? currentProfile.history : [];

    if (needsSave) {
      await saveCurrentProfile();
    }
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

  function getCurrentTokenInfo(val) {
    const str = String(val || "");
    const lastSpace = str.lastIndexOf(" ");
    const prefix = lastSpace >= 0 ? str.slice(0, lastSpace + 1) : "";
    const token = lastSpace >= 0 ? str.slice(lastSpace + 1) : str;
    return { prefix, token };
  }

  function replaceLastTokenWith(rawTagText) {
    if (!activeInput) return;
    if (rawTagText.endsWith(":")) {
      state.activeNsFilter = state.activeNsFilter === rawTagText ? "" : rawTagText;
      renderChipsSection();
      renderResultsSection();
      return;
    }
    const val = activeInput.value || "";
    const { prefix } = getCurrentTokenInfo(val);
    const formatted = formatTagForSite(rawTagText);
    const nextVal = (prefix + formatted).trimEnd() + " ";
    setInputValue(activeInput, nextVal, true);
    openDropdown();
  }

  // Capsule operations by exact token index (allows editing middle of query with mouse!)
  function removeTokenAtIndex(idx) {
    if (!activeInput) return;
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (idx < 0 || idx >= tokens.length) return;
    tokens.splice(idx, 1);
    setInputValue(activeInput, tokens.length ? tokens.join(" ") + " " : "", true);
    openDropdown();
  }

  function toggleNegateTokenAtIndex(idx) {
    if (!activeInput) return;
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (idx < 0 || idx >= tokens.length) return;
    const t = tokens[idx];
    tokens[idx] = t.startsWith("-") ? t.slice(1) : `-${t}`;
    setInputValue(activeInput, tokens.join(" ") + " ", true);
    openDropdown();
  }

  function toggleQuoteTokenAtIndex(idx) {
    if (!activeInput) return;
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (idx < 0 || idx >= tokens.length) return;
    const t = tokens[idx];
    const isNeg = t.startsWith("-");
    const body = isNeg ? t.slice(1) : t;
    const nextBody = body.startsWith('"') && body.endsWith('"') ? body.slice(1, -1) : `"${body}"`;
    tokens[idx] = isNeg ? `-${nextBody}` : nextBody;
    setInputValue(activeInput, tokens.join(" ") + " ", true);
    openDropdown();
  }

  function wrapLastTokenWithQuotes() {
    if (!activeInput) return;
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (!tokens.length) return;
    toggleQuoteTokenAtIndex(tokens.length - 1);
  }

  function negateLastToken() {
    if (!activeInput) return;
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (!tokens.length) {
      setInputValue(activeInput, "-", true);
      return;
    }
    toggleNegateTokenAtIndex(tokens.length - 1);
  }

  function getNyaaSelects() {
    if (!isNyaaSite()) return { category: "0_0", filter: "0" };
    const catSelect = document.querySelector('select[name="c"]');
    const filterSelect = document.querySelector('select[name="f"]');
    return {
      category: catSelect ? catSelect.value : "0_0",
      filter: filterSelect ? filterSelect.value : "0"
    };
  }

  function applyNyaaSelects(item) {
    if (!item || !isNyaaSite()) return;
    if (item.category !== undefined && item.category !== "") {
      const catSelect = document.querySelector('select[name="c"]');
      if (catSelect) {
        catSelect.value = item.category;
        catSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (item.filter !== undefined && item.filter !== "") {
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
        if (isNyaaSite()) {
          const sel = getNyaaSelects();
          if (sel.category) url.searchParams.set("c", sel.category);
          if (sel.filter) url.searchParams.set("f", sel.filter);
        }
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
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (!tokens.length) {
      setInputValue(activeInput, "", true);
      return;
    }
    tokens.pop();
    setInputValue(activeInput, tokens.length ? tokens.join(" ") + " " : "", true);
    openDropdown();
  }

  // Quote-safe token state detector
  function getChipStateInInput(chip, inputVal) {
    const tokens = tokenizeSearchQuery(inputVal);
    if (!tokens.length) return "off";
    const normChip = normalizeBaseToken(formatTagForSite(chip));
    const normRaw = normalizeBaseToken(chip);

    for (const tok of tokens) {
      const isNeg = tok.startsWith("-");
      const normTok = normalizeBaseToken(tok);
      if (normTok === normChip || normTok === normRaw) {
        return isNeg ? "excluded" : "included";
      }
    }
    return "off";
  }

  // Quote-safe toggleChipInInput (LMB: include, RMB: exclude)
  function toggleChipInInput(chip, mode = "include") {
    if (!activeInput) return;
    if (chip.endsWith(":")) {
      state.activeNsFilter = state.activeNsFilter === chip ? "" : chip;
      renderChipsSection();
      renderResultsSection();
      return;
    }

    const tokens = tokenizeSearchQuery(activeInput.value);
    const formattedBase = formatTagForSite(chip).replace(/^-/, "");
    const normChip = normalizeBaseToken(formattedBase);
    const normRaw = normalizeBaseToken(chip);
    const curState = getChipStateInInput(chip, activeInput.value);

    const filtered = tokens.filter(tok => {
      const n = normalizeBaseToken(tok);
      return n !== normChip && n !== normRaw;
    });

    const targetToken = mode === "exclude" ? `-${formattedBase}` : formattedBase;
    if (!((mode === "include" && curState === "included") || (mode === "exclude" && curState === "excluded"))) {
      filtered.push(targetToken);
    }

    setInputValue(activeInput, filtered.length ? filtered.join(" ") + " " : "", true);
    openDropdown();
  }

  function appendTokenToInput(tokenStr) {
    if (!activeInput) return;
    const currentTokens = tokenizeSearchQuery(activeInput.value);
    const newTokens = tokenizeSearchQuery(tokenStr);
    const existingNorms = new Set(currentTokens.map(t => t.toLowerCase()));
    for (const nt of newTokens) {
      if (!existingNorms.has(nt.toLowerCase())) {
        currentTokens.push(nt);
        existingNorms.add(nt.toLowerCase());
      }
    }
    setInputValue(activeInput, currentTokens.length ? currentTokens.join(" ") + " " : "", true);
    openDropdown();
  }

  function queryTagDatabase(query, limit = 36, groupFilter = "") {
    const q = (query || "").trim().toLowerCase();
    const ns = state.activeNsFilter;
    const pool = getActiveTagPool();

    const prefixMatches = [];
    const subMatches = [];
    const seen = new Set();

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      const tag = item.t;
      if (!tag) continue;
      if (!q && !ns && tag.endsWith(":")) continue;
      if (groupFilter && groupFilter !== "top" && item.g && item.g !== groupFilter) continue;

      const lowerTag = tag.toLowerCase();
      if (seen.has(lowerTag)) continue;

      if (ns && !lowerTag.startsWith(ns)) continue;
      if (!q) {
        seen.add(lowerTag);
        prefixMatches.push(item);
        if (prefixMatches.length >= limit) break;
        continue;
      }

      const lowerDesc = (item.d || "").toLowerCase();
      if (lowerTag.startsWith(q) || (ns && lowerTag.slice(ns.length).startsWith(q))) {
        seen.add(lowerTag);
        prefixMatches.push(item);
      } else if (lowerTag.includes(q) || lowerDesc.includes(q)) {
        seen.add(lowerTag);
        subMatches.push(item);
      }
      if (prefixMatches.length >= limit && subMatches.length >= limit) break;
    }
    return [...prefixMatches, ...subMatches].slice(0, limit);
  }

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText = "position:fixed;bottom:18px;right:18px;background:#18181b;color:#4ade80;border:1px solid #2ea043;padding:8px 14px;border-radius:6px;font-family:-apple-system,sans-serif;font-size:13px;font-weight:600;z-index:2147483647;box-shadow:0 6px 20px rgba(0,0,0,0.6);transition:opacity 0.2s;pointer-events:none;opacity:0;";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      if (toastEl) toastEl.style.opacity = "0";
    }, 1600);
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
          background: #1c1c1f;
          color: #e4e4e7;
          border: 1px solid #3f3f46;
          border-top: none;
          border-radius: 0 0 8px 8px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.78);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          max-height: 560px;
          display: flex;
          flex-direction: column;
          user-select: none;
          overflow: hidden;
        }
        .nh-results {
          overflow-y: auto;
          flex: 1;
        }
        .nh-results::-webkit-scrollbar { width: 8px; }
        .nh-results::-webkit-scrollbar-track { background: #141417; }
        .nh-results::-webkit-scrollbar-thumb { background: #4d4d56; border-radius: 4px; }

        /* Interactive Current Query Capsules Bar */
        .capsules-bar {
          display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
          padding: 6px 10px; background: #111827; border-bottom: 1px solid #1e293b;
        }
        .capsule-label {
          font-size: 10.5px; color: #60a5fa; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.4px; margin-right: 4px;
        }
        .q-capsule {
          display: inline-flex; align-items: center; gap: 4px;
          background: #1e3a8a; color: #eff6ff; border: 1px solid #3b82f6;
          border-radius: 12px; padding: 2px 8px; font-size: 12px; cursor: pointer;
          font-family: Consolas, Monaco, "Courier New", monospace;
          transition: all 0.12s;
        }
        .q-capsule:hover { background: #dc2626; border-color: #f87171; color: #fff; }
        .q-capsule.negated {
          background: #4c0519; color: #fecdd3; border-color: #e11d48; text-decoration: line-through;
        }
        .q-capsule .cap-x { font-size: 11px; opacity: 0.75; }

        .chips-bar {
          display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
          padding: 7px 10px; background: #141417; border-bottom: 1px solid #27272a;
        }
        .chips-label {
          font-size: 10.5px; color: #a1a1aa; margin-right: 3px;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .chip-wrap {
          display: inline-flex; align-items: center; position: relative;
        }
        .chip-btn {
          background: #27272a; color: #e4e4e7; border: 1px solid #3f3f46;
          border-radius: 4px; padding: 3px 7px; font-size: 12px; cursor: pointer;
          transition: all 0.12s; font-family: Consolas, Monaco, "Courier New", monospace;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .chip-btn:hover { background: #3f3f46; color: #fff; border-color: #71717a; }
        .chip-btn.included { background: #78350f; color: #fef3c7; border-color: #f59e0b; }
        .chip-btn.excluded { background: #4c0519; color: #ffe4e6; border-color: #f43f5e; text-decoration: line-through; }
        .chip-btn.smart-freq { border-color: #0284c7; background: #0f2942; }
        .chip-sub {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10.5px; color: #9ca3af; font-weight: 400;
        }
        .chip-btn.included .chip-sub { color: #fde68a; }
        .chip-del {
          display: none; margin-left: -4px; background: #4c0519; color: #fda4af;
          border: 1px solid #be123c; border-radius: 0 4px 4px 0; padding: 3px 5px;
          font-size: 11px; cursor: pointer; line-height: 1;
        }
        .chip-wrap:hover .chip-del { display: inline-block; }
        .chip-wrap:hover .chip-btn { border-top-right-radius: 0; border-bottom-right-radius: 0; }
        .chip-add-btn {
          background: transparent; color: #a1a1aa; border: 1px dashed #52525b;
          border-radius: 4px; padding: 2px 7px; font-size: 11.5px; cursor: pointer;
        }
        .chip-add-btn:hover { color: #fff; border-color: #a1a1aa; }
        .inline-chip-box {
          display: inline-flex; align-items: center; gap: 4px;
        }
        .inline-chip-input {
          background: #09090b; color: #fff; border: 1px solid #ed2553;
          border-radius: 4px; padding: 2px 7px; font-size: 12px; width: 160px; outline: none;
        }

        /* Quick Operator & Site Filter Toolbar */
        .ops-bar {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 5px; padding: 5px 10px;
          background: #18181b; border-bottom: 1px solid #27272a;
        }
        .ops-group { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .op-btn {
          background: #27272a; color: #d4d4d8; border: 1px solid #3f3f46;
          border-radius: 4px; padding: 2px 7px; font-size: 11.5px; cursor: pointer;
          transition: all 0.1s;
        }
        .op-btn:hover { background: #3f3f46; color: #fff; }
        .op-btn.active { background: #2563eb; color: #fff; border-color: #60a5fa; font-weight: 600; }
        .op-btn.nyaa-sel { background: #1e293b; border-color: #334155; color: #93c5fd; }
        .op-btn.nyaa-sel.active { background: #0284c7; border-color: #38bdf8; color: #fff; }
        .op-btn.search-submit-btn {
          background: #ed2553; color: #fff; border-color: #ed2553; font-weight: 700; padding: 3px 12px;
        }
        .op-btn.search-submit-btn:hover { background: #d41c47; }

        /* Category Tabs for 1-click Mouse Browsing */
        .cat-tabs {
          display: flex; align-items: center; gap: 4px; overflow-x: auto;
          padding: 5px 10px; background: #141417; border-bottom: 1px solid #27272a;
        }
        .cat-tab {
          background: #222226; color: #a1a1aa; border: 1px solid #323238;
          border-radius: 5px; padding: 3px 9px; font-size: 11.5px; font-weight: 600;
          cursor: pointer; white-space: nowrap; transition: all 0.12s;
        }
        .cat-tab:hover { color: #fff; background: #2e2e34; }
        .cat-tab.active {
          background: #ed2553; color: #fff; border-color: #ff4d79;
        }

        .quick-cloud {
          display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
          padding: 8px 10px; background: #18181c; border-bottom: 1px solid #27272a;
        }

        .search-for-row {
          display: flex; align-items: stretch; background: #27272a;
          border-bottom: 1px solid #3f3f46; min-height: 36px;
        }
        .search-for-main {
          flex: 1; display: flex; align-items: center; padding: 6px 12px;
          cursor: pointer; color: #d4d4d8; gap: 8px; overflow: hidden;
        }
        .search-for-main:hover { background: #323236; }
        .search-for-query {
          color: #fff; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .nh-section-hdr {
          display: flex; align-items: center; justify-content: space-between;
          padding: 5px 12px; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; color: #a1a1aa; background: #141417; border-bottom: 1px solid #27272a;
        }
        .nh-row {
          display: flex; align-items: stretch; background: #1c1c1f;
          border-bottom: 1px solid #27272a; min-height: 34px; transition: background 0.08s;
        }
        .nh-row:hover { background: #27272a; }
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
          color: #f4f4f5; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nh-text.mono { font-family: Consolas, Monaco, "Courier New", monospace; font-size: 12.5px; }
        .nh-desc {
          color: #9ca3af; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-left: 4px;
        }
        .nh-count {
          color: #9ca3af; font-size: 11.5px; margin-left: auto; padding-left: 8px; flex-shrink: 0;
        }
        .nh-cell-action {
          width: 34px; display: flex; align-items: center; justify-content: center;
          border-left: 1px solid #27272a; color: #a1a1aa; cursor: pointer;
          font-size: 13.5px; flex-shrink: 0; background: transparent; transition: background 0.1s, color 0.1s;
        }
        .nh-cell-action:hover { background: #343438; color: #fff; }
        .nh-cell-action.star-cell.active, .nh-cell-action.star-cell:hover { color: #f5b942; }
        .nh-cell-action.del-cell:hover { background: #4c0519; color: #fda4af; }
        .nh-cell-action.drag-cell {
          cursor: grab; width: 24px; font-size: 12px; color: #71717a;
          border-left: none; border-right: 1px solid #27272a;
        }
        .nh-more-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 12px; background: #141417; border-bottom: 1px solid #27272a;
          color: #a1a1aa; font-size: 12px; cursor: pointer;
        }
        .nh-more-row:hover { background: #222226; color: #f4f4f5; }
        .nh-add-fav-btn { color: #f5b942; font-size: 12px; cursor: pointer; padding: 2px 6px; border-radius: 3px; font-weight: 600; }
        .nh-add-fav-btn:hover { background: rgba(245, 185, 66, 0.15); }
        .nh-edit-wrap { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 8px; background: #27272a; }
        .nh-edit-input { flex: 1; background: #09090b; color: #fff; border: 1px solid #52525b; border-radius: 3px; padding: 4px 8px; font-size: 13px; }
        .nh-edit-save { background: #2ea043; color: #fff; border: none; border-radius: 3px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-weight: 600; }
        .nh-edit-cancel { background: #3f3f46; color: #e4e4e7; border: none; border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 12px; }
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
    width = Math.max(width, 540);
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

  function getCategoryTabsForSite() {
    const cat = getSiteCategory();
    if (cat === "nyaa") {
      return [
        { id: "top", label: "🔥 Все теги" },
        { id: "groups", label: "🎬 Релиз-группы" },
        { id: "video", label: "📺 Качество / Кодек" },
        { id: "batch", label: "📦 Батчи / Звук" }
      ];
    }
    if (cat === "exhentai" || cat === "nhentai") {
      return [
        { id: "top", label: "🔥 Топ тегов" },
        { id: "lang", label: "🌐 Язык и цвет" },
        { id: "female", label: "♀ Девушки" },
        { id: "fetish", label: "💗 Жанры и фетиши" },
        { id: "male", label: "♂ Мужчины" },
        { id: "parody", label: "🎨 Пародии / Тайтлы" }
      ];
    }
    if (cat === "booru") {
      return [
        { id: "top", label: "🔥 Топ тегов" },
        { id: "char", label: "👧 Внешность" },
        { id: "attire", label: "👗 Одежда и тело" },
        { id: "copy", label: "🎬 Тайтлы" },
        { id: "meta", label: "⭐ Качество / Рейтинг" }
      ];
    }
    return [{ id: "top", label: "🔥 Популярные теги" }];
  }

  function getQuickSiteFilterButtons() {
    const cat = getSiteCategory();
    if (cat === "exhentai") {
      return [
        { token: "rating:4", label: "★ 4+", tip: "Рейтинг от 4 звёзд" },
        { token: "rating:5", label: "★ 5", tip: "Только 5 звёзд" },
        { token: "pages:>20", label: "📖 20+ стр.", tip: "Больше 20 страниц" },
        { token: "pages:>50", label: "📖 50+ стр.", tip: "Больше 50 страниц" },
        { token: "pages:>100", label: "📚 100+ стр.", tip: "Целая книга (100+ страниц)" },
        { token: "-other:\"ai generated$\"", label: "🚫 Без AI", tip: "Исключить нейросетевые работы" }
      ];
    }
    if (cat === "nhentai") {
      return [
        { token: "pages:>20", label: "📖 20+ стр.", tip: "Больше 20 страниц" },
        { token: "pages:>50", label: "📖 50+ стр.", tip: "Больше 50 страниц" },
        { token: "pages:>100", label: "📚 100+ стр.", tip: "Танкобон (100+ страниц)" },
        { token: "-yaoi", label: "🚫 Без Яоя", tip: "Исключить yaoi" },
        { token: "-futanari", label: "🚫 Без Футы", tip: "Исключить futanari" }
      ];
    }
    if (cat === "booru") {
      const isGel = getProfileKey().includes("gelbooru");
      return [
        { token: isGel ? "sort:score:desc" : "order:score", label: "🔥 По рейтингу", tip: "Сортировать по лучшим" },
        { token: "rating:general", label: "🟢 SFW", tip: "Безопасный контент" },
        { token: "rating:explicit", label: "🔞 NSFW", tip: "Откровенный контент (18+)" },
        { token: "-animated", label: "🚫 Без видео", tip: "Только статика" }
      ];
    }
    return [];
  }

  function renderChipsSection() {
    if (!chipsContainer || !activeInput) return;
    const trimmedVal = (activeInput.value || "").trim();
    const tokens = tokenizeSearchQuery(trimmedVal);
    const siteCat = getSiteCategory();

    let html = "";

    // 0. Interactive Active Query Capsules (1-click remove or negate any word in the query!)
    if (tokens.length > 0) {
      html += `<div class="capsules-bar">
        <span class="capsule-label" title="ЛКМ: удалить слово | ПКМ: переключить минус (-) | СКМ: кавычки">Сейчас в поиске:</span>`;
      tokens.forEach((tok, idx) => {
        const isNeg = tok.startsWith("-");
        html += `<button type="button" class="q-capsule ${isNeg ? "negated" : ""}" data-cap-idx="${idx}" title="ЛКМ: убрать «${escapeHtml(tok)}» | ПКМ: вкл/выкл минус (-) | СКМ: кавычки">
          <span>${escapeHtml(tok)}</span>
          <span class="cap-x">×</span>
        </button>`;
      });
      html += `<button type="button" class="chip-add-btn" id="cap-clear-all" style="margin-left:auto;border-color:#ef4444;color:#fca5a5;" title="Очистить всю строку поиска">🗑 Очистить</button>
      </div>`;
    }

    // 1. Pinned + Smart Frequent Chips Bar
    html += `<div class="chips-bar">
      <span class="chips-label" title="ЛКМ: добавить/убрать | ПКМ: исключить (-тег)">Теги (${escapeHtml(getProfileKey())}):</span>`;

    for (const chip of state.chips) {
      const chipState = getChipStateInInput(chip, trimmedVal);
      const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "";
      const ruDesc = state.settings.showRuTranslations !== false ? getTagDescription(chip) : "";
      html += `<span class="chip-wrap">
        <button type="button" class="chip-btn ${cls}" data-chip="${escapeHtml(chip)}" title="${escapeHtml(ruDesc ? ruDesc + " | ЛКМ: +тег | ПКМ: -тег" : "ЛКМ: +тег | ПКМ: -тег (исключить)")}">
          <span>${escapeHtml(chip)}</span>
        </button>
        <button type="button" class="chip-del" data-del-chip="${escapeHtml(chip)}" title="Убрать из панели">×</button>
      </span>`;
    }

    // Self-learning Frequent Tags from user's history/favorites
    const smartFreqs = getSmartFrequentTags(5);
    for (const freqTag of smartFreqs) {
      const chipState = getChipStateInInput(freqTag, trimmedVal);
      const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "smart-freq";
      html += `<span class="chip-wrap">
        <button type="button" class="chip-btn ${cls}" data-chip="${escapeHtml(freqTag)}" title="Частый тег из вашей истории (ЛКМ: +тег | ПКМ: -тег)">🔥 ${escapeHtml(freqTag)}</button>
      </span>`;
    }

    if (state.addingChipInline) {
      html += `<span class="inline-chip-box">
        <input type="text" class="inline-chip-input" id="nh-inline-chip-input" placeholder="Кликните тег ниже или введите..." autocomplete="off" />
        <button type="button" class="chip-add-btn" id="nh-cancel-inline-chip" title="Закрыть">✕</button>
      </span>`;
    } else {
      html += `<button type="button" class="chip-add-btn" id="nh-add-chip" title="Закрепить новые теги мышкой">+ тег</button>
      <button type="button" class="chip-add-btn" id="nh-reset-default-chips" title="Восстановить стандартные теги для этого сайта">↺</button>`;
    }
    html += `</div>`;

    // 2. Quick Operators + Site-Specific Filters Bar
    const quickFilters = getQuickSiteFilterButtons();
    const nyaaSel = isNyaaSite() ? getNyaaSelects() : null;

    html += `<div class="ops-bar">
      <div class="ops-group">
        <button type="button" class="op-btn" id="op-negate" title="Поставить/убрать минус (-) у последнего слова">− Исключить</button>
        <button type="button" class="op-btn" id="op-quote" title="Взять последнее слово в точные кавычки">&quot;&quot; Точно</button>
        <button type="button" class="op-btn" id="op-or" title="Добавить оператор ИЛИ (OR)">OR</button>`;

    if (isNyaaSite() && nyaaSel) {
      const cats = [
        { val: "0_0", label: "Все рубрики" },
        { val: "1_2", label: "🎬 Anime Eng" },
        { val: "1_4", label: "🇯🇵 Anime Raw" },
        { val: "3_1", label: "📖 Manga Eng" }
      ];
      const filts = [
        { val: "0", label: "Все раздачи" },
        { val: "1", label: "🚫 No Remakes" },
        { val: "2", label: "✅ Trusted" }
      ];
      for (const c of cats) {
        html += `<button type="button" class="op-btn nyaa-sel ${nyaaSel.category === c.val ? "active" : ""}" data-nyaa-cat="${c.val}" title="Переключить категорию Nyaa">${c.label}</button>`;
      }
      for (const f of filts) {
        html += `<button type="button" class="op-btn nyaa-sel ${nyaaSel.filter === f.val ? "active" : ""}" data-nyaa-filt="${f.val}" title="Переключить фильтр раздач Nyaa">${f.label}</button>`;
      }
    } else {
      for (const qf of quickFilters) {
        const st = getChipStateInInput(qf.token, trimmedVal);
        html += `<button type="button" class="op-btn ${st !== "off" ? "active" : ""}" data-filter-tok="${escapeHtml(qf.token)}" title="${escapeHtml(qf.tip)}">${escapeHtml(qf.label)}</button>`;
      }
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
    const { token } = getCurrentTokenInfo(rawVal);

    let html = "";

    // Inline "+ тег" mode
    if (state.addingChipInline) {
      const qStr = inlineChipQuery !== null ? inlineChipQuery : "";
      const matches = queryTagDatabase(qStr, 40);
      html += `<div class="nh-section-hdr">
        <span>Кликните мышкой по тегу, чтобы закрепить его в верхнем ряду:</span>
      </div>`;
      if (qStr.trim() && !state.chips.includes(qStr.trim())) {
        html += `<div class="nh-row" data-action="pick-inline-chip" data-tag="${escapeHtml(qStr.trim())}">
          <div class="nh-cell-main">
            <span class="nh-star-icon">+</span>
            <span class="nh-text mono">Добавить свой тег: «${escapeHtml(qStr.trim())}»</span>
          </div>
        </div>`;
      }
      matches.forEach(item => {
        const formatted = formatTagForSite(item.t);
        const alreadyPinned = state.chips.includes(formatted) || state.chips.includes(item.t);
        html += `
          <div class="nh-row" data-action="pick-inline-chip" data-tag="${escapeHtml(formatted)}">
            <div class="nh-cell-main">
              <span class="nh-tag-dot dot-${escapeHtml(item.c || "general")}"></span>
              <span class="nh-text mono cat-${escapeHtml(item.c || "general")}">${escapeHtml(formatted)}</span>
              ${item.d ? `<span class="nh-desc">— ${escapeHtml(item.d)}</span>` : ""}
              ${alreadyPinned ? `<span class="nh-count" style="color:#4ade80;">✓ закреплён</span>` : `<span class="nh-count">+ закрепить</span>`}
            </div>
          </div>`;
      });
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

    // 2. Category Tabs + Mouse-Only Next Tag Cloud OR Autocomplete List
    const tokenClean = token.replace(/^[-+"]/, "");
    if (tokenClean.length >= 1 || state.activeNsFilter) {
      const dbMatches = queryTagDatabase(tokenClean, 25);
      if (dbMatches.length > 0) {
        html += `<div class="nh-section-hdr">
          <span>Подсказки из базы (ЛКМ: +в поиск | ПКМ: -исключить)</span>
          ${state.activeNsFilter ? `<span style="color:#60a5fa;cursor:pointer;" data-action="clear-ns">✕ Сбросить фильтр ${escapeHtml(state.activeNsFilter)}</span>` : ""}
        </div>`;
        dbMatches.forEach(item => {
          const catCls = escapeHtml(item.c || "general");
          const formatted = formatTagForSite(item.t);
          const popStr = item.p >= 1000 ? `${Math.round(item.p / 1000)}k` : (item.p || "");
          html += `
            <div class="nh-row">
              <div class="nh-cell-main" data-action="insert-token" data-tag="${escapeHtml(item.t)}" title="ЛКМ: добавить к запросу | ПКМ: исключить (-тег)">
                <span class="nh-tag-dot dot-${catCls}"></span>
                <span class="nh-text mono cat-${catCls}">${escapeHtml(formatted)}</span>
                ${item.d ? `<span class="nh-desc">— ${escapeHtml(item.d)}</span>` : ""}
                ${popStr ? `<span class="nh-count">${popStr}</span>` : ""}
              </div>
              <div class="nh-cell-action" data-action="run-query" data-query="${escapeHtml(formatted)}" title="Искать сразу только этот тег">🔍</div>
              <div class="nh-cell-action star-cell" data-action="add-chip-direct" data-tag="${escapeHtml(formatted)}" title="Закрепить этот тег в верхних чипсах">📌</div>
            </div>
          `;
        });
      }
    } else {
      // Category Tabs for 1-click Mouse Browsing
      const tabs = getCategoryTabsForSite();
      if (!tabs.some(t => t.id === state.activeTabGroup)) {
        state.activeTabGroup = "top";
      }
      html += `<div class="cat-tabs">`;
      for (const tab of tabs) {
        html += `<button type="button" class="cat-tab ${state.activeTabGroup === tab.id ? "active" : ""}" data-tab-group="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`;
      }
      html += `</div>`;

      const limit = state.showAllQuickTags || state.activeTabGroup !== "top" ? 50 : 18;
      const groupItems = queryTagDatabase("", limit, state.activeTabGroup);

      if (groupItems.length > 0) {
        html += `<div class="nh-section-hdr">
          <span>➕ Кликните мышкой для добавления тегов (ЛКМ: +тег | ПКМ: -исключить)</span>
          <span style="color:#f5b942;cursor:pointer;text-transform:none;" data-action="toggle-more-quick">${state.showAllQuickTags ? "▴ Компактно" : "▾ Показать все"}</span>
        </div>
        <div class="quick-cloud">`;
        groupItems.forEach(item => {
          const formatted = formatTagForSite(item.t);
          const chipState = getChipStateInInput(formatted, trimmedVal);
          const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "";
          const showRu = state.settings.showRuTranslations !== false && item.d;
          const tip = item.d ? `${item.d} (ЛКМ: +тег | ПКМ: -тег)` : "ЛКМ: +тег | ПКМ: -тег";
          html += `<button type="button" class="chip-btn ${cls}" data-quick-tag="${escapeHtml(formatted)}" title="${escapeHtml(tip)}">
            <span>${escapeHtml(formatted)}</span>
            ${showRu ? `<span class="chip-sub">(${escapeHtml(item.d)})</span>` : ""}
          </button>`;
        });
        html += `</div>`;
      }
    }

    // 3. Per-site Favorites
    const filteredFavs = state.favorites;
    const favLimit = state.showAllSaved ? filteredFavs.length : Math.min(5, filteredFavs.length);
    const visibleFavs = filteredFavs.slice(0, favLimit);

    if (visibleFavs.length > 0) {
      html += `<div class="nh-section-hdr">
        <span>★ Избранные запросы (ЛКМ — искать сразу | +→ — добавить к текущему)</span>
      </div>`;
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
        <div class="nh-row" draggable="true" data-idx="${idx}" data-id="${escapeHtml(fav.id)}">
          <div class="nh-cell-action drag-cell" title="Перетащить">⠿</div>
          <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(fav.text)}" data-id="${escapeHtml(fav.id)}" title="ЛКМ: искать сразу | СКМ: в новой вкладке">
            <span class="nh-star-icon">★</span>
            <span class="nh-text mono">${escapeHtml(fav.text)}</span>
          </div>
          <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(fav.text)}" title="Дописать эти теги к текущей строке поиска">+→</div>
          <div class="nh-cell-action" data-action="edit-fav" data-id="${escapeHtml(fav.id)}" title="Редактировать">✎</div>
          <div class="nh-cell-action del-cell" data-action="delete-fav" data-id="${escapeHtml(fav.id)}" title="Удалить">×</div>
        </div>`;
    });

    const hiddenFavCount = Math.max(0, filteredFavs.length - 5);
    html += `
      <div class="nh-more-row" data-action="toggle-more-saved">
        <span>${hiddenFavCount > 0
          ? (state.showAllSaved ? "▴ Свернуть сохранённые" : `▾ Показать ещё ${hiddenFavCount} (всего ${filteredFavs.length})`)
          : `★ Сохранённые фавориты (${filteredFavs.length})`}</span>
        <span class="nh-add-fav-btn" data-action="add-new-fav">+ Добавить фаворит</span>
      </div>`;

    // 4. Per-site History
    const favSet = new Set(state.favorites.map(f => f.text.trim().toLowerCase()));
    const filteredHist = state.history;
    const histLimit = state.showAllRecent ? filteredHist.length : Math.min(5, filteredHist.length);
    const visibleHist = filteredHist.slice(0, histLimit);

    visibleHist.forEach(item => {
      const isFav = favSet.has(item.text.trim().toLowerCase());
      html += `
        <div class="nh-row">
          <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(item.text)}" title="ЛКМ: искать сразу | СКМ: в новой вкладке">
            <span class="nh-clock-icon">🕒</span>
            <span class="nh-text mono">${escapeHtml(item.text)}</span>
            <span class="nh-count">${item.count || 1}×</span>
          </div>
          <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(item.text)}" title="Дописать к текущей строке поиска">+→</div>
          <div class="nh-cell-action star-cell ${isFav ? "active" : ""}" data-action="promote-hist" data-query="${escapeHtml(item.text)}" title="В избранное">${isFav ? "★" : "☆"}</div>
          <div class="nh-cell-action del-cell" data-action="delete-hist" data-id="${escapeHtml(item.id)}" title="Удалить">×</div>
        </div>`;
    });

    if (filteredHist.length > 5) {
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

    // Active Query Capsules events (LMB: remove word, RMB: toggle -, MMB: toggle "")
    chipsContainer.querySelectorAll("[data-cap-idx]").forEach(cap => {
      const idx = Number(cap.dataset.capIdx);
      cap.addEventListener("click", (e) => {
        e.stopPropagation();
        removeTokenAtIndex(idx);
      });
      cap.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleNegateTokenAtIndex(idx);
      });
      cap.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          toggleQuoteTokenAtIndex(idx);
        }
      });
    });

    chipsContainer.querySelector("#cap-clear-all")?.addEventListener("click", (e) => {
      e.stopPropagation();
      setInputValue(activeInput, "", true);
    });

    chipsContainer.querySelectorAll(".chip-btn[data-chip]").forEach(btn => {
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
        renderResultsSection();
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

    chipsContainer.querySelector("#nh-cancel-inline-chip")?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.addingChipInline = false;
      renderChipsSection();
      renderResultsSection();
    });

    chipsContainer.querySelector("#nh-reset-default-chips")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const defProf = getDefaultProfileForCurrentSite();
      const merged = [...defProf.chips];
      for (const c of state.chips) {
        if (!merged.includes(c)) merged.push(c);
      }
      state.chips = merged;
      await saveCurrentProfile();
      renderChipsSection();
      renderResultsSection();
      showToast("Стандартные теги сайта восстановлены!");
    });

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

    // Nyaa category & filter buttons
    chipsContainer.querySelectorAll("[data-nyaa-cat]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyNyaaSelects({ category: btn.dataset.nyaaCat });
        renderChipsSection();
      });
    });
    chipsContainer.querySelectorAll("[data-nyaa-filt]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyNyaaSelects({ filter: btn.dataset.nyaaFilt });
        renderChipsSection();
      });
    });

    // Site-specific quick filter buttons (rating, pages, etc.)
    chipsContainer.querySelectorAll("[data-filter-tok]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleChipInInput(btn.dataset.filterTok, "include");
      });
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleChipInInput(btn.dataset.filterTok, "exclude");
      });
    });
  }

  function bindResultsEvents() {
    if (!resultsContainer) return;

    resultsContainer.onmousedown = (e) => {
      if (e.target.tagName !== "INPUT") e.preventDefault();
    };

    // Category tabs
    resultsContainer.querySelectorAll("[data-tab-group]").forEach(tabBtn => {
      tabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.activeTabGroup = tabBtn.dataset.tabGroup;
        renderResultsSection();
      });
    });

    // Quick-cloud mouse buttons (LMB: +tag, RMB: -tag)
    resultsContainer.querySelectorAll("[data-quick-tag]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleChipInInput(btn.dataset.quickTag, "include");
      });
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleChipInInput(btn.dataset.quickTag, "exclude");
      });
    });

    resultsContainer.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("auxclick", (e) => {
        if (e.button === 1 && el.dataset.action === "run-query") {
          e.preventDefault();
          e.stopPropagation();
          submitSearch(el.dataset.query, null, true);
        }
      });

      if (el.dataset.action === "insert-token") {
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          state.activeNsFilter = "";
          toggleChipInInput(el.dataset.tag, "exclude");
        });
      }

      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === "pick-inline-chip") {
          const tag = el.dataset.tag;
          if (tag && !state.chips.includes(tag)) {
            state.chips.push(tag);
            await saveCurrentProfile();
            showToast(`Тег «${tag}» закреплён!`);
          }
          renderChipsSection();
          renderResultsSection(chipsContainer.querySelector("#nh-inline-chip-input")?.value || "");
        } else if (action === "insert-token") {
          state.activeNsFilter = "";
          replaceLastTokenWith(el.dataset.tag);
        } else if (action === "clear-ns") {
          state.activeNsFilter = "";
          renderChipsSection();
          renderResultsSection();
        } else if (action === "toggle-more-quick") {
          state.showAllQuickTags = !state.showAllQuickTags;
          renderResultsSection();
        } else if (action === "add-chip-direct") {
          const tag = el.dataset.tag;
          if (tag && !state.chips.includes(tag)) {
            state.chips.push(tag);
            await saveCurrentProfile();
            renderChipsSection();
            renderResultsSection();
            showToast(`Тег «${tag}» закреплён сверху!`);
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

  function extractPageTagName(target) {
    if (!target) return "";
    if (target.id && target.id.startsWith("ta_")) {
      return target.id.slice(3).replace(/_/g, " ");
    }
    let rawName = (target.querySelector(".name")?.textContent || target.textContent || "").trim();
    if (!rawName || rawName.length > 55) return "";
    return rawName.replace(/\s*\(\d+\)$/, "").replace(/\s+\d+[kKmM]?$/, "").trim();
  }

  function initPageTagCollector() {
    if (hoverPillHost) return;
    hoverPillHost = document.createElement("div");
    hoverPillHost.id = "nyaa-smart-hover-tag-pill";
    hoverPillHost.style.cssText = "position:fixed;z-index:2147483645;display:none;";
    document.body.appendChild(hoverPillHost);
    hoverPillShadow = hoverPillHost.attachShadow({ mode: "open" });
    hoverPillShadow.innerHTML = `
      <style>
        .pill-wrap { display: inline-flex; gap: 3px; }
        .pill-btn {
          background: #18181b; color: #f4f4f5; border: 1px solid #ed2553;
          border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700;
          cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,0.55);
          font-family: -apple-system, sans-serif;
        }
        .pill-btn:hover { background: #2ea043; border-color: #4ade80; color: #fff; }
        .pill-btn.add-search { background: #1e3a8a; border-color: #3b82f6; }
      </style>
      <div class="pill-wrap">
        <button type="button" class="pill-btn add-search" id="search-add-btn" title="Клик: добавить этот тег в строку поиска">🔍+в поиск</button>
        <button type="button" class="pill-btn" id="collect-btn" title="Клик: закрепить этот тег в быстрых чипсах">📌+чипс</button>
      </div>
    `;

    const collectBtn = hoverPillShadow.getElementById("collect-btn");
    const searchAddBtn = hoverPillShadow.getElementById("search-add-btn");

    searchAddBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredTagText || !activeInput) return;
      toggleChipInInput(hoveredTagText, "include");
      showToast(`Добавлено в поиск: ${formatTagForSite(hoveredTagText)}`);
    });

    collectBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredTagText) return;
      const formatted = formatTagForSite(hoveredTagText);
      if (!state.chips.includes(formatted)) {
        state.chips.push(formatted);
        await saveCurrentProfile();
        if (isDropdownOpen) renderChipsSection();
      }
      showToast(`Закреплено в чипсах: ${formatted}`);
    });
  }

  function onGlobalMouseDown(e) {
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
  }

  function onGlobalResizeOrScroll() {
    if (activeInput) {
      positionInbarControls();
      if (isDropdownOpen) positionDropdown();
    }
  }

  function onGlobalMouseOver(e) {
    if (!isSiteEnabled() || state.settings?.pageTagHover === false || !hoverPillHost) return;
    const target = e.target.closest("a.tag, .tag a, #taglist a, .search-tag, a[href*='/tag/'], a[href*='tags=']");
    if (!target) {
      if (!hoverPillHost.contains(e.target)) {
        hoverPillHost.style.display = "none";
      }
      return;
    }
    const rawName = extractPageTagName(target);
    if (!rawName) return;
    hoveredTagText = rawName;
    const rect = target.getBoundingClientRect();
    hoverPillHost.style.top = `${Math.max(4, rect.top - 24)}px`;
    hoverPillHost.style.left = `${Math.min(window.innerWidth - 135, Math.max(4, rect.left))}px`;
    hoverPillHost.style.display = "block";
  }

  // Alt+Click on any page tag immediately adds it to search without navigating away
  function onGlobalPageTagClick(e) {
    if (!isSiteEnabled() || !activeInput || !e.altKey) return;
    const target = e.target.closest("a.tag, .tag a, #taglist a, .search-tag, a[href*='/tag/'], a[href*='tags=']");
    if (!target) return;
    const rawName = extractPageTagName(target);
    if (!rawName) return;
    e.preventDefault();
    e.stopPropagation();
    toggleChipInInput(rawName, "include");
    showToast(`Добавлено в поиск: ${formatTagForSite(rawName)}`);
  }

  function attachGlobalListeners() {
    if (globalListenersAttached) return;
    globalListenersAttached = true;
    document.addEventListener("mousedown", onGlobalMouseDown);
    window.addEventListener("resize", onGlobalResizeOrScroll);
    window.addEventListener("scroll", onGlobalResizeOrScroll, true);
    document.addEventListener("mouseover", onGlobalMouseOver);
    document.addEventListener("click", onGlobalPageTagClick, true);
  }

  function detachGlobalListeners() {
    if (!globalListenersAttached) return;
    globalListenersAttached = false;
    document.removeEventListener("mousedown", onGlobalMouseDown);
    window.removeEventListener("resize", onGlobalResizeOrScroll);
    window.removeEventListener("scroll", onGlobalResizeOrScroll, true);
    document.removeEventListener("mouseover", onGlobalMouseOver);
    document.removeEventListener("click", onGlobalPageTagClick, true);
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
    detachGlobalListeners();
    if (inbarHost) { inbarHost.remove(); inbarHost = null; }
    if (hoverPillHost) { hoverPillHost.remove(); hoverPillHost = null; }
    if (activeInput && activeInput.dataset.origPaddingRight) {
      activeInput.style.paddingRight = activeInput.dataset.origPaddingRight;
    }
    activeInput = null;
  }

  async function initOrRefresh() {
    await loadState(false);
    if (!isSiteEnabled()) {
      detachUI();
      return;
    }
    attachGlobalListeners();
    const input = findSearchInput();
    if (input) {
      attachToInput(input);
      positionInbarControls();
      updateInbarButtons();
    }
    initPageTagCollector();
  }

  // Optimized storage listener: only reload customTagDatabase if that specific key changed!
  chrome.storage.onChanged.addListener(async (changes) => {
    const reloadCustomDb = Boolean(changes.customTagDatabase);
    await loadState(reloadCustomDb);
    if (!isSiteEnabled()) {
      detachUI();
    } else {
      attachGlobalListeners();
      initPageTagCollector();
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
      loadState(false).then(() => {
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
        attachGlobalListeners();
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

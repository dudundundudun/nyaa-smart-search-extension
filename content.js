(function () {
  if (window.__nyaaSmartSearchLoaded) return;
  window.__nyaaSmartSearchLoaded = true;

  const DEFAULT_BLOCK_LAYOUT = [
    { id: "chips", label: "📌 Любимые теги (верхняя панель)", enabled: true },
    { id: "favorites", label: "★ Избранные запросы", enabled: true },
    { id: "frequent", label: "🔥 Частые теги (из вашего поиска на сайте)", enabled: true },
    { id: "history", label: "🕒 История поиска", enabled: true },
    { id: "capsules", label: "💊 Капсулы слов текущего запроса", enabled: false },
    { id: "operators", label: "🛠 Кнопки операторов и рубрик сайта", enabled: false },
    { id: "catalog", label: "📚 Вкладки категорий и база тегов", enabled: false }
  ];

  const DEFAULT_SITE_PROFILES = {
    "nyaa.si": {
      chips: ["[SubsPlease]", "1080p", "HEVC", "Batch", "10bit", "[Erai-raws]", "Dual Audio", "-chinese"],
      favorites: [
        { id: "fav_default_1", text: "(Uncensored)", category: "", filter: "", addedAt: 1700000000005 },
        { id: "fav_default_2", text: "[SubsPlease] 1080p", category: "1_2", filter: "0", addedAt: 1700000000000 },
        { id: "fav_default_3", text: "[Erai-raws] 1080p HEVC", category: "", filter: "", addedAt: 1700000000002 },
        { id: "fav_default_4", text: "1080p Batch", category: "", filter: "", addedAt: 1700000000003 }
      ]
    },
    "nhentai.net": {
      chips: [
        "russian", "english", "translated", "\"full color\"", "uncensored",
        "\"sole female\"", "\"sole male\"", "\"big breasts\"", "stockings",
        "nakadashi", "defloration", "milf", "-yaoi"
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
    tagStats: {},
    ignoredTags: [],
    blockLayout: JSON.parse(JSON.stringify(DEFAULT_BLOCK_LAYOUT)),
    customSelectors: {},
    settings: { pageTagHover: true, maxFrequentTags: 12 },
    customTagDatabase: [],
    customDbLoaded: false,
    builtinTagDb: null,
    showAllSaved: false,
    showAllRecent: false,
    showAllFrequent: false,
    showLayoutModal: false,
    editingId: null,
    addingChipInline: false,
    activeTabGroup: "top",
    pickingElement: false
  };

  let activeInput = null;
  let hostEl = null;
  let shadow = null;
  let dropdownEl = null;
  let headerZone = null;
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
  let lastAutoRecordedUrlQuery = "";

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

  function normalizeBlockLayout(savedLayout) {
    if (!Array.isArray(savedLayout) || !savedLayout.length) {
      return JSON.parse(JSON.stringify(DEFAULT_BLOCK_LAYOUT));
    }
    const map = new Map(DEFAULT_BLOCK_LAYOUT.map(b => [b.id, { ...b }]));
    const result = [];
    for (const item of savedLayout) {
      if (item && map.has(item.id)) {
        const def = map.get(item.id);
        result.push({ id: item.id, label: def.label, enabled: Boolean(item.enabled) });
        map.delete(item.id);
      }
    }
    for (const rem of map.values()) {
      result.push(rem);
    }
    return result;
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

  function getKnownSingleTagsSet() {
    const set = new Set([
      "1080p", "720p", "2160p", "4k", "hevc", "x265", "x264", "av1", "10bit",
      "batch", "complete", "bd", "bdrip", "web-dl", "webrip", "flac", "ost",
      "uncensored", "censored", "russian", "english", "translated", "japanese",
      "chinese", "-chinese", "-yaoi", "-futanari", "-animated", "1girl", "solo",
      "highres", "absurdres", "long_hair", "short_hair", "breasts", "blush",
      "smile", "thighhighs", "stockings", "nakadashi", "defloration", "milf",
      "ahegao", "anal", "blowjob", "paizuri", "femdom", "netorare", "yuri", "yaoi"
    ]);
    for (const c of state.chips) set.add(c.toLowerCase());
    if (state.builtinTagDb) {
      for (const arr of Object.values(state.builtinTagDb)) {
        for (const item of arr || []) {
          if (item.t) set.add(item.t.toLowerCase());
        }
      }
    }
    return set;
  }

  // Smart extraction of meaningful tags/phrases from any user search query on this site
  function extractMeaningfulTagsFromQuery(queryText) {
    const rawTokens = tokenizeSearchQuery(queryText);
    if (!rawTokens.length) return [];
    const cat = getSiteCategory();

    // On booru sites, every space-separated token is a distinct tag
    if (cat === "booru") {
      return rawTokens.filter(t => t.toUpperCase() !== "OR" && t.length >= 2);
    }

    const knownSet = getKnownSingleTagsSet();
    const extracted = [];
    let freeWordsBuffer = [];

    const flushBuffer = () => {
      if (!freeWordsBuffer.length) return;
      const joined = freeWordsBuffer.join(" ");
      if (joined.length >= 2) extracted.push(joined);
      freeWordsBuffer = [];
    };

    for (const tok of rawTokens) {
      if (tok.toUpperCase() === "OR") {
        flushBuffer();
        continue;
      }
      const lower = tok.toLowerCase();
      const isStructured =
        tok.startsWith("[") ||
        tok.startsWith("(") ||
        tok.startsWith('"') ||
        tok.startsWith("-") ||
        tok.includes(":") ||
        tok.endsWith("$") ||
        knownSet.has(lower);

      if (isStructured) {
        flushBuffer();
        extracted.push(tok);
      } else {
        freeWordsBuffer.push(tok);
      }
    }
    flushBuffer();
    return extracted;
  }

  function learnTagsFromQuery(queryText, weight = 1) {
    const tags = extractMeaningfulTagsFromQuery(queryText);
    if (!tags.length) return false;
    const ignoredSet = new Set((state.ignoredTags || []).map(t => t.toLowerCase()));
    let changed = false;

    for (const tag of tags) {
      const clean = tag.trim();
      if (!clean || clean.length < 2) continue;
      if (ignoredSet.has(clean.toLowerCase())) continue;

      // Find existing case-insensitive key in tagStats
      let existingKey = Object.keys(state.tagStats).find(k => k.toLowerCase() === clean.toLowerCase());
      const keyToUse = existingKey || clean;
      state.tagStats[keyToUse] = (state.tagStats[keyToUse] || 0) + weight;
      changed = true;
    }
    return changed;
  }

  // Returns sorted list of [{ tag, count }] that user frequently uses on THIS site
  function getFrequentUserTagsForSite(limit = 12) {
    const ignoredSet = new Set((state.ignoredTags || []).map(t => t.toLowerCase()));
    const chipNormSet = new Set(state.chips.map(c => normalizeBaseToken(formatTagForSite(c))));
    const chipRawSet = new Set(state.chips.map(c => c.toLowerCase()));

    const entries = Object.entries(state.tagStats || {})
      .filter(([tag, count]) => {
        if (!tag || count <= 0) return false;
        const lower = tag.toLowerCase();
        if (ignoredSet.has(lower)) return false;
        // Do not duplicate tags that are already pinned in the top chips bar (if chips block is enabled)
        const chipsBlockEnabled = state.blockLayout.some(b => b.id === "chips" && b.enabled);
        if (chipsBlockEnabled && (chipRawSet.has(lower) || chipNormSet.has(normalizeBaseToken(tag)))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b[1] - a[1]);

    return entries.slice(0, limit).map(([tag, count]) => ({ tag, count }));
  }

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

  async function loadState(includeCustomDb = false) {
    const keysToFetch = ["enabledDomains", "siteProfiles", "customSelectors", "settings", "blockLayout"];
    if (includeCustomDb) keysToFetch.push("customTagDatabase");

    const data = await chrome.storage.local.get(keysToFetch);
    if (data.enabledDomains) state.enabledDomains = data.enabledDomains;
    if (data.customSelectors) state.customSelectors = data.customSelectors;
    if (data.settings) state.settings = { pageTagHover: true, maxFrequentTags: 12, ...data.settings };
    state.blockLayout = normalizeBlockLayout(data.blockLayout);

    if (includeCustomDb && Array.isArray(data.customTagDatabase)) {
      state.customTagDatabase = data.customTagDatabase;
      state.customDbLoaded = true;
    }

    const profiles = data.siteProfiles || {};
    state.siteProfiles = profiles;
    const key = getProfileKey();
    const defProf = getDefaultProfileForCurrentSite();
    const currentProfile = profiles[key] || { chips: [], favorites: [], history: [], tagStats: {}, ignoredTags: [] };

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
    state.tagStats = currentProfile.tagStats && typeof currentProfile.tagStats === "object" ? { ...currentProfile.tagStats } : {};
    state.ignoredTags = Array.isArray(currentProfile.ignoredTags) ? [...currentProfile.ignoredTags] : [];

    // Seed tagStats from existing history and favorites if empty
    if (Object.keys(state.tagStats).length === 0 && (state.history.length > 0 || state.favorites.length > 0)) {
      for (const fav of state.favorites) {
        learnTagsFromQuery(fav.text, 2);
      }
      for (const h of state.history) {
        learnTagsFromQuery(h.text, Math.max(1, h.count || 1));
      }
      needsSave = true;
    }

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
      history: state.history,
      tagStats: state.tagStats,
      ignoredTags: state.ignoredTags
    };
    state.siteProfiles = siteProfiles;
    await chrome.storage.local.set({ siteProfiles });
  }

  async function saveBlockLayout() {
    await chrome.storage.local.set({ blockLayout: state.blockLayout, settings: state.settings });
  }

  // Also capture search query from URL on results page load so native form submits are 100% remembered!
  async function captureSearchQueryFromPageUrl() {
    try {
      const params = new URLSearchParams(location.search);
      const qVal = params.get("q") || params.get("f_search") || params.get("tags") || params.get("search") || params.get("query") || "";
      const clean = qVal.trim().replace(/\s+/g, " ");
      if (clean.length >= 2 && clean !== lastAutoRecordedUrlQuery) {
        lastAutoRecordedUrlQuery = clean;
        await recordQueryToHistory(clean);
      }
    } catch (e) {}
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
    renderDropdownContent();
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
    const val = activeInput.value || "";
    const { prefix } = getCurrentTokenInfo(val);
    const formatted = formatTagForSite(rawTagText);
    const nextVal = (prefix + formatted).trimEnd() + " ";
    learnTagsFromQuery(formatted, 1);
    saveCurrentProfile();
    setInputValue(activeInput, nextVal, true);
    openDropdown();
  }

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

  function wrapLastTokenWithQuotes() {
    if (!activeInput) return;
    const tokens = tokenizeSearchQuery(activeInput.value);
    if (!tokens.length) return;
    const idx = tokens.length - 1;
    const t = tokens[idx];
    const isNeg = t.startsWith("-");
    const body = isNeg ? t.slice(1) : t;
    const nextBody = body.startsWith('"') && body.endsWith('"') ? body.slice(1, -1) : `"${body}"`;
    tokens[idx] = isNeg ? `-${nextBody}` : nextBody;
    setInputValue(activeInput, tokens.join(" ") + " ", true);
    openDropdown();
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
    lastAutoRecordedUrlQuery = clean;

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

    // Also learn individual tags/phrases from this search query for this site!
    learnTagsFromQuery(clean, 1);
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
      learnTagsFromQuery(clean, 2);
    }
    state.favorites = favorites;
    await saveCurrentProfile();
    updateInbarButtons();
    renderDropdownContent();
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

  function toggleChipInInput(chip, mode = "include") {
    if (!activeInput) return;
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

  function queryTagDatabase(query, limit = 30, groupFilter = "") {
    const q = (query || "").trim().toLowerCase();
    const pool = getActiveTagPool();
    const chipNorms = new Set(state.chips.map(c => normalizeBaseToken(formatTagForSite(c))));

    // Also include user's learned tags in search suggestions first!
    const userMatches = [];
    const seen = new Set();

    for (const [uTag, cnt] of Object.entries(state.tagStats || {})) {
      if (!uTag || cnt <= 0) continue;
      const l = uTag.toLowerCase();
      if (q && !l.includes(q)) continue;
      if (!q && !state.addingChipInline && chipNorms.has(normalizeBaseToken(uTag))) continue;
      seen.add(l);
      userMatches.push({ t: uTag, c: "nyaa", d: `Использовано вами ${cnt}×`, p: 1000000 + cnt });
    }

    const prefixMatches = [];
    const subMatches = [];

    for (let i = 0; i < pool.length; i++) {
      const item = pool[i];
      const tag = item.t;
      if (!tag || tag.endsWith(":")) continue;
      if (groupFilter && groupFilter !== "top" && item.g && item.g !== groupFilter) continue;

      const lowerTag = tag.toLowerCase();
      if (seen.has(lowerTag)) continue;

      if (!q && !state.addingChipInline) {
        const formattedNorm = normalizeBaseToken(formatTagForSite(tag));
        if (chipNorms.has(formattedNorm) || chipNorms.has(lowerTag)) continue;
      }

      if (!q) {
        seen.add(lowerTag);
        prefixMatches.push(item);
        if (userMatches.length + prefixMatches.length >= limit) break;
        continue;
      }

      const lowerDesc = (item.d || "").toLowerCase();
      if (lowerTag.startsWith(q)) {
        seen.add(lowerTag);
        prefixMatches.push(item);
      } else if (lowerTag.includes(q) || lowerDesc.includes(q)) {
        seen.add(lowerTag);
        subMatches.push(item);
      }
      if (userMatches.length + prefixMatches.length + subMatches.length >= limit) break;
    }
    return [...userMatches, ...prefixMatches, ...subMatches].slice(0, limit);
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
          transition: background 0.12s, color 0.12s; user-select: none;
        }
        .ib-btn:hover { background: #71717a; color: #fff; }
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
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.78);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13.5px;
          max-height: 520px;
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

        /* Top Mini Action Strip */
        .top-mini-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 4px 10px; background: #141414; border-bottom: 1px solid #292929;
          font-size: 11px; color: #8c8c8c;
        }
        .mini-btn {
          background: #262626; color: #d4d4d4; border: 1px solid #3a3a3a;
          border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .mini-btn:hover { background: #363636; color: #fff; }
        .mini-btn.active { background: #2563eb; color: #fff; border-color: #60a5fa; }
        .mini-btn.run-btn {
          background: #ed2553; color: #fff; border-color: #ed2553; font-weight: 600;
        }
        .mini-btn.run-btn:hover { background: #d41c47; }

        /* Block Constructor Panel (Inline Settings) */
        .builder-panel {
          padding: 10px 12px; background: #18181b; border-bottom: 2px solid #3b82f6;
        }
        .builder-title {
          font-size: 12px; font-weight: 700; color: #60a5fa; margin-bottom: 8px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .builder-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 5px 8px; background: #222226; border: 1px solid #323238;
          border-radius: 4px; margin-bottom: 4px; font-size: 12.5px;
        }
        .builder-left {
          display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1;
        }
        .builder-arrows {
          display: inline-flex; gap: 4px;
        }
        .arr-btn {
          background: #2e2e34; color: #ccc; border: 1px solid #444;
          border-radius: 3px; width: 24px; height: 22px; cursor: pointer;
          font-size: 11px; line-height: 1;
        }
        .arr-btn:hover { background: #444; color: #fff; }

        /* Pinned & Frequent Chips Bars — ZERO LAYOUT SHIFT ON HOVER! */
        .chips-bar {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
          padding: 8px 10px; background: #161616; border-bottom: 1px solid #2e2e2e;
        }
        .chips-label {
          font-size: 11px; color: #8c8c8c; margin-right: 2px;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .chip-wrap {
          display: inline-flex; align-items: center; position: relative;
        }
        .chip-btn {
          background: #2b2b2b; color: #d4d4d4; border: 1px solid #3f3f3f;
          border-radius: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer;
          transition: background 0.12s, color 0.12s, border-color 0.12s;
          font-family: Consolas, Monaco, "Courier New", monospace;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .chip-btn:hover { background: #3a3a3a; color: #fff; border-color: #666; }
        .chip-btn.included { background: #7c5816; color: #fff3d1; border-color: #c28b22; }
        .chip-btn.excluded { background: #5c1927; color: #ffd4dd; border-color: #c4314b; text-decoration: line-through; }
        .chip-btn.freq-btn { background: #1e293b; border-color: #334155; color: #e2e8f0; }
        .chip-btn.freq-btn:hover { background: #334155; border-color: #64748b; color: #fff; }
        .chip-btn.freq-btn.included { background: #7c5816; color: #fff3d1; border-color: #c28b22; }
        .chip-btn.freq-btn.excluded { background: #5c1927; color: #ffd4dd; border-color: #c4314b; }
        .freq-cnt { font-size: 10px; color: #94a3b8; font-family: sans-serif; }

        /* Absolute badge overlay — never alters width of .chip-wrap, 0% jitter! */
        .chip-del {
          position: absolute; top: -6px; right: -6px;
          width: 15px; height: 15px; border-radius: 50%;
          background: #be123c; color: #fff; border: 1px solid #fda4af;
          font-size: 10px; font-weight: 700; line-height: 13px; text-align: center;
          padding: 0; cursor: pointer; z-index: 5;
          opacity: 0; pointer-events: none; transition: opacity 0.12s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.6);
        }
        .chip-wrap:hover .chip-del { opacity: 1; pointer-events: auto; }
        .chip-del:hover { background: #e11d48; }

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
          border-radius: 4px; padding: 2px 7px; font-size: 12px; width: 155px; outline: none;
        }

        /* Optional Capsules Bar */
        .capsules-bar {
          display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
          padding: 6px 10px; background: #131824; border-bottom: 1px solid #243047;
        }
        .capsule-label {
          font-size: 10.5px; color: #60a5fa; font-weight: 700; text-transform: uppercase;
        }
        .q-capsule {
          display: inline-flex; align-items: center; gap: 4px;
          background: #1e3a8a; color: #eff6ff; border: 1px solid #3b82f6;
          border-radius: 10px; padding: 1px 7px; font-size: 11.5px; cursor: pointer;
          font-family: Consolas, Monaco, "Courier New", monospace;
        }
        .q-capsule:hover { background: #dc2626; border-color: #f87171; color: #fff; }
        .q-capsule.negated {
          background: #4c0519; color: #fecdd3; border-color: #e11d48; text-decoration: line-through;
        }

        /* Optional Operators Bar */
        .ops-bar {
          display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
          padding: 5px 10px; background: #1b1b1b; border-bottom: 1px solid #2b2b2b;
        }
        .op-btn {
          background: #27272a; color: #cbd5e1; border: 1px solid #3f3f46;
          border-radius: 3px; padding: 2px 7px; font-size: 11.5px; cursor: pointer;
        }
        .op-btn:hover { background: #3f3f46; color: #fff; }
        .op-btn.active { background: #2563eb; color: #fff; border-color: #3b82f6; }

        /* Optional Category Catalog */
        .catalog-drawer {
          background: #17171a; border-bottom: 1px solid #2e2e34;
        }
        .cat-tabs {
          display: flex; align-items: center; gap: 4px; overflow-x: auto;
          padding: 5px 10px; background: #141416; border-bottom: 1px solid #26262a;
        }
        .cat-tab {
          background: #222226; color: #a1a1aa; border: 1px solid #323238;
          border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
        }
        .cat-tab.active { background: #ed2553; color: #fff; border-color: #ff4d79; }

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
          display: flex; align-items: center; justify-content: space-between;
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
    headerZone = shadow.getElementById("nh-header-zone");
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
    width = Math.max(width, 470);
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
    renderDropdownContent();
    hostEl.style.display = "block";
  }

  function closeDropdown() {
    isDropdownOpen = false;
    state.editingId = null;
    state.addingChipInline = false;
    state.showLayoutModal = false;
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
        { id: "top", label: "🔥 Все" },
        { id: "groups", label: "🎬 Группы" },
        { id: "video", label: "📺 Видео" },
        { id: "batch", label: "📦 Батчи / Аудио" }
      ];
    }
    if (cat === "exhentai" || cat === "nhentai") {
      return [
        { id: "top", label: "🔥 Топ" },
        { id: "lang", label: "🌐 Язык / Цвет" },
        { id: "female", label: "♀ Девушки" },
        { id: "fetish", label: "💗 Жанры" },
        { id: "male", label: "♂ Мужчины" },
        { id: "parody", label: "🎨 Пародии" }
      ];
    }
    if (cat === "booru") {
      return [
        { id: "top", label: "🔥 Топ" },
        { id: "char", label: "👧 Внешность" },
        { id: "attire", label: "👗 Одежда" },
        { id: "copy", label: "🎬 Тайтлы" },
        { id: "meta", label: "⭐ Качество" }
      ];
    }
    return [{ id: "top", label: "🔥 Популярные" }];
  }

  // Renders an individual block by ID according to user's Block Constructor order!
  function renderSingleBlock(blockId, trimmedVal, tokens) {
    if (blockId === "chips") {
      let h = `<div class="chips-bar">
        <span class="chips-label" title="ЛКМ: добавить/убрать | ПКМ: исключить (-тег)">Теги (${escapeHtml(getProfileKey())}):</span>`;
      for (const chip of state.chips) {
        const chipState = getChipStateInInput(chip, trimmedVal);
        const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "";
        const ruDesc = getTagDescription(chip);
        h += `<span class="chip-wrap">
          <button type="button" class="chip-btn ${cls}" data-chip="${escapeHtml(chip)}" title="${escapeHtml(ruDesc ? ruDesc + " | ЛКМ: +тег | ПКМ: -тег" : "ЛКМ: +тег | ПКМ: -тег (исключить)")}">${escapeHtml(chip)}</button>
          <button type="button" class="chip-del" data-del-chip="${escapeHtml(chip)}" title="Убрать из любимых тегов">×</button>
        </span>`;
      }
      if (state.addingChipInline) {
        h += `<span class="inline-chip-box">
          <input type="text" class="inline-chip-input" id="nh-inline-chip-input" placeholder="Кликните тег ниже или введите..." autocomplete="off" />
          <button type="button" class="chip-add-btn" id="nh-cancel-inline-chip" title="Закрыть">✕</button>
        </span>`;
      } else {
        h += `<button type="button" class="chip-add-btn" id="nh-add-chip" title="Закрепить новый тег в этой строке">+ тег</button>`;
      }
      h += `</div>`;
      return h;
    }

    if (blockId === "frequent") {
      const limit = state.showAllFrequent ? 30 : (state.settings.maxFrequentTags || 12);
      const freqList = getFrequentUserTagsForSite(limit);
      if (!freqList.length) return "";
      let h = `<div class="nh-section-hdr">
        <span>🔥 Частые теги из вашего поиска на ${escapeHtml(getProfileKey())} (ЛКМ: + | ПКМ: -)</span>
        <span style="cursor:pointer;color:#f5b942;text-transform:none;" data-action="toggle-more-freq">${state.showAllFrequent ? "▴ Компактно" : "▾ Ещё"}</span>
      </div>
      <div class="chips-bar" style="background:#191c22;">`;
      for (const item of freqList) {
        const chipState = getChipStateInInput(item.tag, trimmedVal);
        const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "";
        h += `<span class="chip-wrap">
          <button type="button" class="chip-btn freq-btn ${cls}" data-chip="${escapeHtml(item.tag)}" title="Вы искали это ${item.count} раз(а) | ЛКМ: +в поиск | ПКМ: -исключить">
            <span>${escapeHtml(item.tag)}</span>
            <span class="freq-cnt">${item.count}×</span>
          </button>
          <button type="button" class="chip-del" data-del-freq="${escapeHtml(item.tag)}" title="Забыть этот тег на этом сайте">×</button>
        </span>`;
      }
      h += `</div>`;
      return h;
    }

    if (blockId === "favorites") {
      const filteredFavs = state.favorites;
      const favLimit = state.showAllSaved ? filteredFavs.length : Math.min(5, filteredFavs.length);
      const visibleFavs = filteredFavs.slice(0, favLimit);
      let h = "";
      if (visibleFavs.length > 0) {
        h += `<div class="nh-section-hdr">
          <span>★ Избранные запросы (СКМ — в новой вкладке)</span>
        </div>`;
      }
      visibleFavs.forEach((fav, idx) => {
        if (state.editingId === fav.id) {
          h += `
            <div class="nh-row" data-id="${escapeHtml(fav.id)}">
              <div class="nh-edit-wrap">
                <input type="text" class="nh-edit-input" id="edit-text-${escapeHtml(fav.id)}" value="${escapeHtml(fav.text)}" placeholder="Текст запроса..." />
                <button type="button" class="nh-edit-save" data-action="save-edit" data-id="${escapeHtml(fav.id)}">OK</button>
                <button type="button" class="nh-edit-cancel" data-action="cancel-edit">Отмена</button>
              </div>
            </div>`;
          return;
        }
        h += `
          <div class="nh-row" draggable="true" data-idx="${idx}" data-id="${escapeHtml(fav.id)}">
            <div class="nh-cell-action drag-cell" title="Перетащить">⠿</div>
            <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(fav.text)}" data-id="${escapeHtml(fav.id)}" title="ЛКМ: искать сразу | СКМ: в новой вкладке">
              <span class="nh-star-icon">★</span>
              <span class="nh-text mono">${escapeHtml(fav.text)}</span>
            </div>
            <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(fav.text)}" title="Подставить / добавить к текущему запросу">→</div>
            <div class="nh-cell-action" data-action="edit-fav" data-id="${escapeHtml(fav.id)}" title="Редактировать">✎</div>
            <div class="nh-cell-action del-cell" data-action="delete-fav" data-id="${escapeHtml(fav.id)}" title="Удалить">×</div>
          </div>`;
      });

      const hiddenFavCount = Math.max(0, filteredFavs.length - 5);
      h += `
        <div class="nh-more-row" data-action="toggle-more-saved">
          <span>${hiddenFavCount > 0
            ? (state.showAllSaved ? "▴ Свернуть сохранённые" : `▾ Показать ещё ${hiddenFavCount} (всего ${filteredFavs.length})`)
            : `★ Сохранённые фавориты (${filteredFavs.length})`}</span>
          <span class="nh-add-fav-btn" data-action="add-new-fav">+ Добавить фаворит</span>
        </div>`;
      return h;
    }

    if (blockId === "history") {
      const favSet = new Set(state.favorites.map(f => f.text.trim().toLowerCase()));
      const filteredHist = state.history;
      if (!filteredHist.length) return "";
      const histLimit = state.showAllRecent ? filteredHist.length : Math.min(5, filteredHist.length);
      const visibleHist = filteredHist.slice(0, histLimit);
      let h = `<div class="nh-section-hdr"><span>🕒 Недавние запросы на сайте</span></div>`;
      visibleHist.forEach(item => {
        const isFav = favSet.has(item.text.trim().toLowerCase());
        h += `
          <div class="nh-row">
            <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(item.text)}" title="ЛКМ: искать сразу | СКМ: в новой вкладке">
              <span class="nh-clock-icon">🕒</span>
              <span class="nh-text mono">${escapeHtml(item.text)}</span>
              <span class="nh-count">${item.count || 1}×</span>
            </div>
            <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(item.text)}" title="Подставить / добавить в строку">→</div>
            <div class="nh-cell-action star-cell ${isFav ? "active" : ""}" data-action="promote-hist" data-query="${escapeHtml(item.text)}" title="В избранное">${isFav ? "★" : "☆"}</div>
            <div class="nh-cell-action del-cell" data-action="delete-hist" data-id="${escapeHtml(item.id)}" title="Удалить">×</div>
          </div>`;
      });
      if (filteredHist.length > 5) {
        const hiddenHistCount = filteredHist.length - 5;
        h += `
          <div class="nh-more-row" data-action="toggle-more-recent">
            <span>${state.showAllRecent ? "▴ Свернуть недавние" : `▾ Ещё ${hiddenHistCount} недавних`}</span>
            <span data-action="clear-all-hist" style="font-size:11.5px;color:#777;">Очистить историю</span>
          </div>`;
      }
      return h;
    }

    if (blockId === "capsules") {
      if (tokens.length < 1) return "";
      let h = `<div class="capsules-bar">
        <span class="capsule-label">Сейчас в поиске:</span>`;
      tokens.forEach((tok, idx) => {
        const isNeg = tok.startsWith("-");
        h += `<button type="button" class="q-capsule ${isNeg ? "negated" : ""}" data-cap-idx="${idx}" title="ЛКМ: убрать «${escapeHtml(tok)}» | ПКМ: минус (-)">
          <span>${escapeHtml(tok)}</span>
          <span style="opacity:0.75;font-size:10px;">×</span>
        </button>`;
      });
      h += `</div>`;
      return h;
    }

    if (blockId === "operators") {
      const nyaaSel = isNyaaSite() ? getNyaaSelects() : null;
      let h = `<div class="ops-bar">
        <button type="button" class="op-btn" id="op-negate">− Исключить</button>
        <button type="button" class="op-btn" id="op-quote">&quot;&quot; Точно</button>
        <button type="button" class="op-btn" id="op-or">OR</button>`;
      if (isNyaaSite() && nyaaSel) {
        h += `<button type="button" class="op-btn ${nyaaSel.category === "1_2" ? "active" : ""}" data-nyaa-cat="${nyaaSel.category === "1_2" ? "0_0" : "1_2"}">🎬 Anime Eng</button>
        <button type="button" class="op-btn ${nyaaSel.filter === "2" ? "active" : ""}" data-nyaa-filt="${nyaaSel.filter === "2" ? "0" : "2"}">✅ Trusted</button>`;
      }
      h += `</div>`;
      return h;
    }

    if (blockId === "catalog") {
      const tabs = getCategoryTabsForSite();
      if (!tabs.some(t => t.id === state.activeTabGroup)) state.activeTabGroup = "top";
      let h = `<div class="catalog-drawer">
        <div class="cat-tabs">`;
      for (const tab of tabs) {
        h += `<button type="button" class="cat-tab ${state.activeTabGroup === tab.id ? "active" : ""}" data-tab-group="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`;
      }
      h += `</div><div class="chips-bar">`;
      const catItems = queryTagDatabase("", 25, state.activeTabGroup);
      catItems.forEach(item => {
        const formatted = formatTagForSite(item.t);
        const chipState = getChipStateInInput(formatted, trimmedVal);
        const cls = chipState === "included" ? "included" : chipState === "excluded" ? "excluded" : "";
        const tip = item.d ? `${item.d} — ЛКМ: +в поиск | ПКМ: -исключить` : "ЛКМ: +в поиск | ПКМ: -исключить";
        h += `<button type="button" class="chip-btn ${cls}" data-chip="${escapeHtml(formatted)}" title="${escapeHtml(tip)}">${escapeHtml(formatted)}</button>`;
      });
      h += `</div></div>`;
      return h;
    }

    return "";
  }

  function renderDropdownContent(inlineChipQuery = null) {
    if (!headerZone || !resultsContainer || !activeInput) return;
    const rawVal = activeInput.value || "";
    const trimmedVal = rawVal.trim();
    const tokens = tokenizeSearchQuery(trimmedVal);
    const { token } = getCurrentTokenInfo(rawVal);

    // Top mini-strip with "⚙️ Конструктор блоков" & "🔍 Найти"
    let headerHtml = `<div class="top-mini-bar">
      <span>Сайт: <strong style="color:#d4d4d4;">${escapeHtml(getProfileKey())}</strong></span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button type="button" class="mini-btn ${state.showLayoutModal ? "active" : ""}" id="toggle-builder-btn" title="Настроить отображаемые блоки и их порядок">⚙️ Конструктор блоков</button>
        <button type="button" class="mini-btn run-btn" id="op-submit" title="Запустить поиск мышкой">🔍 Найти</button>
      </div>
    </div>`;

    if (state.showLayoutModal) {
      headerHtml += `<div class="builder-panel">
        <div class="builder-title">
          <span>⚙️ КОНСТРУКТОР БЛОКОВ (галочка — вкл/выкл, ▲/▼ — порядок строк):</span>
          <button type="button" class="mini-btn" id="reset-layout-btn" title="Вернуть стандартный порядок">↺ Сброс</button>
        </div>`;
      state.blockLayout.forEach((b, idx) => {
        headerHtml += `<div class="builder-row">
          <label class="builder-left">
            <input type="checkbox" data-toggle-block="${escapeHtml(b.id)}" ${b.enabled ? "checked" : ""} />
            <span style="color:${b.enabled ? "#fff" : "#71717a"};font-weight:${b.enabled ? "600" : "400"};">${idx + 1}. ${escapeHtml(b.label)}</span>
          </label>
          <div class="builder-arrows">
            <button type="button" class="arr-btn" data-move-block="${idx}" data-dir="-1" ${idx === 0 ? "disabled" : ""} title="Поднять выше">▲</button>
            <button type="button" class="arr-btn" data-move-block="${idx}" data-dir="1" ${idx === state.blockLayout.length - 1 ? "disabled" : ""} title="Опустить ниже">▼</button>
          </div>
        </div>`;
      });
      headerHtml += `</div>`;
    }

    headerZone.innerHTML = headerHtml;

    // If user is in "+ тег" inline picker mode
    if (state.addingChipInline) {
      const qStr = inlineChipQuery !== null ? inlineChipQuery : "";
      const matches = queryTagDatabase(qStr, 35);
      let pickerHtml = renderSingleBlock("chips", trimmedVal, tokens);
      pickerHtml += `<div class="nh-section-hdr">
        <span>Кликните мышкой по тегу, чтобы закрепить его в любимых:</span>
      </div>`;
      if (qStr.trim() && !state.chips.includes(qStr.trim())) {
        pickerHtml += `<div class="nh-row" data-action="pick-inline-chip" data-tag="${escapeHtml(qStr.trim())}">
          <div class="nh-cell-main">
            <span class="nh-star-icon">+</span>
            <span class="nh-text mono">Закрепить свой тег: «${escapeHtml(qStr.trim())}»</span>
          </div>
        </div>`;
      }
      matches.forEach(item => {
        const formatted = formatTagForSite(item.t);
        const alreadyPinned = state.chips.includes(formatted) || state.chips.includes(item.t);
        pickerHtml += `
          <div class="nh-row" data-action="pick-inline-chip" data-tag="${escapeHtml(formatted)}">
            <div class="nh-cell-main">
              <span class="nh-tag-dot dot-${escapeHtml(item.c || "general")}"></span>
              <span class="nh-text mono cat-${escapeHtml(item.c || "general")}">${escapeHtml(formatted)}</span>
              ${item.d ? `<span class="nh-desc">— ${escapeHtml(item.d)}</span>` : ""}
              ${alreadyPinned ? `<span class="nh-count" style="color:#4ade80;">✓ закреплён</span>` : `<span class="nh-count">+ закрепить</span>`}
            </div>
          </div>`;
      });
      resultsContainer.innerHTML = pickerHtml;
      bindAllDropdownEvents();
      return;
    }

    let bodyHtml = "";

    // "Search for <query>" row when input has text
    if (trimmedVal.length > 0) {
      const favActive = isFavorited(trimmedVal);
      bodyHtml += `
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

    // Live autocomplete when user is actively typing a word
    const tokenClean = token.replace(/^[-+"]/, "");
    if (tokenClean.length >= 1) {
      const dbMatches = queryTagDatabase(tokenClean, 10);
      if (dbMatches.length > 0) {
        bodyHtml += `<div class="nh-section-hdr">
          <span>Подсказки по вводу (ЛКМ: вставить | ПКМ: исключить)</span>
        </div>`;
        dbMatches.forEach(item => {
          const catCls = escapeHtml(item.c || "general");
          const formatted = formatTagForSite(item.t);
          bodyHtml += `
            <div class="nh-row">
              <div class="nh-cell-main" data-action="insert-token" data-tag="${escapeHtml(item.t)}">
                <span class="nh-tag-dot dot-${catCls}"></span>
                <span class="nh-text mono cat-${catCls}">${escapeHtml(formatted)}</span>
                ${item.d ? `<span class="nh-desc">— ${escapeHtml(item.d)}</span>` : ""}
              </div>
              <div class="nh-cell-action star-cell" data-action="add-chip-direct" data-tag="${escapeHtml(formatted)}" title="Закрепить в любимых тегах">+</div>
            </div>
          `;
        });
      }
    }

    // Render all enabled blocks in the exact user-chosen order!
    for (const block of state.blockLayout) {
      if (!block.enabled) continue;
      bodyHtml += renderSingleBlock(block.id, trimmedVal, tokens);
    }

    resultsContainer.innerHTML = bodyHtml;
    bindAllDropdownEvents();
  }

  function bindAllDropdownEvents() {
    if (!dropdownEl) return;

    dropdownEl.onmousedown = (e) => {
      if (e.target.tagName !== "INPUT") e.preventDefault();
    };

    // Block Constructor controls
    shadow.getElementById("toggle-builder-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.showLayoutModal = !state.showLayoutModal;
      renderDropdownContent();
    });

    shadow.getElementById("reset-layout-btn")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      state.blockLayout = JSON.parse(JSON.stringify(DEFAULT_BLOCK_LAYOUT));
      await saveBlockLayout();
      renderDropdownContent();
      showToast("Стандартные блоки восстановлены!");
    });

    shadow.querySelectorAll("[data-toggle-block]").forEach(cb => {
      cb.addEventListener("change", async (e) => {
        e.stopPropagation();
        const id = cb.dataset.toggleBlock;
        const item = state.blockLayout.find(b => b.id === id);
        if (item) {
          item.enabled = cb.checked;
          await saveBlockLayout();
          renderDropdownContent();
        }
      });
    });

    shadow.querySelectorAll("[data-move-block]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.moveBlock);
        const dir = Number(btn.dataset.dir);
        const targetIdx = idx + dir;
        if (targetIdx >= 0 && targetIdx < state.blockLayout.length) {
          const temp = state.blockLayout[idx];
          state.blockLayout[idx] = state.blockLayout[targetIdx];
          state.blockLayout[targetIdx] = temp;
          await saveBlockLayout();
          renderDropdownContent();
        }
      });
    });

    // Capsules
    shadow.querySelectorAll("[data-cap-idx]").forEach(cap => {
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
    });

    // Chips & Frequent Tags (LMB: +tag, RMB: -tag)
    shadow.querySelectorAll(".chip-btn[data-chip]").forEach(btn => {
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

    // Delete pinned chip
    shadow.querySelectorAll("[data-del-chip]").forEach(delBtn => {
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const chip = delBtn.dataset.delChip;
        state.chips = state.chips.filter(c => c !== chip);
        await saveCurrentProfile();
        renderDropdownContent();
      });
    });

    // Delete/ignore learned frequent tag
    shadow.querySelectorAll("[data-del-freq]").forEach(delBtn => {
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const fTag = delBtn.dataset.delFreq;
        delete state.tagStats[fTag];
        if (!state.ignoredTags.includes(fTag)) state.ignoredTags.push(fTag);
        await saveCurrentProfile();
        renderDropdownContent();
      });
    });

    shadow.getElementById("nh-add-chip")?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.addingChipInline = true;
      renderDropdownContent("");
      shadow.getElementById("nh-inline-chip-input")?.focus();
    });

    shadow.getElementById("nh-cancel-inline-chip")?.addEventListener("click", (e) => {
      e.stopPropagation();
      state.addingChipInline = false;
      renderDropdownContent();
    });

    const inlineInp = shadow.getElementById("nh-inline-chip-input");
    if (inlineInp) {
      inlineInp.addEventListener("input", () => {
        renderDropdownContent(inlineInp.value);
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
          renderDropdownContent();
          if (activeInput) activeInput.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          state.addingChipInline = false;
          renderDropdownContent();
          if (activeInput) activeInput.focus();
        }
      });
    }

    shadow.getElementById("op-negate")?.addEventListener("click", (e) => { e.stopPropagation(); negateLastToken(); });
    shadow.getElementById("op-quote")?.addEventListener("click", (e) => { e.stopPropagation(); wrapLastTokenWithQuotes(); });
    shadow.getElementById("op-or")?.addEventListener("click", (e) => { e.stopPropagation(); appendTokenToInput("OR"); });
    shadow.getElementById("op-submit")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeInput) submitSearch(activeInput.value);
    });

    shadow.querySelectorAll("[data-nyaa-cat]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyNyaaSelects({ category: btn.dataset.nyaaCat });
        renderDropdownContent();
      });
    });
    shadow.querySelectorAll("[data-nyaa-filt]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyNyaaSelects({ filter: btn.dataset.nyaaFilt });
        renderDropdownContent();
      });
    });

    shadow.querySelectorAll("[data-tab-group]").forEach(tabBtn => {
      tabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.activeTabGroup = tabBtn.dataset.tabGroup;
        renderDropdownContent();
      });
    });

    shadow.querySelectorAll("[data-action]").forEach(el => {
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
          renderDropdownContent(shadow.getElementById("nh-inline-chip-input")?.value || "");
        } else if (action === "insert-token") {
          replaceLastTokenWith(el.dataset.tag);
        } else if (action === "add-chip-direct") {
          const tag = el.dataset.tag;
          if (tag && !state.chips.includes(tag)) {
            state.chips.push(tag);
            await saveCurrentProfile();
            renderDropdownContent();
            showToast(`Тег «${tag}» закреплён!`);
          }
        } else if (action === "toggle-more-freq") {
          state.showAllFrequent = !state.showAllFrequent;
          renderDropdownContent();
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
          renderDropdownContent();
          shadow.getElementById(`edit-text-${state.editingId}`)?.focus();
        } else if (action === "cancel-edit") {
          state.editingId = null;
          renderDropdownContent();
        } else if (action === "save-edit") {
          const id = el.dataset.id;
          const textInp = shadow.getElementById(`edit-text-${id}`);
          if (textInp && textInp.value.trim()) {
            const idx = state.favorites.findIndex(f => f.id === id);
            if (idx >= 0) {
              state.favorites[idx].text = textInp.value.trim();
              learnTagsFromQuery(textInp.value.trim(), 2);
              await saveCurrentProfile();
            }
          }
          state.editingId = null;
          renderDropdownContent();
        } else if (action === "delete-fav") {
          state.favorites = state.favorites.filter(f => f.id !== el.dataset.id);
          await saveCurrentProfile();
          updateInbarButtons();
          renderDropdownContent();
        } else if (action === "toggle-more-saved") {
          state.showAllSaved = !state.showAllSaved;
          renderDropdownContent();
        } else if (action === "add-new-fav") {
          const newFavId = "fav_" + Date.now();
          const initialText = (activeInput && activeInput.value.trim()) || (isNyaaSite() ? "[SubsPlease] " : "");
          state.favorites.unshift({ id: newFavId, text: initialText, category: "", filter: "", addedAt: Date.now() });
          state.editingId = newFavId;
          state.showAllSaved = true;
          await saveCurrentProfile();
          renderDropdownContent();
          shadow.getElementById(`edit-text-${newFavId}`)?.focus();
        } else if (action === "promote-hist") {
          await toggleFavorite(el.dataset.query);
        } else if (action === "delete-hist") {
          state.history = state.history.filter(h => h.id !== el.dataset.id);
          await saveCurrentProfile();
          renderDropdownContent();
        } else if (action === "toggle-more-recent") {
          state.showAllRecent = !state.showAllRecent;
          renderDropdownContent();
        } else if (action === "clear-all-hist") {
          state.history = [];
          await saveCurrentProfile();
          renderDropdownContent();
        }
      });
    });

    shadow.querySelectorAll(".nh-row[draggable='true']").forEach(row => {
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
          renderDropdownContent();
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
        <button type="button" class="pill-btn" id="collect-btn" title="Клик: закрепить этот тег в любимых чипсах">📌+чипс</button>
      </div>
    `;

    const collectBtn = hoverPillShadow.getElementById("collect-btn");
    const searchAddBtn = hoverPillShadow.getElementById("search-add-btn");

    searchAddBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredTagText || !activeInput) return;
      const formatted = formatTagForSite(hoveredTagText);
      learnTagsFromQuery(formatted, 1);
      await saveCurrentProfile();
      toggleChipInInput(hoveredTagText, "include");
      showToast(`Добавлено в поиск: ${formatted}`);
    });

    collectBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredTagText) return;
      const formatted = formatTagForSite(hoveredTagText);
      if (!state.chips.includes(formatted)) {
        state.chips.push(formatted);
        await saveCurrentProfile();
        if (isDropdownOpen) renderDropdownContent();
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

  function onGlobalPageTagClick(e) {
    if (!isSiteEnabled() || !activeInput || !e.altKey) return;
    const target = e.target.closest("a.tag, .tag a, #taglist a, .search-tag, a[href*='/tag/'], a[href*='tags=']");
    if (!target) return;
    const rawName = extractPageTagName(target);
    if (!rawName) return;
    e.preventDefault();
    e.stopPropagation();
    learnTagsFromQuery(formatTagForSite(rawName), 1);
    saveCurrentProfile();
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
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (!isDropdownOpen) openDropdown();
        else renderDropdownContent();
      }, 60);
    });
    activeInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
      } else if (e.key === "Enter" && activeInput.value.trim()) {
        recordQueryToHistory(activeInput.value);
      }
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
    await captureSearchQueryFromPageUrl();
    const input = findSearchInput();
    if (input) {
      attachToInput(input);
      positionInbarControls();
      updateInbarButtons();
    }
    initPageTagCollector();
  }

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
        renderDropdownContent();
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
          renderDropdownContent();
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

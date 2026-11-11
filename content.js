(function () {
  if (window.__nyaaSmartSearchLoaded) return;
  window.__nyaaSmartSearchLoaded = true;

  const BUILTIN_TAGS = [
    { text: "[SubsPlease] 1080p", desc: "Релизы SubsPlease в 1080p" },
    { text: "[SubsPlease]", desc: "Релиз-группа онгоингов (CR/HIDIVE)" },
    { text: "[Erai-raws]", desc: "Мульти-субтитры и HEVC" },
    { text: "[EMBER]", desc: "Компактные HEVC 10bit 1080p encodes" },
    { text: "[Judas]", desc: "Сезонные батчи и фильмы в HEVC 10bit" },
    { text: "[SubsPlease] Batch", desc: "Полные паки сезонов от SubsPlease" },
    { text: "1080p", desc: "Full HD (1920×1080)" },
    { text: "720p", desc: "HD (1280×720)" },
    { text: "2160p", desc: "4K UHD" },
    { text: "HEVC", desc: "Кодек H.265 / x265" },
    { text: "10bit", desc: "Глубина цвета 10 бит" },
    { text: "Batch", desc: "Весь сезон целиком" },
    { text: "Dual Audio", desc: "Японская + английская дорожки" },
    { text: "BD", desc: "Blu-ray рипы" },
    { text: "-chinese", desc: "Исключить китайские переводы" }
  ];

  let state = {
    enabledDomains: ["nyaa.si", "nyaa.land", "sukebei.nyaa.si", "nhentai.net"],
    chips: ["[SubsPlease]", "1080p", "HEVC", "Batch", "10bit", "[Erai-raws]", "Dual Audio", "-chinese"],
    favorites: [],
    history: [],
    customSelectors: {},
    showAllSaved: false,
    showAllRecent: false,
    editingId: null,
    pickingElement: false
  };

  let activeInput = null;
  let hostEl = null;
  let shadow = null;
  let dropdownEl = null;
  let inbarHost = null;
  let inbarShadow = null;
  let isDropdownOpen = false;
  let dragSrcIndex = null;

  function getCleanHostname() {
    return location.hostname.replace(/^www\./, "");
  }

  function isSiteEnabled() {
    const host = getCleanHostname();
    return (state.enabledDomains || []).some(d => host === d || host.endsWith("." + d));
  }

  async function loadState() {
    const data = await chrome.storage.local.get([
      "enabledDomains",
      "chips",
      "favorites",
      "history",
      "customSelectors"
    ]);
    if (data.enabledDomains) state.enabledDomains = data.enabledDomains;
    if (data.chips) state.chips = data.chips;
    if (data.favorites) state.favorites = data.favorites;
    if (data.history) state.history = data.history;
    if (data.customSelectors) state.customSelectors = data.customSelectors;
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
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, val);
    } else {
      input.value = val;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (focus) {
      input.focus();
      const len = val.length;
      try {
        input.setSelectionRange(len, len);
      } catch (e) {}
    }
    updateInbarButtons();
    renderDropdown();
  }

  function getNyaaSelects() {
    const catSelect = document.querySelector('select[name="c"]');
    const filterSelect = document.querySelector('select[name="f"]');
    return {
      category: catSelect ? catSelect.value : "",
      filter: filterSelect ? filterSelect.value : ""
    };
  }

  function applyNyaaSelects(item) {
    if (!item) return;
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

    const { history = [] } = await chrome.storage.local.get(["history"]);
    const idx = history.findIndex(h => h.text.toLowerCase() === clean.toLowerCase());
    if (idx >= 0) {
      history[idx].count = (history[idx].count || 1) + 1;
      history[idx].lastUsed = Date.now();
      history[idx].text = clean;
    } else {
      history.unshift({
        id: "hist_" + Date.now(),
        text: clean,
        count: 1,
        lastUsed: Date.now()
      });
    }
    history.sort((a, b) => (b.count || 1) - (a.count || 1) || (b.lastUsed || 0) - (a.lastUsed || 0));
    const trimmed = history.slice(0, 50);
    state.history = trimmed;
    await chrome.storage.local.set({ history: trimmed });
  }

  async function submitSearch(queryText, itemMeta = null) {
    if (!activeInput) return;
    setInputValue(activeInput, queryText, false);
    if (itemMeta) {
      applyNyaaSelects(itemMeta);
    }
    await recordQueryToHistory(queryText);
    closeDropdown();

    const form = activeInput.closest("form");
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

  async function toggleFavorite(queryText, note = "") {
    const clean = (queryText || "").trim().replace(/\s+/g, " ");
    if (!clean) return;
    const { favorites = [] } = await chrome.storage.local.get(["favorites"]);
    const idx = favorites.findIndex(f => f.text.toLowerCase() === clean.toLowerCase());
    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      const selects = getNyaaSelects();
      favorites.unshift({
        id: "fav_" + Date.now(),
        text: clean,
        note: note || "",
        category: selects.category,
        filter: selects.filter,
        addedAt: Date.now()
      });
    }
    state.favorites = favorites;
    await chrome.storage.local.set({ favorites });
    updateInbarButtons();
    renderDropdown();
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

  function toggleTokenInInput(token) {
    if (!activeInput) return;
    const current = activeInput.value.trim();
    if (!current) {
      setInputValue(activeInput, token + " ", true);
      openDropdown();
      return;
    }
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
    let updated;
    if (regex.test(current)) {
      updated = current.replace(regex, " ").replace(/\s+/g, " ").trim();
    } else {
      updated = (current + " " + token).replace(/\s+/g, " ").trim();
    }
    setInputValue(activeInput, updated ? updated + " " : "", true);
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
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
          pointer-events: auto;
          height: 100%;
          padding-right: 6px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .ib-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: none;
          background: rgba(82, 82, 91, 0.85);
          color: #e4e4e7;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: background 0.12s, color 0.12s, transform 0.1s;
          user-select: none;
        }
        .ib-btn:hover {
          background: #71717a;
          color: #ffffff;
          transform: scale(1.06);
        }
        .ib-btn.clear-btn {
          font-size: 15px;
          font-weight: 600;
        }
        .ib-btn.clear-btn:hover {
          background: #ed2553;
          color: #fff;
        }
        .ib-btn.word-btn {
          border-radius: 4px;
          width: 24px;
          font-size: 12px;
          background: rgba(63, 63, 70, 0.85);
        }
        .hidden {
          display: none !important;
        }
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
    const val = activeInput.value || "";
    const hasText = val.length > 0;
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
        * {
          box-sizing: border-box;
        }
        .nh-dropdown {
          background: #1f1f1f;
          color: #d9d9d9;
          border: 1px solid #383838;
          border-top: none;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          max-height: 460px;
          overflow-y: auto;
          user-select: none;
        }
        .nh-dropdown::-webkit-scrollbar {
          width: 8px;
        }
        .nh-dropdown::-webkit-scrollbar-track {
          background: #181818;
        }
        .nh-dropdown::-webkit-scrollbar-thumb {
          background: #4d4d4d;
        }
        /* Quick Tag Chips Strip */
        .chips-bar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 5px;
          padding: 7px 10px;
          background: #171717;
          border-bottom: 1px solid #2e2e2e;
        }
        .chips-label {
          font-size: 11px;
          color: #8c8c8c;
          margin-right: 3px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .chip-btn {
          background: #2b2b2b;
          color: #d4d4d4;
          border: 1px solid #3f3f3f;
          border-radius: 3px;
          padding: 2px 7px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.12s;
          font-family: Consolas, Monaco, "Courier New", monospace;
        }
        .chip-btn:hover {
          background: #3a3a3a;
          color: #fff;
          border-color: #666;
        }
        .chip-btn.active {
          background: #7c5816;
          color: #fff3d1;
          border-color: #c28b22;
        }
        .chip-add-btn {
          background: transparent;
          color: #8c8c8c;
          border: 1px dashed #444;
          border-radius: 3px;
          padding: 2px 6px;
          font-size: 11px;
          cursor: pointer;
        }
        .chip-add-btn:hover {
          color: #fff;
          border-color: #888;
        }

        /* Top Search For bar (Screenshot 8 exact style) */
        .search-for-row {
          display: flex;
          align-items: stretch;
          background: #3b3b3b;
          border-bottom: 1px solid #2d2d2d;
          min-height: 38px;
        }
        .search-for-main {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 6px 12px;
          cursor: pointer;
          color: #b5b5b5;
          gap: 8px;
          overflow: hidden;
        }
        .search-for-main:hover {
          background: #454545;
        }
        .search-for-icon {
          color: #8e8e8e;
          font-size: 14px;
        }
        .search-for-query {
          color: #ffffff;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        /* Rows (Screenshot 9 clean style without GROUP/TAG badges) */
        .nh-row {
          display: flex;
          align-items: stretch;
          background: #1f1f1f;
          border-bottom: 1px solid #2c2c2c;
          min-height: 36px;
          transition: background 0.08s;
        }
        .nh-row:hover {
          background: #292929;
        }
        .nh-row.dragging {
          opacity: 0.45;
          background: #333;
        }
        .nh-cell-main {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 6px 12px;
          gap: 8px;
          cursor: pointer;
          overflow: hidden;
        }
        .nh-star-icon {
          color: #f5b942;
          font-size: 14px;
          flex-shrink: 0;
          width: 16px;
          text-align: center;
        }
        .nh-clock-icon {
          color: #9e9e9e;
          font-size: 13px;
          flex-shrink: 0;
          width: 16px;
          text-align: center;
        }
        .nh-text {
          color: #e6e6e6;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .nh-text.mono {
          font-family: Consolas, Monaco, "Courier New", monospace;
          font-size: 13.5px;
        }
        .nh-desc {
          color: #8a8a8a;
          font-size: 12.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-left: 4px;
        }
        .nh-count {
          color: #8a8a8a;
          font-size: 12.5px;
          margin-left: auto;
          padding-left: 8px;
          flex-shrink: 0;
        }
        /* Right-side square action cells like on nhentai */
        .nh-cell-action {
          width: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-left: 1px solid #2c2c2c;
          color: #b0b0b0;
          cursor: pointer;
          font-size: 15px;
          flex-shrink: 0;
          background: transparent;
          transition: background 0.1s, color 0.1s;
        }
        .nh-cell-action:hover {
          background: #343434;
          color: #ffffff;
        }
        .nh-cell-action.star-cell.active {
          color: #f5b942;
        }
        .nh-cell-action.star-cell:hover {
          color: #f5b942;
        }
        .nh-cell-action.del-cell:hover {
          background: #4a1c26;
          color: #ff6b8b;
        }
        .nh-cell-action.drag-cell {
          cursor: grab;
          width: 26px;
          font-size: 12px;
          color: #666;
          border-left: none;
          border-right: 1px solid #2c2c2c;
        }
        .nh-cell-action.drag-cell:hover {
          color: #bbb;
        }

        /* Expandable "N more saved / recent" row */
        .nh-more-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 12px;
          background: #1a1a1a;
          border-bottom: 1px solid #2c2c2c;
          color: #9e9e9e;
          font-size: 13px;
          cursor: pointer;
        }
        .nh-more-row:hover {
          background: #252525;
          color: #d9d9d9;
        }
        .nh-add-fav-btn {
          color: #f5b942;
          font-size: 12px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
        }
        .nh-add-fav-btn:hover {
          background: rgba(245, 185, 66, 0.15);
        }

        /* Inline editor inside row */
        .nh-edit-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 4px 8px;
          background: #262626;
        }
        .nh-edit-input {
          flex: 1;
          background: #141414;
          color: #fff;
          border: 1px solid #555;
          border-radius: 3px;
          padding: 4px 8px;
          font-size: 13px;
        }
        .nh-edit-save {
          background: #2ea043;
          color: #fff;
          border: none;
          border-radius: 3px;
          padding: 4px 10px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }
        .nh-edit-cancel {
          background: #444;
          color: #ddd;
          border: none;
          border-radius: 3px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 12px;
        }
      </style>
      <div class="nh-dropdown" id="nh-dropdown"></div>
    `;
    dropdownEl = shadow.getElementById("nh-dropdown");
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
    width = Math.max(width, 420);
    if (left + width > window.innerWidth - 12) {
      left = Math.max(8, window.innerWidth - width - 12);
    }
    hostEl.style.top = `${rect.bottom}px`;
    hostEl.style.left = `${left}px`;
    hostEl.style.width = `${width}px`;
  }

  function openDropdown() {
    if (!activeInput || !isSiteEnabled()) return;
    createDropdownHost();
    isDropdownOpen = true;
    positionDropdown();
    renderDropdown();
    hostEl.style.display = "block";
  }

  function closeDropdown() {
    isDropdownOpen = false;
    state.editingId = null;
    if (hostEl) {
      hostEl.style.display = "none";
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderDropdown() {
    if (!dropdownEl || !activeInput) return;
    const rawVal = activeInput.value || "";
    const trimmedVal = rawVal.trim();
    const lowerVal = trimmedVal.toLowerCase();

    let html = "";

    // 1. Quick Tag Chips Bar
    html += `<div class="chips-bar">
      <span class="chips-label">Теги:</span>`;
    for (const chip of state.chips) {
      const isActive = new RegExp(`(^|\\s)${chip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(trimmedVal);
      html += `<button type="button" class="chip-btn ${isActive ? "active" : ""}" data-chip="${escapeHtml(chip)}" title="Клик: добавить или убрать тег из строки">${escapeHtml(chip)}</button>`;
    }
    html += `<button type="button" class="chip-add-btn" id="nh-add-chip" title="Добавить свой быстрый тег-чипс">+ тег</button>
    </div>`;

    // 2. If user typed something, show "↵ Search for <query>" with ★ button on right (Screenshot 8 style)
    if (trimmedVal.length > 0) {
      const favActive = isFavorited(trimmedVal);
      html += `
        <div class="search-for-row">
          <div class="search-for-main" data-action="submit-current">
            <span class="search-for-icon">↵</span>
            <span>Search for</span>
            <span class="search-for-query">${escapeHtml(trimmedVal)}</span>
          </div>
          <div class="nh-cell-action star-cell ${favActive ? "active" : ""}" data-action="star-current" title="Сохранить в Избранное (★)">
            ${favActive ? "★" : "☆"}
          </div>
        </div>
      `;
    }

    // 3. Filter Favorites (Saved) - Clean style like Screenshot 9 (no GROUP/TAG badges)
    const filteredFavs = lowerVal
      ? state.favorites.filter(f => f.text.toLowerCase().includes(lowerVal))
      : state.favorites;

    const favLimit = state.showAllSaved || lowerVal ? filteredFavs.length : Math.min(4, filteredFavs.length);
    const visibleFavs = filteredFavs.slice(0, favLimit);

    visibleFavs.forEach((fav, idx) => {
      if (state.editingId === fav.id) {
        html += `
          <div class="nh-row" data-id="${escapeHtml(fav.id)}">
            <div class="nh-edit-wrap">
              <input type="text" class="nh-edit-input" id="edit-text-${escapeHtml(fav.id)}" value="${escapeHtml(fav.text)}" placeholder="Текст запроса..." />
              <button type="button" class="nh-edit-save" data-action="save-edit" data-id="${escapeHtml(fav.id)}">OK</button>
              <button type="button" class="nh-edit-cancel" data-action="cancel-edit">Отмена</button>
            </div>
          </div>
        `;
        return;
      }

      const isBracketed = fav.text.startsWith("[");
      html += `
        <div class="nh-row" draggable="${!lowerVal}" data-idx="${idx}" data-id="${escapeHtml(fav.id)}">
          ${!lowerVal ? `<div class="nh-cell-action drag-cell" title="Перетащить выше/ниже">⠿</div>` : ""}
          <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(fav.text)}" data-id="${escapeHtml(fav.id)}">
            <span class="nh-star-icon">★</span>
            <span class="nh-text ${isBracketed ? "mono" : ""}">${escapeHtml(fav.text)}</span>
          </div>
          <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(fav.text)}" title="Подставить в строку без отправки (→)">→</div>
          <div class="nh-cell-action" data-action="edit-fav" data-id="${escapeHtml(fav.id)}" title="Редактировать запрос (✏️)">✎</div>
          <div class="nh-cell-action del-cell" data-action="delete-fav" data-id="${escapeHtml(fav.id)}" title="Удалить из избранного (×)">×</div>
        </div>
      `;
    });

    if (!lowerVal) {
      const hiddenFavCount = Math.max(0, filteredFavs.length - 4);
      html += `
        <div class="nh-more-row" data-action="toggle-more-saved">
          <span>${hiddenFavCount > 0
            ? (state.showAllSaved ? "▴ Свернуть сохранённые" : `▾ ${hiddenFavCount} more saved (показать все ${filteredFavs.length})`)
            : `★ Сохранённые фавориты (${filteredFavs.length})`}</span>
          <span class="nh-add-fav-btn" data-action="add-new-fav">+ Добавить фаворит</span>
        </div>
      `;
    }

    // 4. Filter History (Recent / Frequent)
    const favSet = new Set(state.favorites.map(f => f.text.trim().toLowerCase()));
    const filteredHist = state.history.filter(h => {
      if (lowerVal && !h.text.toLowerCase().includes(lowerVal)) return false;
      return true;
    });

    const histLimit = state.showAllRecent || lowerVal ? filteredHist.length : Math.min(5, filteredHist.length);
    const visibleHist = filteredHist.slice(0, histLimit);

    visibleHist.forEach(item => {
      const isFav = favSet.has(item.text.trim().toLowerCase());
      const isBracketed = item.text.startsWith("[");
      html += `
        <div class="nh-row">
          <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(item.text)}">
            <span class="nh-clock-icon">🕒</span>
            <span class="nh-text ${isBracketed ? "mono" : ""}">${escapeHtml(item.text)}</span>
            <span class="nh-count" title="Сколько раз вы искали этот запрос">${item.count || 1}×</span>
          </div>
          <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(item.text)}" title="Подставить в строку (→)">→</div>
          <div class="nh-cell-action star-cell ${isFav ? "active" : ""}" data-action="promote-hist" data-query="${escapeHtml(item.text)}" title="Перенести в Избранное (☆)">
            ${isFav ? "★" : "☆"}
          </div>
          <div class="nh-cell-action del-cell" data-action="delete-hist" data-id="${escapeHtml(item.id)}" title="Удалить из истории (×)">×</div>
        </div>
      `;
    });

    if (!lowerVal && filteredHist.length > 5) {
      const hiddenHistCount = filteredHist.length - 5;
      html += `
        <div class="nh-more-row" data-action="toggle-more-recent">
          <span>${state.showAllRecent ? "▴ Свернуть недавние" : `▾ ${hiddenHistCount} more recent (всего ${filteredHist.length})`}</span>
          <span data-action="clear-all-hist" style="font-size:11.5px;color:#777;">Очистить историю</span>
        </div>
      `;
    }

    // 5. Built-in Tag / Release Group Suggestions when typing (without GROUP/TAG badges)
    if (lowerVal.length > 0) {
      const existingTexts = new Set([
        ...visibleFavs.map(f => f.text.toLowerCase()),
        ...visibleHist.map(h => h.text.toLowerCase())
      ]);
      const matchingTags = BUILTIN_TAGS.filter(t =>
        !existingTexts.has(t.text.toLowerCase()) &&
        (t.text.toLowerCase().includes(lowerVal) || t.desc.toLowerCase().includes(lowerVal))
      );

      matchingTags.forEach(tag => {
        html += `
          <div class="nh-row">
            <div class="nh-cell-main" data-action="run-query" data-query="${escapeHtml(tag.text)}">
              <span class="nh-text mono">${escapeHtml(tag.text)}</span>
              <span class="nh-desc">${escapeHtml(tag.desc)}</span>
            </div>
            <div class="nh-cell-action" data-action="append-query" data-query="${escapeHtml(tag.text)}" title="Добавить тег в строку поиска (→)">→</div>
            <div class="nh-cell-action star-cell" data-action="promote-hist" data-query="${escapeHtml(tag.text)}" title="Сохранить в Избранное (☆)">☆</div>
          </div>
        `;
      });
    }

    dropdownEl.innerHTML = html;
    bindDropdownEvents();
  }

  function bindDropdownEvents() {
    if (!dropdownEl) return;

    dropdownEl.onmousedown = (e) => {
      const tag = e.target.tagName;
      if (tag !== "INPUT" && tag !== "SELECT") {
        e.preventDefault();
      }
    };

    dropdownEl.querySelectorAll(".chip-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleTokenInInput(btn.dataset.chip);
      });
    });

    const addChipBtn = dropdownEl.querySelector("#nh-add-chip");
    if (addChipBtn) {
      addChipBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const newChip = prompt("Введите новый быстрый тег-чипс (например, [Judas] или FLAC):");
        if (newChip && newChip.trim()) {
          const clean = newChip.trim();
          if (!state.chips.includes(clean)) {
            state.chips.push(clean);
            await chrome.storage.local.set({ chips: state.chips });
            renderDropdown();
          }
        }
      });
    }

    dropdownEl.querySelectorAll(".chip-btn").forEach(btn => {
      btn.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chip = btn.dataset.chip;
        if (confirm(`Удалить чипс «${chip}» с панели?`)) {
          state.chips = state.chips.filter(c => c !== chip);
          await chrome.storage.local.set({ chips: state.chips });
          renderDropdown();
        }
      });
    });

    dropdownEl.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = el.dataset.action;

        if (action === "submit-current") {
          if (activeInput) submitSearch(activeInput.value);
        } else if (action === "star-current") {
          if (activeInput) toggleFavorite(activeInput.value);
        } else if (action === "run-query") {
          const q = el.dataset.query;
          const favItem = state.favorites.find(f => f.id === el.dataset.id);
          submitSearch(q, favItem || null);
        } else if (action === "append-query") {
          appendTokenToInput(el.dataset.query);
        } else if (action === "edit-fav") {
          state.editingId = el.dataset.id;
          renderDropdown();
          const inp = dropdownEl.querySelector(`#edit-text-${state.editingId}`);
          if (inp) inp.focus();
        } else if (action === "cancel-edit") {
          state.editingId = null;
          renderDropdown();
        } else if (action === "save-edit") {
          const id = el.dataset.id;
          const textInp = dropdownEl.querySelector(`#edit-text-${id}`);
          if (textInp && textInp.value.trim()) {
            const idx = state.favorites.findIndex(f => f.id === id);
            if (idx >= 0) {
              state.favorites[idx].text = textInp.value.trim();
              await chrome.storage.local.set({ favorites: state.favorites });
            }
          }
          state.editingId = null;
          renderDropdown();
        } else if (action === "delete-fav") {
          const id = el.dataset.id;
          state.favorites = state.favorites.filter(f => f.id !== id);
          await chrome.storage.local.set({ favorites: state.favorites });
          updateInbarButtons();
          renderDropdown();
        } else if (action === "toggle-more-saved") {
          state.showAllSaved = !state.showAllSaved;
          renderDropdown();
        } else if (action === "add-new-fav") {
          const newFavId = "fav_" + Date.now();
          const initialText = (activeInput && activeInput.value.trim()) || "[SubsPlease] ";
          state.favorites.unshift({
            id: newFavId,
            text: initialText,
            note: "",
            category: "",
            filter: "",
            addedAt: Date.now()
          });
          state.editingId = newFavId;
          state.showAllSaved = true;
          await chrome.storage.local.set({ favorites: state.favorites });
          renderDropdown();
          const inp = dropdownEl.querySelector(`#edit-text-${newFavId}`);
          if (inp) inp.focus();
        } else if (action === "promote-hist") {
          await toggleFavorite(el.dataset.query);
        } else if (action === "delete-hist") {
          const id = el.dataset.id;
          state.history = state.history.filter(h => h.id !== id);
          await chrome.storage.local.set({ history: state.history });
          renderDropdown();
        } else if (action === "toggle-more-recent") {
          state.showAllRecent = !state.showAllRecent;
          renderDropdown();
        } else if (action === "clear-all-hist") {
          state.history = [];
          await chrome.storage.local.set({ history: [] });
          renderDropdown();
        }
      });
    });

    dropdownEl.querySelectorAll(".nh-row[draggable='true']").forEach(row => {
      row.addEventListener("dragstart", (e) => {
        dragSrcIndex = Number(row.dataset.idx);
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        const targetIdx = Number(row.dataset.idx);
        if (dragSrcIndex !== null && dragSrcIndex !== targetIdx) {
          const moved = state.favorites.splice(dragSrcIndex, 1)[0];
          state.favorites.splice(targetIdx, 0, moved);
          await chrome.storage.local.set({ favorites: state.favorites });
          renderDropdown();
        }
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        dragSrcIndex = null;
      });
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
      if (isSiteEnabled()) {
        openDropdown();
      }
    });

    activeInput.addEventListener("input", () => {
      if (isSiteEnabled()) {
        updateInbarButtons();
        openDropdown();
      }
    });

    activeInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
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
    if (inbarHost) {
      inbarHost.remove();
      inbarHost = null;
    }
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
  }

  document.addEventListener("mousedown", (e) => {
    if (state.pickingElement) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (
      (activeInput && path.includes(activeInput)) ||
      (hostEl && path.includes(hostEl)) ||
      (inbarHost && path.includes(inbarHost))
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
      if (isDropdownOpen) renderDropdown();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "START_PICKER") {
      startElementPicker();
      sendResponse({ ok: true });
    } else if (msg.type === "FAVORITES_UPDATED") {
      loadState().then(() => {
        updateInbarButtons();
        if (isDropdownOpen) renderDropdown();
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

    const onKey = (e) => {
      if (e.key === "Escape") cleanup();
    };

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

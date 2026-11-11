const DEFAULT_DATA = {
  enabledDomains: ["nyaa.si", "nyaa.land", "sukebei.nyaa.si", "nhentai.net"],
  useGlobalProfile: true,
  chips: ["[SubsPlease]", "1080p", "HEVC", "Batch", "10bit", "[Erai-raws]", "Dual Audio", "-chinese"],
  favorites: [
    {
      id: "fav_default_1",
      text: "[SubsPlease] 1080p",
      note: "",
      category: "1_2",
      filter: "0",
      addedAt: 1700000000000
    },
    {
      id: "fav_default_2",
      text: "[SubsPlease]",
      note: "",
      category: "",
      filter: "",
      addedAt: 1700000000001
    },
    {
      id: "fav_default_3",
      text: "[Erai-raws] 1080p HEVC",
      note: "",
      category: "",
      filter: "",
      addedAt: 1700000000002
    },
    {
      id: "fav_default_4",
      text: "1080p Batch",
      note: "",
      category: "",
      filter: "",
      addedAt: 1700000000003
    }
  ],
  history: [
    {
      id: "hist_default_1",
      text: "[SubsPlease] Solo Leveling 1080p",
      count: 8,
      lastUsed: 1700000005000
    },
    {
      id: "hist_default_2",
      text: "[SubsPlease] Frieren 1080p",
      count: 5,
      lastUsed: 1700000004000
    }
  ],
  customSelectors: {}
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULT_DATA)) {
    if (stored[k] === undefined) {
      toSet[k] = v;
    }
  }
  // Clean default verbose notes from previous v1.0.0 if present so text isn't truncated
  if (stored.favorites && Array.isArray(stored.favorites)) {
    const defaultNotes = new Set([
      "Базовый фильтр группы и 1080p",
      "Релиз-группа онгоингов",
      "HEVC 10bit релизы",
      "Полные сезоны (паки)"
    ]);
    let changed = false;
    const cleanedFavs = stored.favorites.map(f => {
      const copy = { ...f };
      delete copy.badge;
      if (copy.note && defaultNotes.has(copy.note)) {
        copy.note = "";
        changed = true;
      }
      return copy;
    });
    if (changed) {
      toSet.favorites = cleanedFavs;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-selection-to-favorites",
      title: "★ Добавить «%s» в фавориты поиска",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "add-selection-with-subsplease",
      title: "★ Добавить «[SubsPlease] %s 1080p» в фавориты",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;
  const raw = info.selectionText.trim().replace(/\s+/g, " ");
  if (!raw) return;

  const finalQuery = info.menuItemId === "add-selection-with-subsplease"
    ? `[SubsPlease] ${raw} 1080p`
    : raw;

  const { favorites = [] } = await chrome.storage.local.get(["favorites"]);
  const exists = favorites.some(f => f.text.toLowerCase() === finalQuery.toLowerCase());
  if (!exists) {
    favorites.unshift({
      id: "fav_" + Date.now(),
      text: finalQuery,
      note: "",
      category: "",
      filter: "",
      addedAt: Date.now()
    });
    await chrome.storage.local.set({ favorites });
  }
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "FAVORITES_UPDATED", query: finalQuery }).catch(() => {});
  }
});

async function updateBadgeForTab(tabId, url) {
  if (!url || !url.startsWith("http")) {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    return;
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const { enabledDomains = DEFAULT_DATA.enabledDomains } = await chrome.storage.local.get(["enabledDomains"]);
    const isEnabled = enabledDomains.some(d => hostname === d || hostname.endsWith("." + d));
    if (isEnabled) {
      chrome.action.setBadgeText({ tabId, text: "ON" }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#2ea043" }).catch(() => {});
    } else {
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }
  } catch (e) {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      updateBadgeForTab(tab.id, tab.url);
    }
  } catch (e) {}
});

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.enabledDomains) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      updateBadgeForTab(tabs[0].id, tabs[0].url);
    }
  }
});

const NYAA_PROFILE = {
  chips: ["[SubsPlease]", "1080p", "HEVC", "Batch", "10bit", "[Erai-raws]", "Dual Audio", "-chinese"],
  favorites: [
    {
      id: "fav_default_1",
      text: "[SubsPlease] 1080p",
      category: "1_2",
      filter: "0",
      addedAt: 1700000000000
    },
    {
      id: "fav_default_2",
      text: "[SubsPlease]",
      category: "",
      filter: "",
      addedAt: 1700000000001
    },
    {
      id: "fav_default_3",
      text: "[Erai-raws] 1080p HEVC",
      category: "",
      filter: "",
      addedAt: 1700000000002
    },
    {
      id: "fav_default_4",
      text: "1080p Batch",
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
  ]
};

const DEFAULT_DATA = {
  enabledDomains: ["nyaa.si", "nyaa.land", "sukebei.nyaa.si"],
  siteProfiles: {
    "nyaa.si": NYAA_PROFILE
  },
  customSelectors: {}
};

function getProfileKey(hostname) {
  const host = (hostname || "").replace(/^www\./, "").toLowerCase();
  if (host === "nyaa.si" || host === "nyaa.land" || host.endsWith(".nyaa.si") || host.endsWith(".nyaa.land")) {
    return "nyaa.si";
  }
  return host;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  const toSet = {};

  if (!stored.enabledDomains) {
    toSet.enabledDomains = DEFAULT_DATA.enabledDomains;
  }
  if (!stored.customSelectors) {
    toSet.customSelectors = {};
  }

  // Migrate legacy global favorites/chips/history (from v1.0/v1.1) into siteProfiles["nyaa.si"]
  const siteProfiles = stored.siteProfiles || {};
  if (!siteProfiles["nyaa.si"]) {
    siteProfiles["nyaa.si"] = {
      chips: Array.isArray(stored.chips) ? stored.chips : NYAA_PROFILE.chips,
      favorites: Array.isArray(stored.favorites) ? stored.favorites : NYAA_PROFILE.favorites,
      history: Array.isArray(stored.history) ? stored.history : NYAA_PROFILE.history
    };
    toSet.siteProfiles = siteProfiles;
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-selection-to-favorites",
      title: "★ Добавить «%s» в фавориты этого сайта",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab || !tab.url) return;
  const raw = info.selectionText.trim().replace(/\s+/g, " ");
  if (!raw) return;

  try {
    const hostname = new URL(tab.url).hostname;
    const key = getProfileKey(hostname);
    const { siteProfiles = {} } = await chrome.storage.local.get(["siteProfiles"]);
    if (!siteProfiles[key]) {
      siteProfiles[key] = { chips: [], favorites: [], history: [] };
    }
    const favs = siteProfiles[key].favorites || [];
    if (!favs.some(f => f.text.toLowerCase() === raw.toLowerCase())) {
      favs.unshift({
        id: "fav_" + Date.now(),
        text: raw,
        category: "",
        filter: "",
        addedAt: Date.now()
      });
      siteProfiles[key].favorites = favs;
      await chrome.storage.local.set({ siteProfiles });
    }
    chrome.tabs.sendMessage(tab.id, { type: "FAVORITES_UPDATED", query: raw }).catch(() => {});
  } catch (e) {}
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

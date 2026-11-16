const SITE_DEFAULT_PROFILES = {
  "nyaa.si": {
    chips: ["[SubsPlease]", "1080p", "HEVC", "Batch", "10bit", "[Erai-raws]", "Dual Audio", "-chinese"],
    favorites: [
      { id: "fav_default_1", text: "[SubsPlease] 1080p", category: "1_2", filter: "0", addedAt: 1700000000000 },
      { id: "fav_default_2", text: "[SubsPlease]", category: "", filter: "", addedAt: 1700000000001 },
      { id: "fav_default_3", text: "[Erai-raws] 1080p HEVC", category: "", filter: "", addedAt: 1700000000002 },
      { id: "fav_default_4", text: "1080p Batch", category: "", filter: "", addedAt: 1700000000003 }
    ],
    history: [
      { id: "hist_default_1", text: "[SubsPlease] Solo Leveling 1080p", count: 8, lastUsed: 1700000005000 },
      { id: "hist_default_2", text: "[SubsPlease] Frieren 1080p", count: 5, lastUsed: 1700000004000 }
    ]
  },
  "nhentai.net": {
    chips: ["russian", "english", "translated", "full color", "uncensored", "sole female", "sole male", "-yaoi"],
    favorites: [
      { id: "fav_nh_1", text: "russian translated", category: "", filter: "", addedAt: 1700000000010 },
      { id: "fav_nh_2", text: "english full color uncensored", category: "", filter: "", addedAt: 1700000000011 }
    ],
    history: []
  },
  "exhentai.org": {
    chips: ["language:russian", "language:english", "language:translated", "female:", "artist:", "parody:", "-male:yaoi"],
    favorites: [
      { id: "fav_eh_1", text: "language:russian$", category: "", filter: "", addedAt: 1700000000020 },
      { id: "fav_eh_2", text: "language:english$ language:translated$", category: "", filter: "", addedAt: 1700000000021 }
    ],
    history: []
  },
  "danbooru.donmai.us": {
    chips: ["1girl", "solo", "highres", "absurdres", "order:score", "rating:general", "-animated"],
    favorites: [
      { id: "fav_db_1", text: "1girl solo highres order:score", category: "", filter: "", addedAt: 1700000000030 }
    ],
    history: []
  }
};

const DEFAULT_DATA = {
  enabledDomains: ["nyaa.si", "nyaa.land", "sukebei.nyaa.si", "nhentai.net", "exhentai.org", "e-hentai.org", "danbooru.donmai.us", "gelbooru.com"],
  siteProfiles: {
    "nyaa.si": SITE_DEFAULT_PROFILES["nyaa.si"],
    "nhentai.net": SITE_DEFAULT_PROFILES["nhentai.net"],
    "exhentai.org": SITE_DEFAULT_PROFILES["exhentai.org"],
    "danbooru.donmai.us": SITE_DEFAULT_PROFILES["danbooru.donmai.us"]
  },
  customSelectors: {},
  settings: {
    pageTagHover: true
  }
};

function getProfileKey(hostname) {
  const host = (hostname || "").replace(/^www\./, "").toLowerCase();
  if (host === "nyaa.si" || host === "nyaa.land" || host.endsWith(".nyaa.si") || host.endsWith(".nyaa.land")) {
    return "nyaa.si";
  }
  if (host === "e-hentai.org" || host === "exhentai.org" || host.endsWith(".e-hentai.org") || host.endsWith(".exhentai.org")) {
    return "exhentai.org";
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
  if (!stored.settings) {
    toSet.settings = DEFAULT_DATA.settings;
  }

  const siteProfiles = stored.siteProfiles || {};
  for (const [key, defProfile] of Object.entries(SITE_DEFAULT_PROFILES)) {
    if (!siteProfiles[key]) {
      if (key === "nyaa.si" && (Array.isArray(stored.chips) || Array.isArray(stored.favorites))) {
        siteProfiles[key] = {
          chips: Array.isArray(stored.chips) ? stored.chips : defProfile.chips,
          favorites: Array.isArray(stored.favorites) ? stored.favorites : defProfile.favorites,
          history: Array.isArray(stored.history) ? stored.history : defProfile.history
        };
      } else {
        siteProfiles[key] = defProfile;
      }
    }
  }
  toSet.siteProfiles = siteProfiles;

  await chrome.storage.local.set(toSet);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-selection-to-favorites",
      title: "★ Добавить «%s» в фавориты этого сайта",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "add-selection-to-chips",
      title: "🏷 Добавить «%s» в быстрые чипсы этого сайта",
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
      siteProfiles[key] = SITE_DEFAULT_PROFILES[key] || { chips: [], favorites: [], history: [] };
    }

    if (info.menuItemId === "add-selection-to-favorites") {
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
    } else if (info.menuItemId === "add-selection-to-chips") {
      const chips = siteProfiles[key].chips || [];
      if (!chips.some(c => c.toLowerCase() === raw.toLowerCase())) {
        chips.push(raw);
        siteProfiles[key].chips = chips;
        await chrome.storage.local.set({ siteProfiles });
      }
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

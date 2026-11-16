let currentHost = "";
let currentProfileKey = "";
let activeTabId = null;

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

function showStatus(text) {
  const el = document.getElementById("status-msg");
  el.textContent = text;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 2600);
}

async function initPopup() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab && tab.url && tab.url.startsWith("http")) {
    activeTabId = tab.id;
    currentHost = new URL(tab.url).hostname.replace(/^www\./, "").toLowerCase();
    currentProfileKey = getProfileKey(currentHost);
    document.getElementById("current-domain").textContent = `Включить на ${currentHost}`;
  } else {
    document.getElementById("current-domain").textContent = "Системная вкладка";
    document.getElementById("domain-status").textContent = "Откройте сайт для настройки";
    document.getElementById("site-toggle").disabled = true;
    document.getElementById("pick-input-btn").disabled = true;
  }

  const data = await chrome.storage.local.get(["enabledDomains", "siteProfiles", "settings", "customTagDatabase"]);
  const enabledDomains = data.enabledDomains || [];
  const siteProfiles = data.siteProfiles || {};
  const profile = siteProfiles[currentProfileKey] || { chips: [], favorites: [], history: [] };
  const settings = data.settings || { pageTagHover: true };

  document.getElementById("hover-collect-toggle").checked = settings.pageTagHover !== false;
  const customTags = Array.isArray(data.customTagDatabase) ? data.customTagDatabase : [];
  document.getElementById("custom-db-count").textContent = `${customTags.length.toLocaleString("ru-RU")} тегов`;

  if (currentHost) {
    const isEnabled = enabledDomains.some(d => currentHost === d || currentHost.endsWith("." + d));
    document.getElementById("site-toggle").checked = isEnabled;
    document.getElementById("domain-status").textContent = isEnabled
      ? `Отдельная база (${currentProfileKey})`
      : "Выключено на этом сайте";
  }

  const resetBtn = document.getElementById("reset-subsplease");
  resetBtn.style.display = currentProfileKey === "nyaa.si" ? "inline" : "none";

  renderFavoritesPreview(profile.favorites || []);
}

function renderFavoritesPreview(favorites) {
  document.getElementById("fav-count").textContent = favorites.length;
  const list = document.getElementById("fav-list");
  if (!favorites.length) {
    list.innerHTML = `<div style="padding:10px;color:#777;text-align:center;">Для этого сайта фаворитов пока нет</div>`;
    return;
  }
  list.innerHTML = favorites.map(f => `
    <div class="fav-item">
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <span class="fav-star">★</span>
        <span>${String(f.text || "").replace(/</g, "&lt;")}</span>
      </div>
    </div>
  `).join("");
}

document.getElementById("site-toggle").addEventListener("change", async (e) => {
  if (!currentHost) return;
  const { enabledDomains = [], siteProfiles = {} } = await chrome.storage.local.get(["enabledDomains", "siteProfiles"]);
  let updated;
  if (e.target.checked) {
    updated = enabledDomains.includes(currentHost) ? enabledDomains : [...enabledDomains, currentHost];
    if (!siteProfiles[currentProfileKey]) {
      siteProfiles[currentProfileKey] = { chips: [], favorites: [], history: [] };
      await chrome.storage.local.set({ siteProfiles });
    }
    document.getElementById("domain-status").textContent = `Отдельная база (${currentProfileKey})`;
  } else {
    updated = enabledDomains.filter(d => d !== currentHost && !currentHost.endsWith("." + d));
    document.getElementById("domain-status").textContent = "Выключено на этом сайте";
  }
  await chrome.storage.local.set({ enabledDomains: updated });
});

document.getElementById("hover-collect-toggle").addEventListener("change", async (e) => {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  settings.pageTagHover = e.target.checked;
  await chrome.storage.local.set({ settings });
  showStatus(e.target.checked ? "Сбор тегов включён" : "Сбор тегов выключен");
});

document.getElementById("pick-input-btn").addEventListener("click", async () => {
  if (!activeTabId) return;
  chrome.tabs.sendMessage(activeTabId, { type: "START_PICKER" }).catch(() => {});
  window.close();
});

document.getElementById("reset-subsplease").addEventListener("click", async () => {
  if (!currentProfileKey) return;
  const { siteProfiles = {} } = await chrome.storage.local.get(["siteProfiles"]);
  if (!siteProfiles[currentProfileKey]) {
    siteProfiles[currentProfileKey] = { chips: [], favorites: [], history: [] };
  }
  const favs = (siteProfiles[currentProfileKey].favorites || []).filter(f => f.text.toLowerCase() !== "[subsplease] 1080p");
  favs.unshift({
    id: "fav_default_1",
    text: "[SubsPlease] 1080p",
    category: "1_2",
    filter: "0",
    addedAt: Date.now()
  });
  siteProfiles[currentProfileKey].favorites = favs;
  await chrome.storage.local.set({ siteProfiles });
  renderFavoritesPreview(favs);
  showStatus("«[SubsPlease] 1080p» поставлен на 1-е место!");
});

// Parse Danbooru CSV (tag,category,count,aliases) or EhTagTranslation JSON or simple JSON array
function parseExternalTagFile(filename, rawText) {
  const parsedTags = [];
  const lowerName = filename.toLowerCase();
  const catMap = { "0": "general", "1": "artist", "3": "copyright", "4": "character", "5": "meta" };

  if (lowerName.endsWith(".json")) {
    const json = JSON.parse(rawText);
    if (Array.isArray(json)) {
      for (const item of json) {
        if (typeof item === "string") {
          parsedTags.push({ t: item.trim(), c: "general", p: 100 });
        } else if (item && (item.t || item.tag || item.name)) {
          parsedTags.push({
            t: String(item.t || item.tag || item.name).trim(),
            c: String(item.c || item.category || item.type || "general"),
            p: Number(item.p || item.count || 100) || 100
          });
        }
      }
    } else if (json && Array.isArray(json.data)) {
      // EhTagTranslation db.html.json / db.raw.json format
      for (const nsObj of json.data) {
        const ns = nsObj.namespace || "general";
        if (ns === "rows") continue;
        const dataMap = nsObj.data || {};
        for (const tagKey of Object.keys(dataMap)) {
          const fullTag = ns === "misc" || ns === "reclass" ? tagKey : `${ns}:${tagKey}`;
          parsedTags.push({ t: fullTag, c: ns, p: 500 });
        }
      }
    }
  } else {
    // CSV / TXT line-by-line (tag,type,count,...)
    const lines = rawText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(",");
      const tag = parts[0].replace(/^"|"$/g, "").trim();
      if (!tag || tag === "tag" || tag === "name") continue;
      const catCode = (parts[1] || "").trim();
      const count = parseInt(parts[2] || "100", 10) || 100;
      parsedTags.push({
        t: tag,
        c: catMap[catCode] || "general",
        p: count
      });
    }
  }

  // Sort by popularity descending and cap at 100,000 for snappy lookup
  parsedTags.sort((a, b) => (b.p || 0) - (a.p || 0));
  return parsedTags.slice(0, 100000);
}

document.getElementById("import-tagdb-btn").addEventListener("click", () => {
  document.getElementById("import-tagdb-file").click();
});

document.getElementById("import-tagdb-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const tags = parseExternalTagFile(file.name, ev.target.result);
      if (!tags.length) {
        showStatus("Не удалось распознать теги в файле");
        return;
      }
      await chrome.storage.local.set({ customTagDatabase: tags });
      document.getElementById("custom-db-count").textContent = `${tags.length.toLocaleString("ru-RU")} тегов`;
      showStatus(`Загружено ${tags.length.toLocaleString("ru-RU")} тегов!`);
    } catch (err) {
      alert("Ошибка разбора базы тегов: " + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById("clear-tagdb-btn").addEventListener("click", async () => {
  await chrome.storage.local.remove("customTagDatabase");
  document.getElementById("custom-db-count").textContent = "0 тегов";
  showStatus("Внешняя база тегов очищена");
});

document.getElementById("export-btn").addEventListener("click", async () => {
  const allData = await chrome.storage.local.get(["enabledDomains", "siteProfiles", "customSelectors", "settings"]);
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nyaa-smart-search-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  showStatus("Профили экспортированы!");
});

document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      await chrome.storage.local.set(parsed);
      initPopup();
      showStatus("Профили успешно импортированы!");
    } catch (err) {
      alert("Ошибка чтения файла JSON");
    }
  };
  reader.readAsText(file);
});

initPopup();

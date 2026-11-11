let currentHost = "";
let currentProfileKey = "";
let activeTabId = null;

function getProfileKey(hostname) {
  const host = (hostname || "").replace(/^www\./, "").toLowerCase();
  if (host === "nyaa.si" || host === "nyaa.land" || host.endsWith(".nyaa.si") || host.endsWith(".nyaa.land")) {
    return "nyaa.si";
  }
  return host;
}

function showStatus(text) {
  const el = document.getElementById("status-msg");
  el.textContent = text;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 2200);
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
    document.getElementById("domain-status").textContent = "Откройте nyaa.si или другой сайт";
    document.getElementById("site-toggle").disabled = true;
    document.getElementById("pick-input-btn").disabled = true;
  }

  const data = await chrome.storage.local.get(["enabledDomains", "siteProfiles"]);
  const enabledDomains = data.enabledDomains || ["nyaa.si", "nyaa.land", "sukebei.nyaa.si"];
  const siteProfiles = data.siteProfiles || {};
  const profile = siteProfiles[currentProfileKey] || { chips: [], favorites: [], history: [] };

  if (currentHost) {
    const isEnabled = enabledDomains.some(d => currentHost === d || currentHost.endsWith("." + d));
    document.getElementById("site-toggle").checked = isEnabled;
    document.getElementById("domain-status").textContent = isEnabled
      ? `Отдельная база тегов и фаворитов (${currentProfileKey})`
      : "Выключено на этом сайте";
  }

  const resetBtn = document.getElementById("reset-subsplease");
  if (currentProfileKey !== "nyaa.si") {
    resetBtn.style.display = "none";
  } else {
    resetBtn.style.display = "inline";
  }

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
        <span>${f.text.replace(/</g, "&lt;")}</span>
      </div>
    </div>
  `).join("");
}

document.getElementById("site-toggle").addEventListener("change", async (e) => {
  if (!currentHost) return;
  const { enabledDomains = ["nyaa.si", "nyaa.land", "sukebei.nyaa.si"], siteProfiles = {} } = await chrome.storage.local.get(["enabledDomains", "siteProfiles"]);
  let updated;
  if (e.target.checked) {
    if (!enabledDomains.includes(currentHost)) {
      updated = [...enabledDomains, currentHost];
    } else {
      updated = enabledDomains;
    }
    if (!siteProfiles[currentProfileKey]) {
      siteProfiles[currentProfileKey] = { chips: [], favorites: [], history: [] };
      await chrome.storage.local.set({ siteProfiles });
    }
    document.getElementById("domain-status").textContent = `Отдельная база тегов и фаворитов (${currentProfileKey})`;
  } else {
    updated = enabledDomains.filter(d => d !== currentHost && !currentHost.endsWith("." + d));
    document.getElementById("domain-status").textContent = "Выключено на этом сайте";
  }
  await chrome.storage.local.set({ enabledDomains: updated });
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

document.getElementById("export-btn").addEventListener("click", async () => {
  const allData = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nyaa-smart-search-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  showStatus("База экспортирована в файл!");
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
      showStatus("База успешно импортирована!");
    } catch (err) {
      alert("Ошибка чтения файла JSON");
    }
  };
  reader.readAsText(file);
});

initPopup();

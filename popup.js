let currentHost = "";
let currentProfileKey = "";
let activeTabId = null;

const DEFAULT_BLOCK_LAYOUT = [
  { id: "chips", label: "📌 Любимые теги (верхняя панель)", enabled: true },
  { id: "favorites", label: "★ Избранные запросы", enabled: true },
  { id: "frequent", label: "🔥 Частые теги (из вашего поиска)", enabled: true },
  { id: "history", label: "🕒 История поиска", enabled: true },
  { id: "autocomplete", label: "💡 Подсказки по вводу (автодополнение)", enabled: false },
  { id: "capsules", label: "💊 Капсулы слов текущего запроса", enabled: false },
  { id: "operators", label: "🛠 Кнопки операторов и рубрик сайта", enabled: false },
  { id: "catalog", label: "📚 Вкладки категорий и база тегов", enabled: false }
];

let currentLayout = JSON.parse(JSON.stringify(DEFAULT_BLOCK_LAYOUT));

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

function renderBlockList() {
  const container = document.getElementById("block-list");
  if (!container) return;
  container.innerHTML = currentLayout.map((b, idx) => `
    <div class="block-item">
      <label>
        <input type="checkbox" data-id="${b.id}" ${b.enabled ? "checked" : ""}>
        <span style="color:${b.enabled ? "#fff" : "#777"};">${idx + 1}. ${b.label}</span>
      </label>
      <div>
        <button type="button" class="arr-btn" data-idx="${idx}" data-dir="-1" ${idx === 0 ? "disabled" : ""}>▲</button>
        <button type="button" class="arr-btn" data-idx="${idx}" data-dir="1" ${idx === currentLayout.length - 1 ? "disabled" : ""}>▼</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", async () => {
      const item = currentLayout.find(x => x.id === cb.dataset.id);
      if (item) {
        item.enabled = cb.checked;
        await chrome.storage.local.set({ blockLayout: currentLayout });
        renderBlockList();
        showStatus("Блоки обновлены!");
      }
    });
  });

  container.querySelectorAll(".arr-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.idx);
      const dir = Number(btn.dataset.dir);
      const nextIdx = idx + dir;
      if (nextIdx >= 0 && nextIdx < currentLayout.length) {
        const tmp = currentLayout[idx];
        currentLayout[idx] = currentLayout[nextIdx];
        currentLayout[nextIdx] = tmp;
        await chrome.storage.local.set({ blockLayout: currentLayout });
        renderBlockList();
        showStatus("Порядок строк сохранён!");
      }
    });
  });
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

  const data = await chrome.storage.local.get(["enabledDomains", "siteProfiles", "settings", "customTagDatabase", "blockLayout"]);
  const enabledDomains = data.enabledDomains || [];
  const settings = data.settings || { pageTagHover: true };
  currentLayout = normalizeBlockLayout(data.blockLayout);
  renderBlockList();

  document.getElementById("hover-collect-toggle").checked = settings.pageTagHover !== false;
  const customTags = Array.isArray(data.customTagDatabase) ? data.customTagDatabase : [];
  document.getElementById("custom-db-count").textContent = `${customTags.length.toLocaleString("ru-RU")} тегов`;

  if (currentHost) {
    const isEnabled = enabledDomains.some(d => currentHost === d || currentHost.endsWith("." + d));
    document.getElementById("site-toggle").checked = isEnabled;
    document.getElementById("domain-status").textContent = isEnabled
      ? `Отдельная память поиска (${currentProfileKey})`
      : "Выключено на этом сайте";
  }
}

document.getElementById("reset-layout-btn").addEventListener("click", async () => {
  currentLayout = JSON.parse(JSON.stringify(DEFAULT_BLOCK_LAYOUT));
  await chrome.storage.local.set({ blockLayout: currentLayout });
  renderBlockList();
  showStatus("Конструктор сброшен по умолчанию!");
});

document.getElementById("site-toggle").addEventListener("change", async (e) => {
  if (!currentHost) return;
  const { enabledDomains = [], siteProfiles = {} } = await chrome.storage.local.get(["enabledDomains", "siteProfiles"]);
  let updated;
  if (e.target.checked) {
    updated = enabledDomains.includes(currentHost) ? enabledDomains : [...enabledDomains, currentHost];
    if (!siteProfiles[currentProfileKey] || !Array.isArray(siteProfiles[currentProfileKey].chips) || siteProfiles[currentProfileKey].chips.length === 0) {
      const defChips = currentProfileKey.includes("exhentai")
        ? ["language:russian$", "language:english$", "language:translated$", "other:uncensored$", "other:\"full color$\"", "female:\"sole female$\"", "male:\"sole male$\"", "female:\"big breasts$\"", "-male:yaoi$"]
        : currentProfileKey.includes("nhentai")
        ? ["russian", "english", "translated", "\"full color\"", "uncensored", "\"sole female\"", "\"sole male\"", "\"big breasts\"", "-yaoi"]
        : currentProfileKey.includes("booru")
        ? ["1girl", "solo", "highres", "absurdres", "long_hair", "breasts", "order:score", "-animated"]
        : ["1080p", "Russian", "English", "Uncensored", "Full Color"];
      siteProfiles[currentProfileKey] = {
        chips: defChips,
        favorites: siteProfiles[currentProfileKey]?.favorites || [],
        history: siteProfiles[currentProfileKey]?.history || [],
        tagStats: siteProfiles[currentProfileKey]?.tagStats || {},
        ignoredTags: siteProfiles[currentProfileKey]?.ignoredTags || []
      };
      await chrome.storage.local.set({ siteProfiles });
    }
    document.getElementById("domain-status").textContent = `Отдельная память поиска (${currentProfileKey})`;
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
  const allData = await chrome.storage.local.get(["enabledDomains", "siteProfiles", "customSelectors", "settings", "blockLayout"]);
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

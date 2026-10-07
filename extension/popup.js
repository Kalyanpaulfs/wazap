const MAX_RECENT = 8;
const STORAGE_KEY = "wazap_recent";

const dialEl = document.getElementById("dial");
const numberEl = document.getElementById("number");
const messageEl = document.getElementById("message");
const openBtn = document.getElementById("openBtn");
const recentSection = document.getElementById("recentSection");
const recentList = document.getElementById("recentList");
const toastEl = document.getElementById("toast");

// Restore saved dial code
chrome.storage.local.get(["wazap_dial"], (res) => {
  if (res.wazap_dial) dialEl.value = res.wazap_dial;
});

dialEl.addEventListener("change", () => {
  chrome.storage.local.set({ wazap_dial: dialEl.value });
});

function getWaUrl() {
  const clean = numberEl.value.replace(/\D/g, "");
  if (!clean) return null;
  const full = dialEl.value + clean;
  const msg = messageEl.value.trim();
  return msg
    ? `https://wa.me/${full}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/${full}`;
}

function updateBtn() {
  openBtn.disabled = !numberEl.value.replace(/\D/g, "");
}

numberEl.addEventListener("input", updateBtn);

openBtn.addEventListener("click", () => {
  const url = getWaUrl();
  if (!url) return;
  chrome.tabs.create({ url });
  saveRecent(dialEl.value, numberEl.value.replace(/\D/g, ""), messageEl.value.trim());
});

// Enter key opens WhatsApp
numberEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !openBtn.disabled) openBtn.click();
});

function saveRecent(dial, number, message) {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const list = res[STORAGE_KEY] || [];
    const entry = { dial, number, message, ts: Date.now() };
    const filtered = list.filter(r => !(r.dial === dial && r.number === number));
    filtered.unshift(entry);
    chrome.storage.local.set({ [STORAGE_KEY]: filtered.slice(0, MAX_RECENT) });
  });
}

function loadRecent() {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const list = res[STORAGE_KEY] || [];
    if (list.length === 0) {
      recentSection.style.display = "none";
      return;
    }
    recentSection.style.display = "block";
    recentList.innerHTML = "";
    list.forEach(({ dial, number, message }) => {
      const item = document.createElement("div");
      item.className = "recent-item";
      item.innerHTML = `
        <span class="recent-number">+${dial} ${number}</span>
        <span class="recent-open">Open ↗</span>
      `;
      item.addEventListener("click", () => {
        const full = dial + number;
        const url = message
          ? `https://wa.me/${full}?text=${encodeURIComponent(message)}`
          : `https://wa.me/${full}`;
        chrome.tabs.create({ url });
        saveRecent(dial, number, message);
      });
      recentList.appendChild(item);
    });
  });
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2000);
}

loadRecent();
numberEl.focus();

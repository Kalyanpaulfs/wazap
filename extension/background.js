chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "wazap-send",
    title: "Send via WhatsApp (Wazap)",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "wazap-send") return;
  const text = (info.selectionText || "").trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 7) {
    chrome.tabs.create({ url: `https://wa.me/${digits}` });
  } else if (text) {
    chrome.tabs.create({
      url: `https://wa.me/?text=${encodeURIComponent(text)}`,
    });
  }
});

"use strict";
const enabled = document.getElementById("enabled");
const status = document.getElementById("status");
chrome.storage.local.get({ enabled: true }, settings => {
  if (chrome.runtime.lastError) {
    status.textContent = "Could not load settings. Reopen this popup.";
    return;
  }
  enabled.checked = settings.enabled;
  enabled.disabled = false;
  status.textContent = settings.enabled ? "Enabled on X / Twitter" : "Original layout enabled";
});
enabled.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabled.checked }, () => {
    if (chrome.runtime.lastError) {
      status.textContent = "Could not save. Please try again.";
      return;
    }
    status.textContent = enabled.checked ? "Enabled — updates automatically" : "Disabled — original layout restored";
  });
});

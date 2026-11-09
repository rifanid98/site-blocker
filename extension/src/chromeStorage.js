// Adapts chrome.storage.local to the { get, set } shape BlockStore expects.
export const chromeStorage = {
  async get(key) {
    return (await chrome.storage.local.get(key))[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

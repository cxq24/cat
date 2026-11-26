/* Browser-only simulator. This file is excluded from the platform build. */
(function () {
  window.__CAT_CAFE_PREVIEW__ = true;
  window.xhs = {
    launchOptions: { miniToolEnv: { buildVersion: 9550001 } },
    miniTool: {
      getStorage: async function (options) { return { data: localStorage.getItem('cat-cafe-preview:' + options.key) }; },
      setStorage: async function (options) { localStorage.setItem('cat-cafe-preview:' + options.key, options.data); return { errMsg: 'setStorage:ok' }; }
    }
  };
}());

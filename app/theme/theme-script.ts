/** Runs before first paint (inlined in <head>) so the saved or system theme is applied without a flash. */
export const THEME_STORAGE_KEY = "wazap-theme";

export const themeScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="light"&&p!=="dark")p="auto";var d=p==="dark"||(p==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.setAttribute("data-theme",d?"dark":"light");e.setAttribute("data-theme-pref",p);}catch(_){}})();`;

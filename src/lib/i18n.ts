export type Locale = "en" | "zh";

export const localeStorageKey = "vd:locale:v1";

export interface I18nMessages {
  localeName: string;
  app: {
    loading: string;
    desktopAria: string;
    personalWebDesktop: string;
    openWeather: string;
    openApp: (title: string) => string;
    resizeWindow: string;
    fallbackIconLabel: string;
  };
  dock: {
    aria: string;
    addApp: string;
    pin: string;
    unpin: string;
    runningApps: string;
  };
  localApps: {
    statusRunning: string;
    statusBooting: string;
    statusStopped: string;
    statusError: string;
  };
  contextMenu: {
    tileSize: string;
    tileSizeRejected: string;
    addApp: string;
    autoArrange: string;
    changeWallpaper: string;
    open: string;
    edit: string;
    changeIcon: string;
    remove: string;
    start: string;
    stop: string;
  };
  window: {
    external: string;
    minimize: string;
    close: string;
    maximize: string;
    restore: string;
    closeQuestion: string;
    quitApp: string;
    minimizeKeepRunning: string;
    cancel: string;
  };
  builtins: {
    startBoard: {
      title: string;
      description: string;
    };
    weather: {
      title: string;
      description: string;
    };
    appStore: {
      title: string;
      description: string;
    };
    webUiImport: {
      title: string;
      description: string;
    };
    localApps: {
      title: string;
      description: string;
    };
    settings: {
      title: string;
      description: string;
    };
  };
  appStore: {
    eyebrow: string;
    title: string;
    description: string;
    add: string;
    openImport: string;
    emptyTitle: string;
    emptyBody: string;
    directoryHint: string;
    categoryCount: (count: number) => string;
    types: {
      all: string;
      websites: string;
      githubApps: string;
    };
    categoryIndex: string;
    repository: string;
    starsSnapshot: (count: string, date: string) => string;
    added: (title: string) => string;
    addFailed: string;
    categories: {
      all: string;
      system: string;
      globalAi: string;
      chinaAi: string;
      localWebUi: string;
      aiPlatforms: string;
      automation: string;
      design: string;
      media: string;
      documents: string;
      monitoring: string;
      notes: string;
      developerTools: string;
      finance: string;
    };
    openingModes: {
      desktopWindow: string;
      externalTab: string;
    };
  };
  startBoard: {
    eyebrow: string;
    title: string;
    description: string;
    overview: string;
    installed: string;
    localWebUis: string;
    running: string;
    runningNow: string;
    actions: string;
    manageDesktop: string;
    manageWebUis: string;
    addApps: string;
    scanComputer: string;
    applications: string;
    openSomething: string;
    search: string;
    searchPlaceholder: string;
    noMatches: string;
    newTab: string;
    desktopWindow: string;
    doubleClickExternal: string;
    stopped: string;
    daemon: string;
    online: string;
    offline: string;
    refresh: string;
    refreshing: string;
    statusUpdated: string;
    systemOverview: string;
    managedApps: string;
    cpu: string;
    memory: string;
    hostMemory: string;
    load: string;
    uptime: string;
    systemServices: string;
    unavailable: string;
    daemonUnavailable: string;
    managedProcesses: string;
    processes: string;
    noProcesses: string;
    name: string;
    status: string;
    port: string;
    controls: string;
    healthy: string;
    unhealthy: string;
    error: string;
    start: string;
    stop: string;
    restart: string;
    open: string;
  };
  weather: {
    openToUpdate: string;
    chooseCity: string;
    liveWeather: string;
    searchCity: string;
    cityAria: string;
    cityPlaceholder: string;
    update: string;
    condition: string;
    humidity: string;
    wind: string;
    updated: string;
    waiting: string;
    notYet: string;
    animationAria: (condition: string) => string;
    statusEnterCity: string;
    statusUpdating: string;
    statusCouldNotLoad: string;
    statusUpdated: (time: string) => string;
    lookupFailed: string;
    noMatchingCity: string;
    forecastFailed: string;
    incomplete: string;
    conditionLabels: Record<string, string>;
    currentSummary: (label: string, humidity: number, windSpeed: number) => string;
    widgetDetail: (label: string, windSpeed: number) => string;
  };
  settings: {
    eyebrow: string;
    title: string;
    description: string;
    saving: string;
    saveFailed: string;
    saved: string;
    copySuccess: string;
    installOpening: string;
    installAccepted: string;
    installDismissed: string;
    installUnavailable: string;
    startPageKicker: string;
    startPageTitle: string;
    startPageBody: string;
    startPageInputAria: string;
    startPageLoading: string;
    copy: string;
    initialAppKicker: string;
    initialAppTitle: string;
    initialAppBody: string;
    chooseStartAppAria: string;
    desktopOnly: string;
    themesKicker: string;
    themesTitle: string;
    themesBody: string;
    shellKicker: string;
    shellTitle: string;
    shellBody: string;
    desktopBrowserKicker: string;
    setHomeTitle: string;
    setHomeSteps: string[];
    pwaKicker: string;
    installDeskTitle: string;
    pwaInstalled: string;
    pwaBody: string;
    installButton: string;
    installStepsButton: string;
    mobileNote: string;
    smallWebappsKicker: string;
    smallWebappsTitle: string;
    smallWebappsBody: string;
    guideKicker: string;
    guideTitle: string;
    guideBody: string;
    guideButton: string;
    languageKicker: string;
    languageTitle: string;
    languageBody: string;
    ready: string;
    nav: {
      general: string;
      generalHint: string;
      startPage: string;
      startPageHint: string;
      appearance: string;
      appearanceHint: string;
      apps: string;
      appsHint: string;
      language: string;
      languageHint: string;
      install: string;
      installHint: string;
    };
  };
  webUi: {
    eyebrow: string;
    title: string;
    description: string;
    scan: string;
    addSelected: string;
    statusChecking: string;
    statusFound: (count: number) => string;
    statusNoResponse: string;
    statusSelectOne: string;
    statusAdding: string;
    statusAdded: (count: number) => string;
    statusNothingAdded: string;
    statusPasteFirst: string;
    statusImporting: string;
    statusImported: (count: number) => string;
    statusNoValid: string;
    added: string;
    probe: Record<"idle" | "checking" | "found" | "missing", string>;
    manualKicker: string;
    manualTitle: string;
    manualBody: string;
    manualPlaceholder: string;
    manualButton: string;
    importedDescription: string;
    candidates: Record<string, string>;
  };
  embed: {
    checkFailed: string;
    cannotEmbed: string;
    checkCouldNotRun: string;
    loadTimeout: string;
    loadError: string;
    checking: string;
    loading: string;
    starting: string;
    openExternal: string;
    bridgeRequired: string;
    saveAppFailed: string;
  };
  /** Shown where a feature needs the local machine and the online trial has none. */
  trial: {
    eyebrow: string;
    title: string;
    localAppsBody: string;
    webUiImportBody: string;
    getItLabel: string;
  };
  dialogs: {
    addAppTitle: string;
    editAppTitle: string;
    wallpaperTitle: string;
    close: string;
    cancel: string;
    appPreviewDescription: string;
    websiteUrl: string;
    readSite: string;
    name: string;
    description: string;
    iconUrl: string;
    uploadLocalIcon: string;
    openMode: string;
    desktopWindow: string;
    externalTab: string;
    setAsStart: string;
    saveApp: string;
    urlFirst: string;
    resolving: string;
    metadataFailed: string;
    metadataLoaded: string;
    saveNeedsUrl: string;
    savingApp: string;
    savingAppWithIcon: string;
    saveFailed: string;
    desktopShortcut: string;
    url: string;
    customIcon: string;
    useIconUrl: string;
    saveChanges: string;
    saving: string;
    changesSaveFailed: string;
    uploadWallpaper: string;
    wallpaperLocalOnly: string;
    untitledApp: string;
  };
  data: {
    wallpapers: Record<string, string>;
    themes: Record<string, { name: string; browserFit: string; description: string }>;
    shellStyles: Record<string, { name: string; description: string }>;
    directory: Record<string, { title: string; description: string }>;
  };
}

const en: I18nMessages = {
  localeName: "English",
  app: {
    loading: "Loading Vibe Desktop",
    desktopAria: "Desktop apps",
    personalWebDesktop: "Personal web desktop",
    openWeather: "Open Weather",
    openApp: (title) => `Open ${title}`,
    resizeWindow: "Resize window",
    fallbackIconLabel: "App"
  },
  dock: {
    aria: "Desktop dock",
    // No leading "+": the button renders a PlusIcon of its own.
    addApp: "Add App",
    pin: "Pin dock (always show)",
    unpin: "Auto-hide dock",
    runningApps: "Running apps"
  },
  localApps: {
    statusRunning: "Running",
    statusBooting: "Starting",
    statusStopped: "Stopped",
    statusError: "Error"
  },
  contextMenu: {
    tileSize: "Size",
    tileSizeRejected: "That size does not fit here.",
    addApp: "Add App",
    autoArrange: "Auto Arrange",
    changeWallpaper: "Change Wallpaper",
    open: "Open",
    edit: "Edit",
    changeIcon: "Change Icon",
    remove: "Remove",
    start: "Start",
    stop: "Stop"
  },
  window: {
    external: "External",
    minimize: "Minimize",
    close: "Close",
    maximize: "Maximize",
    restore: "Restore",
    closeQuestion: "Close this window — stop the app, or keep it running in the background?",
    quitApp: "Quit",
    minimizeKeepRunning: "Minimize",
    cancel: "Cancel"
  },
  builtins: {
    startBoard: {
      title: "Start Board",
      description: "System health and managed WebUI processes."
    },
    weather: {
      title: "Weather",
      description: "Animated live weather widget."
    },
    appStore: {
      title: "App Store",
      description: "Curated websites and high-star GitHub applications."
    },
    webUiImport: {
      title: "WebUI Import",
      description: "Find local WebUI tools and add them as desktop apps."
    },
    localApps: {
      title: "Local WebApps",
      description: "Spawn and control local web servers from vibe-daemon."
    },
    settings: {
      title: "Settings",
      description: "Desktop preferences."
    }
  },
  appStore: {
    eyebrow: "Quick-add catalog",
    title: "Application Catalog",
    description: "Browse websites and curated high-star GitHub applications by category.",
    add: "Add",
    openImport: "Open WebUI Import",
    emptyTitle: "No apps in this category yet",
    emptyBody: "Switch categories or add any website from the desktop dock.",
    directoryHint: "Single click opens inside Vibe Desktop. Double click opens the website in a browser tab.",
    categoryCount: (count) => `${count}`,
    types: {
      all: "All",
      websites: "Websites",
      githubApps: "GitHub apps"
    },
    categoryIndex: "Categories",
    repository: "GitHub",
    starsSnapshot: (count, date) => `★ ${count} · snapshot ${date}`,
    added: (title) => `${title} added to the desktop.`,
    addFailed: "Could not add this application.",
    categories: {
      all: "All",
      system: "System",
      globalAi: "Global AI",
      chinaAi: "China AI",
      localWebUi: "Local WebUI",
      aiPlatforms: "AI platforms",
      automation: "Automation",
      design: "Design",
      media: "Media",
      documents: "Documents",
      monitoring: "Monitoring",
      notes: "Notes",
      developerTools: "Developer tools",
      finance: "Finance"
    },
    openingModes: {
      desktopWindow: "Desktop Window",
      externalTab: "External Tab"
    }
  },
  startBoard: {
    eyebrow: "Desktop control center",
    title: "System Monitor",
    description: "Check Vibe Desktop, vibed, and every managed WebUI process.",
    overview: "Desktop overview",
    installed: "Installed apps",
    localWebUis: "Local WebUIs",
    running: "Running",
    runningNow: "Running now",
    actions: "Operations",
    manageDesktop: "Manage this desktop",
    manageWebUis: "Manage WebUIs",
    addApps: "Add applications",
    scanComputer: "Scan this computer",
    applications: "Applications",
    openSomething: "Open an installed app",
    search: "Search applications",
    searchPlaceholder: "Find an app",
    noMatches: "No installed application matches this search.",
    newTab: "New tab",
    desktopWindow: "Desktop window",
    doubleClickExternal: "Double click to open in a new browser tab",
    stopped: "Stopped",
    daemon: "vibed",
    online: "Online",
    offline: "Offline",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    statusUpdated: "System and process status updated.",
    systemOverview: "System overview",
    managedApps: "Managed WebUIs",
    cpu: "CPU",
    memory: "Memory",
    hostMemory: "Host memory",
    load: "Load (1m)",
    uptime: "Host uptime",
    systemServices: "Core services",
    unavailable: "Unavailable",
    daemonUnavailable: "Daemon is not responding",
    managedProcesses: "Managed processes",
    processes: "processes",
    noProcesses: "No managed WebUI process is registered yet.",
    name: "Name",
    status: "Status",
    port: "Port",
    controls: "Controls",
    healthy: "Healthy",
    unhealthy: "Unhealthy",
    error: "Error",
    start: "Start",
    stop: "Stop",
    restart: "Restart",
    open: "Open"
  },
  weather: {
    openToUpdate: "Open to update",
    chooseCity: "Choose a city",
    liveWeather: "Live weather",
    searchCity: "Search a city to load the local desktop weather widget.",
    cityAria: "Weather city",
    cityPlaceholder: "Shanghai",
    update: "Update",
    condition: "Condition",
    humidity: "Humidity",
    wind: "Wind",
    updated: "Updated",
    waiting: "Waiting",
    notYet: "Not yet",
    animationAria: (condition) => `${condition} weather animation`,
    statusEnterCity: "Enter a city to load weather.",
    statusUpdating: "Updating weather...",
    statusCouldNotLoad: "Weather could not be loaded.",
    statusUpdated: (time) => `Updated ${time}.`,
    lookupFailed: "Weather city lookup failed.",
    noMatchingCity: "No matching city found.",
    forecastFailed: "Weather forecast failed.",
    incomplete: "Weather data is incomplete.",
    conditionLabels: {
      clear: "Clear",
      mainlyClear: "Mainly clear",
      partlyCloudy: "Partly cloudy",
      fog: "Fog",
      drizzle: "Drizzle",
      freezingDrizzle: "Freezing drizzle",
      rain: "Rain",
      freezingRain: "Freezing rain",
      snow: "Snow",
      thunderstorm: "Thunderstorm",
      windy: "Windy"
    },
    currentSummary: (label, humidity, windSpeed) => `${label}. Humidity ${humidity}%. Wind ${Math.round(windSpeed)} km/h.`,
    widgetDetail: (label, windSpeed) => `${label} · ${Math.round(windSpeed)} km/h`
  },
  settings: {
    eyebrow: "Desktop settings",
    title: "Make this your first screen",
    description:
      "Use Vibe Desktop as the page that opens when the browser starts, then add your small webapps and AI tools as icons instead of hunting through bookmarks.",
    saving: "Saving...",
    saveFailed: "Could not save this setting.",
    saved: "Saved.",
    copySuccess: "Start page link copied.",
    installOpening: "Opening install prompt...",
    installAccepted: "Install accepted. Vibe Desktop can now open like an app.",
    installDismissed: "Install dismissed. You can install later from this panel or your browser menu.",
    installUnavailable: "Use your browser menu to install or add Vibe Desktop to the home screen.",
    startPageKicker: "Browser start page",
    startPageTitle: "Open straight into your desktop",
    startPageBody: "Set this URL as your browser start page or new-tab replacement target.",
    startPageInputAria: "Vibe Desktop start page URL",
    startPageLoading: "Loading start page URL...",
    copy: "Copy",
    initialAppKicker: "Initial app",
    initialAppTitle: "Choose what opens first",
    initialAppBody: "Keep the normal desktop, or auto-open one webapp/widget as the homepage surface.",
    chooseStartAppAria: "Choose start app",
    desktopOnly: "Desktop only",
    themesKicker: "Themes",
    themesTitle: "Match your browser mood",
    themesBody: "These are coordinated homepage themes, not separate desktops.",
    shellKicker: "Shell style",
    shellTitle: "Keep one desktop, tune the chrome",
    shellBody: "Later this can become Windows/macOS/GNOME-style interaction modes. For now it only changes the feel.",
    desktopBrowserKicker: "Desktop browser",
    setHomeTitle: "Set it as home",
    setHomeSteps: [
      "Open browser settings.",
      "Find startup, home page, or new window settings.",
      "Choose a custom page and paste the Vibe Desktop start URL."
    ],
    pwaKicker: "Mobile and PWA",
    installDeskTitle: "Install the desk",
    pwaInstalled: "Vibe Desktop is already running in app mode.",
    pwaBody: "Install it as a PWA for a cleaner phone or desktop launcher.",
    installButton: "Install Vibe Desktop",
    installStepsButton: "Show install steps",
    mobileNote: "On mobile, use the browser share/menu action and choose Add to Home Screen or Install app.",
    smallWebappsKicker: "Small webapps",
    smallWebappsTitle: "Use URL apps first",
    smallWebappsBody:
      "Paste any webapp URL from the dock. Vibe Desktop will pull the title and icon, try desktop-window mode, and fall back to external tabs when the site blocks embedding.",
    guideKicker: "New user guide",
    guideTitle: "Replay setup",
    guideBody: "Show the quick desktop setup guide again without resetting your apps or wallpaper.",
    guideButton: "Open guide",
    languageKicker: "Language",
    languageTitle: "Interface language",
    languageBody: "Switch the shell language in this browser. Your app data stays unchanged.",
    ready: "Ready",
    nav: {
      general: "General",
      generalHint: "Desktop basics",
      startPage: "Start Page",
      startPageHint: "Browser first screen",
      appearance: "Appearance",
      appearanceHint: "Themes and shell",
      apps: "Apps",
      appsHint: "Web app behavior",
      language: "Language",
      languageHint: "Shell locale",
      install: "Install",
      installHint: "PWA and homepage"
    }
  },
  webUi: {
    eyebrow: "WebUI Import Skill",
    title: "Pull your local tools onto the desktop",
    description:
      "Scan common localhost WebUI ports from this browser session, then add the found tools as normal desktop icons. This is a browser-only bridge for now; later the local runtime can scan projects and start processes directly.",
    scan: "Scan local WebUIs",
    addSelected: "Add selected",
    statusChecking: "Checking common local WebUI ports...",
    statusFound: (count) => `Found ${count} local WebUI app${count === 1 ? "" : "s"}.`,
    statusNoResponse: "No new local WebUI ports responded.",
    statusSelectOne: "Select at least one WebUI to add.",
    statusAdding: "Adding selected WebUIs...",
    statusAdded: (count) => `Added ${count} WebUI app${count === 1 ? "" : "s"} to the desktop.`,
    statusNothingAdded: "Nothing new was added.",
    statusPasteFirst: "Paste one or more new WebUI URLs first.",
    statusImporting: "Importing pasted WebUI URLs...",
    statusImported: (count) => `Imported ${count} custom WebUI URL${count === 1 ? "" : "s"}.`,
    statusNoValid: "No valid new URLs were imported.",
    added: "Added",
    probe: {
      idle: "Not checked",
      checking: "Checking",
      found: "Found",
      missing: "No response"
    },
    manualKicker: "Manual batch",
    manualTitle: "Paste your own WebUI URLs",
    manualBody: "Use one URL per line, or `Name | URL` for cleaner labels.",
    manualPlaceholder: "Comfy test | http://127.0.0.1:8188\nhttp://localhost:7860",
    manualButton: "Import pasted URLs",
    importedDescription: "Imported local WebUI shortcut.",
    candidates: {
      "stable-diffusion-webui": "Automatic1111, Forge, Gradio, and image-generation WebUI defaults.",
      comfyui: "Node-based image workflow UI running on the local machine.",
      "open-webui": "Local LLM chat UI commonly paired with Ollama.",
      n8n: "Local automation workflow builder.",
      jupyter: "Notebook and data workspace running locally.",
      anythingllm: "Local knowledge-base chat workspace.",
      librechat: "Self-hosted multi-provider chat UI.",
      sillytavern: "Local character and agent chat interface."
    }
  },
  embed: {
    checkFailed: "Embed check failed.",
    cannotEmbed: "This site cannot be embedded in a desktop window.",
    checkCouldNotRun: "This site could not be checked for embedded window support.",
    loadTimeout: "This site did not finish loading inside the desktop window.",
    loadError: "This site failed to load inside the desktop window.",
    checking: "Checking whether this website allows desktop-window embedding.",
    loading: "Loading this website inside the desktop window.",
    starting: "Starting the app…",
    openExternal: "Open external tab",
    bridgeRequired: "Run npm run desktop:open to enable protected website embedding.",
    saveAppFailed: "Could not save app."
  },
  trial: {
    eyebrow: "Online trial",
    title: "This part needs your own machine",
    localAppsBody:
      "Local WebApps starts and stops real programs on the computer running Vibe Desktop. This online trial runs entirely in your browser, so there is no machine for it to manage. Everything else on this desktop works — and it is yours alone: your arrangement is stored in this browser only.",
    webUiImportBody:
      "WebUI Import looks for tools already listening on your own localhost ports. A public page cannot see them, so this trial leaves it out. Install Vibe Desktop locally and it will find them.",
    getItLabel: "Run it on your machine"
  },
  dialogs: {
    addAppTitle: "Add App",
    editAppTitle: "Edit App",
    wallpaperTitle: "Change Wallpaper",
    close: "Close",
    cancel: "Cancel",
    appPreviewDescription: "A web app shortcut for your Vibe Desktop.",
    websiteUrl: "Website URL",
    readSite: "Read site",
    name: "Name",
    description: "Description",
    iconUrl: "Icon URL",
    uploadLocalIcon: "Upload local icon",
    openMode: "Open mode",
    desktopWindow: "Desktop Window",
    externalTab: "External Tab",
    setAsStart: "Make this the app that opens first on my desktop",
    saveApp: "Save App",
    urlFirst: "Paste a website URL first.",
    resolving: "Resolving...",
    metadataFailed: "Could not read that site. You can still fill the app manually.",
    metadataLoaded: "Website details loaded.",
    saveNeedsUrl: "Add a URL before saving.",
    savingApp: "Saving app...",
    savingAppWithIcon: "Saving app and local icon...",
    saveFailed: "Check the URL and title before saving.",
    desktopShortcut: "Desktop app shortcut.",
    url: "URL",
    customIcon: "Custom icon",
    useIconUrl: "Use Icon URL",
    saveChanges: "Save Changes",
    saving: "Saving...",
    changesSaveFailed: "Could not save changes.",
    uploadWallpaper: "Upload local wallpaper",
    wallpaperLocalOnly: "Uploaded wallpapers stay in this browser for v1.",
    untitledApp: "Untitled App"
  },
  data: {
    wallpapers: {
      "noir-dawn": "Noir dawn",
      "midnight-orbit": "Midnight orbit",
      "ember-night": "Ember night",
      "mineral-morning": "Mineral morning",
      "quiet-orbit": "Quiet orbit",
      "paper-sky": "Paper sky",
      "paper-linen": "Paper linen"
    },
    themes: {
      mineral: {
        name: "Mineral Morning",
        browserFit: "Balanced default",
        description: "Soft desktop colors for users who keep Vibe open all day."
      },
      "chrome-blue": {
        name: "Chrome Blue",
        browserFit: "Chrome and Material",
        description: "Blue focus, pale cards, and clean neutral surfaces."
      },
      "edge-fluent": {
        name: "Edge Fluent",
        browserFit: "Edge and Windows",
        description: "Neutral Fluent surfaces with a restrained Microsoft blue anchor."
      },
      "firefox-violet": {
        name: "Firefox Violet",
        browserFit: "Firefox colorful themes",
        description: "Violet chrome with warm orange energy for a lively new-tab desk."
      },
      "safari-glass": {
        name: "Safari Glass",
        browserFit: "Safari and iOS PWA",
        description: "Cool blue glass, bright white surfaces, and mobile-home-screen calm."
      },
      "arc-graphite": {
        name: "Arc Graphite",
        browserFit: "Arc-style focused browsing",
        description: "Graphite panels with one crisp acidic accent."
      },
      "brave-ember": {
        name: "Brave Ember",
        browserFit: "Brave and privacy-first browsing",
        description: "Warm ember color for people who prefer a strong browser identity."
      },
      "paper-ink": {
        name: "Paper Ink",
        browserFit: "Reading and writing",
        description: "Low-saturation paper for a start page that should stay quiet."
      },
      "forest-calm": {
        name: "Forest Calm",
        browserFit: "Nature and dark green themes",
        description: "Green-blue glass for users who want the homepage to feel less digital."
      },
      "terminal-lime": {
        name: "Terminal Lime",
        browserFit: "Developer dark setups",
        description: "A compact dark homepage theme tuned for local tools and coding apps."
      }
    },
    shellStyles: {
      glass: {
        name: "Soft Glass",
        description: "Rounded, translucent, and calm. Best for PWA and homepage use."
      },
      browser: {
        name: "Browser Chrome",
        description: "Tighter radius and stronger toolbar surfaces to match desktop browsers."
      },
      compact: {
        name: "Compact Desk",
        description: "Denser controls and smaller windows for power users."
      },
      focus: {
        name: "Focus Board",
        description: "Higher contrast cards and heavier shadows for widget-first use."
      }
    },
    directory: {
      chatgpt: {
        title: "ChatGPT",
        description: "OpenAI's general AI assistant."
      },
      claude: {
        title: "Claude",
        description: "Anthropic's AI assistant."
      },
      deepseek: {
        title: "DeepSeek",
        description: "DeepSeek chat for coding and reasoning."
      },
      kimi: {
        title: "Kimi",
        description: "Moonshot AI's long-context assistant."
      },
      doubao: {
        title: "Doubao",
        description: "ByteDance's AI assistant."
      },
      qwen: {
        title: "Qwen",
        description: "Alibaba Qwen chat."
      },
      yuanbao: {
        title: "Tencent Yuanbao",
        description: "Tencent Yuanbao AI assistant."
      },
      wenxin: {
        title: "Wenxin",
        description: "Baidu Wenxin/ERNIE assistant."
      }
    }
  }
};

const zh: I18nMessages = {
  localeName: "中文",
  app: {
    loading: "正在打开 Vibe Desktop",
    desktopAria: "桌面应用",
    personalWebDesktop: "个人网页桌面",
    openWeather: "打开天气",
    openApp: (title) => `打开${title}`,
    resizeWindow: "调整窗口大小",
    fallbackIconLabel: "应用"
  },
  dock: {
    aria: "桌面 Dock",
    addApp: "添加应用",
    pin: "固定 Dock（常驻显示）",
    unpin: "自动隐藏 Dock",
    runningApps: "本地应用"
  },
  localApps: {
    statusRunning: "运行中",
    statusBooting: "启动中",
    statusStopped: "已停止",
    statusError: "出错"
  },
  contextMenu: {
    tileSize: "尺寸",
    tileSizeRejected: "这个尺寸放不下。",
    addApp: "添加应用",
    autoArrange: "自动排列",
    changeWallpaper: "更换壁纸",
    open: "打开",
    edit: "编辑",
    changeIcon: "更换图标",
    remove: "移除",
    start: "启动",
    stop: "停止"
  },
  window: {
    external: "外部打开",
    minimize: "最小化",
    close: "关闭",
    maximize: "最大化",
    restore: "还原",
    closeQuestion: "关闭此窗口——彻底退出应用，还是保持后台运行？",
    quitApp: "彻底退出",
    minimizeKeepRunning: "最小化",
    cancel: "取消"
  },
  builtins: {
    startBoard: {
      title: "开始面板",
      description: "查看系统健康与受管 WebUI 进程。"
    },
    weather: {
      title: "天气",
      description: "带动画的实时天气小组件。"
    },
    appStore: {
      title: "应用商店",
      description: "分类浏览网站和 GitHub 高星应用。"
    },
    webUiImport: {
      title: "WebUI 导入",
      description: "发现本地 WebUI 工具并添加为桌面应用。"
    },
    localApps: {
      title: "本地 WebApp",
      description: "通过 vibe-daemon 启动和管理本地网页服务。"
    },
    settings: {
      title: "设置",
      description: "桌面偏好设置。"
    }
  },
  appStore: {
    eyebrow: "快速添加目录",
    title: "应用目录",
    description: "按分类浏览网站与经过整理的 GitHub 高星应用。",
    add: "添加",
    openImport: "打开 WebUI 导入",
    emptyTitle: "这个分类还没有应用",
    emptyBody: "切换分类，或从桌面 Dock 添加任意网站。",
    directoryHint: "单击在 Vibe Desktop 内打开，双击才在浏览器新标签页打开。",
    categoryCount: (count) => `${count}`,
    types: {
      all: "全部",
      websites: "网站",
      githubApps: "GitHub 应用"
    },
    categoryIndex: "分类索引",
    repository: "GitHub",
    starsSnapshot: (count, date) => `★ ${count} · ${date} 快照`,
    added: (title) => `已把 ${title} 添加到桌面。`,
    addFailed: "无法添加这个应用。",
    categories: {
      all: "全部",
      system: "系统",
      globalAi: "国际 AI",
      chinaAi: "国内 AI",
      localWebUi: "本地 WebUI",
      aiPlatforms: "AI 平台",
      automation: "自动化",
      design: "设计",
      media: "媒体",
      documents: "文档",
      monitoring: "监控",
      notes: "笔记",
      developerTools: "开发工具",
      finance: "财务"
    },
    openingModes: {
      desktopWindow: "桌面窗口",
      externalTab: "外部标签页"
    }
  },
  startBoard: {
    eyebrow: "桌面控制中心",
    title: "系统监视器",
    description: "检查 Vibe Desktop、vibed 和每个受管 WebUI 进程。",
    overview: "桌面概览",
    installed: "已安装应用",
    localWebUis: "本地 WebUI",
    running: "运行中",
    runningNow: "当前运行",
    actions: "管理操作",
    manageDesktop: "管理这个桌面",
    manageWebUis: "管理 WebUI",
    addApps: "添加应用",
    scanComputer: "扫描本机",
    applications: "应用",
    openSomething: "打开已安装应用",
    search: "搜索应用",
    searchPlaceholder: "查找应用",
    noMatches: "没有已安装应用匹配这项搜索。",
    newTab: "新标签页",
    desktopWindow: "桌面窗口",
    doubleClickExternal: "双击在浏览器新标签页打开",
    stopped: "已停止",
    daemon: "vibed",
    online: "在线",
    offline: "离线",
    refresh: "刷新",
    refreshing: "刷新中…",
    statusUpdated: "系统与进程状态已更新。",
    systemOverview: "系统概览",
    managedApps: "受管 WebUI",
    cpu: "CPU",
    memory: "内存",
    hostMemory: "主机内存",
    load: "负载（1分钟）",
    uptime: "主机运行时间",
    systemServices: "核心服务",
    unavailable: "不可用",
    daemonUnavailable: "守护进程无响应",
    managedProcesses: "受管进程",
    processes: "个进程",
    noProcesses: "还没有注册受管 WebUI 进程。",
    name: "名称",
    status: "状态",
    port: "端口",
    controls: "控制",
    healthy: "健康",
    unhealthy: "异常",
    error: "错误",
    start: "启动",
    stop: "停止",
    restart: "重启",
    open: "打开"
  },
  weather: {
    openToUpdate: "打开后更新",
    chooseCity: "选择城市",
    liveWeather: "实时天气",
    searchCity: "搜索城市来加载桌面天气小组件。",
    cityAria: "天气城市",
    cityPlaceholder: "上海",
    update: "更新",
    condition: "天气",
    humidity: "湿度",
    wind: "风力",
    updated: "更新时间",
    waiting: "等待中",
    notYet: "尚未更新",
    animationAria: (condition) => `${condition} 天气动画`,
    statusEnterCity: "输入城市后加载天气。",
    statusUpdating: "正在更新天气...",
    statusCouldNotLoad: "天气加载失败。",
    statusUpdated: (time) => `已更新 ${time}。`,
    lookupFailed: "天气城市查询失败。",
    noMatchingCity: "没有找到匹配城市。",
    forecastFailed: "天气预报获取失败。",
    incomplete: "天气数据不完整。",
    conditionLabels: {
      clear: "晴朗",
      mainlyClear: "大部晴朗",
      partlyCloudy: "局部多云",
      fog: "有雾",
      drizzle: "毛毛雨",
      freezingDrizzle: "冻毛毛雨",
      rain: "降雨",
      freezingRain: "冻雨",
      snow: "降雪",
      thunderstorm: "雷暴",
      windy: "有风"
    },
    currentSummary: (label, humidity, windSpeed) => `${label}。湿度 ${humidity}%。风速 ${Math.round(windSpeed)} km/h。`,
    widgetDetail: (label, windSpeed) => `${label} · ${Math.round(windSpeed)} km/h`
  },
  settings: {
    eyebrow: "桌面设置",
    title: "把它变成你的第一屏",
    description: "把 Vibe Desktop 设成浏览器启动时打开的页面，然后把小 WebApp 和 AI 工具作为图标添加进来，不用再翻书签。",
    saving: "正在保存...",
    saveFailed: "这个设置保存失败。",
    saved: "已保存。",
    copySuccess: "起始页链接已复制。",
    installOpening: "正在打开安装提示...",
    installAccepted: "已接受安装。Vibe Desktop 现在可以像应用一样打开。",
    installDismissed: "已取消安装。之后仍可从这个面板或浏览器菜单安装。",
    installUnavailable: "请使用浏览器菜单安装，或把 Vibe Desktop 添加到主屏幕。",
    startPageKicker: "浏览器起始页",
    startPageTitle: "直接进入你的桌面",
    startPageBody: "把这个 URL 设置为浏览器启动页或新标签页替换目标。",
    startPageInputAria: "Vibe Desktop 起始页 URL",
    startPageLoading: "正在加载起始页 URL...",
    copy: "复制",
    initialAppKicker: "启动应用",
    initialAppTitle: "选择首先打开什么",
    initialAppBody: "保持普通桌面，或自动打开一个网页应用/小组件作为主页表面。",
    chooseStartAppAria: "选择启动应用",
    desktopOnly: "只打开桌面",
    themesKicker: "主题",
    themesTitle: "匹配你的浏览器氛围",
    themesBody: "这些是协调过的主页主题，不是多个独立桌面。",
    shellKicker: "外壳风格",
    shellTitle: "一个桌面，微调外观",
    shellBody: "以后可以扩展成 Windows/macOS/GNOME 风格交互；现在只调整视觉感受。",
    desktopBrowserKicker: "桌面浏览器",
    setHomeTitle: "设为主页",
    setHomeSteps: ["打开浏览器设置。", "找到启动页、主页或新窗口设置。", "选择自定义页面，并粘贴 Vibe Desktop 起始页 URL。"],
    pwaKicker: "移动端与 PWA",
    installDeskTitle: "安装桌面",
    pwaInstalled: "Vibe Desktop 已经在应用模式中运行。",
    pwaBody: "安装为 PWA 后，手机或桌面启动器会更干净。",
    installButton: "安装 Vibe Desktop",
    installStepsButton: "查看安装步骤",
    mobileNote: "在移动端，使用浏览器分享/菜单操作，选择添加到主屏幕或安装应用。",
    smallWebappsKicker: "小 WebApp",
    smallWebappsTitle: "先使用 URL 应用",
    smallWebappsBody: "从 Dock 粘贴任意 WebApp URL。Vibe Desktop 会拉取标题和图标，优先尝试桌面窗口模式，网站禁止嵌入时再回退到外部标签页。",
    guideKicker: "新手引导",
    guideTitle: "重新播放引导",
    guideBody: "再次显示快速桌面设置引导，不会重置你的应用或壁纸。",
    guideButton: "打开引导",
    languageKicker: "语言",
    languageTitle: "界面语言",
    languageBody: "切换此浏览器中的桌面语言。你的应用数据不会变化。",
    ready: "就绪",
    nav: {
      general: "通用",
      generalHint: "桌面基础",
      startPage: "起始页",
      startPageHint: "浏览器第一屏",
      appearance: "外观",
      appearanceHint: "主题与外壳",
      apps: "应用",
      appsHint: "网页应用行为",
      language: "语言",
      languageHint: "界面语言",
      install: "安装",
      installHint: "PWA 与主页"
    }
  },
  webUi: {
    eyebrow: "WebUI 导入 Skill",
    title: "把你的本地工具拉到桌面上",
    description:
      "从当前浏览器会话扫描常见 localhost WebUI 端口，再把找到的工具添加为普通桌面图标。现在这是浏览器内桥接；之后本地 runtime 才能扫描项目并直接启动进程。",
    scan: "扫描本地 WebUI",
    addSelected: "添加选中项",
    statusChecking: "正在检查常见本地 WebUI 端口...",
    statusFound: (count) => `找到 ${count} 个本地 WebUI 应用。`,
    statusNoResponse: "没有新的本地 WebUI 端口响应。",
    statusSelectOne: "至少选择一个 WebUI 再添加。",
    statusAdding: "正在添加选中的 WebUI...",
    statusAdded: (count) => `已添加 ${count} 个 WebUI 应用到桌面。`,
    statusNothingAdded: "没有新增内容。",
    statusPasteFirst: "请先粘贴一个或多个新的 WebUI URL。",
    statusImporting: "正在导入粘贴的 WebUI URL...",
    statusImported: (count) => `已导入 ${count} 个自定义 WebUI URL。`,
    statusNoValid: "没有导入有效的新 URL。",
    added: "已添加",
    probe: {
      idle: "未检查",
      checking: "检查中",
      found: "已发现",
      missing: "无响应"
    },
    manualKicker: "手动批量",
    manualTitle: "粘贴自己的 WebUI URL",
    manualBody: "每行一个 URL，也可以用 `名称 | URL` 获得更清晰的标签。",
    manualPlaceholder: "Comfy 测试 | http://127.0.0.1:8188\nhttp://localhost:7860",
    manualButton: "导入粘贴的 URL",
    importedDescription: "导入的本地 WebUI 快捷方式。",
    candidates: {
      "stable-diffusion-webui": "Automatic1111、Forge、Gradio 等图像生成 WebUI 默认端口。",
      comfyui: "运行在本机的节点式图像工作流界面。",
      "open-webui": "常与 Ollama 搭配使用的本地 LLM 聊天界面。",
      n8n: "本地自动化工作流构建器。",
      jupyter: "本地运行的 Notebook 和数据工作区。",
      anythingllm: "本地知识库聊天工作区。",
      librechat: "自托管多模型聊天界面。",
      sillytavern: "本地角色和 agent 聊天界面。"
    }
  },
  embed: {
    checkFailed: "嵌入检查失败。",
    cannotEmbed: "这个网站不能嵌入桌面窗口。",
    checkCouldNotRun: "无法检查这个网站是否支持桌面窗口嵌入。",
    loadTimeout: "这个网站没有在桌面窗口内完成加载。",
    loadError: "这个网站在桌面窗口内加载失败。",
    checking: "正在检查这个网站是否允许桌面窗口嵌入。",
    loading: "正在桌面窗口内加载这个网站。",
    starting: "正在启动应用…",
    openExternal: "外部标签页打开",
    bridgeRequired: "请用 npm run desktop:open 启动专用浏览器以启用受保护网站内嵌。",
    saveAppFailed: "应用保存失败。"
  },
  trial: {
    eyebrow: "在线试用",
    title: "这部分需要你自己的电脑",
    localAppsBody:
      "本地 WebApp 会在运行 Vibe Desktop 的机器上真正启动和停止程序。这个在线试用完全跑在你的浏览器里，没有可管理的机器。桌面其他功能都可用，而且只属于你：你的排布只存在这个浏览器里。",
    webUiImportBody:
      "WebUI 导入会去找你本机端口上已经在跑的工具。公开网页看不到它们，所以试用版不提供这一项。把 Vibe Desktop 装到本机就能扫到。",
    getItLabel: "装到自己的电脑上"
  },
  dialogs: {
    addAppTitle: "添加应用",
    editAppTitle: "编辑应用",
    wallpaperTitle: "更换壁纸",
    close: "关闭",
    cancel: "取消",
    appPreviewDescription: "Vibe Desktop 的网页应用快捷方式。",
    websiteUrl: "网站 URL",
    readSite: "读取网站",
    name: "名称",
    description: "描述",
    iconUrl: "图标 URL",
    uploadLocalIcon: "上传本地图标",
    openMode: "打开方式",
    desktopWindow: "桌面窗口",
    externalTab: "外部标签页",
    setAsStart: "把这个应用设为桌面打开时自动启动",
    saveApp: "保存应用",
    urlFirst: "请先粘贴网站 URL。",
    resolving: "正在解析...",
    metadataFailed: "无法读取该网站。你仍然可以手动填写应用信息。",
    metadataLoaded: "网站信息已加载。",
    saveNeedsUrl: "保存前请添加 URL。",
    savingApp: "正在保存应用...",
    savingAppWithIcon: "正在保存应用和本地图标...",
    saveFailed: "请检查 URL 和名称后再保存。",
    desktopShortcut: "桌面应用快捷方式。",
    url: "URL",
    customIcon: "自定义图标",
    useIconUrl: "使用图标 URL",
    saveChanges: "保存更改",
    saving: "正在保存...",
    changesSaveFailed: "更改保存失败。",
    uploadWallpaper: "上传本地壁纸",
    wallpaperLocalOnly: "上传的壁纸在 v1 中只保存在当前浏览器。",
    untitledApp: "未命名应用"
  },
  data: {
    wallpapers: {
      "noir-dawn": "黑调黎明",
      "midnight-orbit": "午夜轨道",
      "ember-night": "余烬之夜",
      "mineral-morning": "矿物晨光",
      "quiet-orbit": "安静轨道",
      "paper-sky": "纸感天空",
      "paper-linen": "纸感亚麻"
    },
    themes: {
      mineral: {
        name: "矿物晨光",
        browserFit: "平衡默认",
        description: "柔和的桌面色彩，适合整天保持打开。"
      },
      "chrome-blue": {
        name: "Chrome 蓝",
        browserFit: "Chrome 和 Material",
        description: "蓝色焦点、浅色卡片和干净的中性色表面。"
      },
      "edge-fluent": {
        name: "Edge Fluent",
        browserFit: "Edge 和 Windows",
        description: "中性的 Fluent 表面，配合克制的微软蓝。"
      },
      "firefox-violet": {
        name: "Firefox 紫",
        browserFit: "Firefox 彩色主题",
        description: "紫色浏览器外壳配上温暖橙色能量。"
      },
      "safari-glass": {
        name: "Safari 玻璃",
        browserFit: "Safari 和 iOS PWA",
        description: "冷蓝玻璃、明亮白色表面和移动主屏的平静感。"
      },
      "arc-graphite": {
        name: "Arc 石墨",
        browserFit: "Arc 式专注浏览",
        description: "石墨面板配一个清晰的酸性色点。"
      },
      "brave-ember": {
        name: "Brave 余烬",
        browserFit: "Brave 和隐私优先浏览",
        description: "温暖余烬色，适合喜欢强浏览器身份感的人。"
      },
      "paper-ink": {
        name: "纸墨",
        browserFit: "阅读和写作",
        description: "低饱和纸感，让起始页保持安静。"
      },
      "forest-calm": {
        name: "森林静谧",
        browserFit: "自然和深绿色主题",
        description: "绿色和蓝色玻璃，让主页更少数字感。"
      },
      "terminal-lime": {
        name: "终端青柠",
        browserFit: "开发者深色环境",
        description: "紧凑的深色主页主题，适合本地工具和编程应用。"
      }
    },
    shellStyles: {
      glass: {
        name: "柔和玻璃",
        description: "圆润、半透明、安静。适合 PWA 和主页使用。"
      },
      browser: {
        name: "浏览器外壳",
        description: "更紧的圆角和更明显的工具栏表面，用来匹配桌面浏览器。"
      },
      compact: {
        name: "紧凑桌面",
        description: "更密的控件和更小的窗口，适合高频用户。"
      },
      focus: {
        name: "专注面板",
        description: "更高对比度卡片和更重阴影，适合小组件优先使用。"
      }
    },
    directory: {
      chatgpt: {
        title: "ChatGPT",
        description: "OpenAI 的通用 AI 助手。"
      },
      claude: {
        title: "Claude",
        description: "Anthropic 的 AI 助手。"
      },
      deepseek: {
        title: "DeepSeek",
        description: "适合编码与推理的 DeepSeek 聊天。"
      },
      kimi: {
        title: "Kimi",
        description: "月之暗面的长上下文助手。"
      },
      doubao: {
        title: "豆包",
        description: "字节跳动的 AI 助手。"
      },
      qwen: {
        title: "通义千问",
        description: "阿里通义千问聊天。"
      },
      yuanbao: {
        title: "腾讯元宝",
        description: "腾讯元宝 AI 助手。"
      },
      wenxin: {
        title: "文心一言",
        description: "百度文心 / ERNIE 助手。"
      }
    }
  }
};

const dictionaries: Record<Locale, I18nMessages> = {
  en,
  zh
};

export function messagesForLocale(locale: Locale): I18nMessages {
  return dictionaries[locale];
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (normalized.startsWith("zh")) {
    return "zh";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  return null;
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "zh";
  }

  const stored = normalizeLocale(window.localStorage.getItem(localeStorageKey));

  if (stored) {
    return stored;
  }

  const browserLocale = window.navigator.languages?.map(normalizeLocale).find(Boolean) ?? normalizeLocale(window.navigator.language);

  return browserLocale ?? "zh";
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localeStorageKey, locale);
}

export function intlLocale(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

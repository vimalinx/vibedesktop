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
    sidebarLabel: string;
    viewsLabel: string;
    localOnly: string;
    discover: string;
    followingFeed: string;
    searchLabel: string;
    searchPlaceholder: string;
    add: string;
    addedState: string;
    installWorkspace: string;
    installingWorkspace: string;
    installedWorkspace: string;
    healthUnknown: string;
    serviceHealthy: string;
    serviceStopped: string;
    updateWorkspace: string;
    uninstallWorkspace: string;
    uninstallConfirm: (title: string) => string;
    uninstallDone: (path: string) => string;
    installFailed: string;
    agentNeeded: string;
    installStarted: (path: string) => string;
    installDialogEyebrow: string;
    installDialogTitle: (title: string) => string;
    installDialogBody: string;
    officialInstall: string;
    officialInstallHint: string;
    officialRecommended: string;
    agentInstallHint: string;
    closeInstallOptions: string;
    agentInstall: string;
    agentDialogEyebrow: string;
    agentDialogTitle: (title: string) => string;
    agentDialogBody: string;
    agentWorkspace: string;
    copyForAgent: string;
    copiedForAgent: string;
    agentCopyFailed: string;
    agentInstructionFailed: string;
    closeAgentInstruction: string;
    manageLocal: string;
    manageLocalHint: string;
    selfHosted: string;
    websiteShortcut: string;
    defaultPort: (port: number) => string;
    statsApps: string;
    statsWebUis: string;
    statsCategories: string;
    statsTrials: string;
    tryOnline: string;
    quickOpen: string;
    quickOpenHint: string;
    followDeveloper: string;
    following: string;
    followedDeveloper: (developer: string) => string;
    unfollowedDeveloper: (developer: string) => string;
    followingUpdateTitle: string;
    followingUpdateBody: (count: number) => string;
    viewFollowing: string;
    followingEmptyTitle: string;
    followingEmptyBody: string;
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
    browseCategories: {
      all: string;
      technology: string;
      creative: string;
      daily: string;
      finance: string;
      other: string;
    };
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
    currentWallpaper: string;
    builtinWallpapers: string;
    customWallpaper: string;
    chooseLocalImage: string;
    wallpaperFileHint: string;
    wallpaperFit: string;
    wallpaperFits: Record<"cover" | "contain" | "stretch" | "center", string>;
    restoreDefaultWallpaper: string;
    wallpaperSaved: string;
    wallpaperInvalid: string;
    wallpaperTooLarge: string;
    wallpaperSaveFailed: string;
    wallpaperMissingRestored: string;
    untitledApp: string;
  };
  market: {
    title: string;
    loading: (repository: string) => string;
    retry: string;
    trust: Record<"reviewed" | "community" | "unlisted", string>;
    trustNote: Record<"reviewed" | "community" | "unlisted", string>;
    commit: string;
    requires: string;
    missing: string;
    setup: string;
    noSetup: string;
    services: string;
    primary: string;
    data: string;
    install: string;
    update: string;
    installed: string;
    installing: string;
    open: string;
    done: (name: string) => string;
    missingBlocked: string;
    failed: string;
    fromGithub: string;
    fromGithubHint: string;
    preview: string;
    browse: string;
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
    changeWallpaper: "Personalize",
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
    sidebarLabel: "Application catalog navigation",
    viewsLabel: "Catalog views",
    localOnly: "Local software center",
    discover: "Discover",
    followingFeed: "Following",
    searchLabel: "Search catalog",
    searchPlaceholder: "Search apps, developers, or technology",
    add: "Add",
    addedState: "Added",
    installWorkspace: "Install",
    installingWorkspace: "Installing…",
    installedWorkspace: "Installed",
    healthUnknown: "Service status unknown",
    serviceHealthy: "Running and healthy",
    serviceStopped: "Stopped or unhealthy — inspect Local WebApps",
    updateWorkspace: "Update",
    uninstallWorkspace: "Uninstall",
    uninstallConfirm: (title) => `Uninstall ${title}? Application data will be preserved.`,
    uninstallDone: (path) => `Uninstalled. Application data was preserved at ${path}`,
    installFailed: "Installation failed",
    agentNeeded: "Agent fallback available",
    installStarted: (path) => `Installing the full project in ${path}`,
    installDialogEyebrow: "Installation method",
    installDialogTitle: (title) => `Install ${title}`,
    installDialogBody: "Choose how to install this app. The reviewed official method is recommended; you can also hand the bounded task to a local Agent.",
    officialInstall: "Official installation",
    officialInstallHint: "Use the reviewed, pinned installation recipe",
    officialRecommended: "Recommended",
    agentInstallHint: "Copy the repository, workspace, registration, and verification task",
    closeInstallOptions: "Close installation methods",
    agentInstall: "Ask local Agent",
    agentDialogEyebrow: "Agent handoff",
    agentDialogTitle: (title) => `Install ${title} with a local Agent`,
    agentDialogBody: "Review and copy this bounded installation task. The Agent must preserve the trusted source, workspace boundary, managed registration, and health checks.",
    agentWorkspace: "Workspace",
    copyForAgent: "Copy for Agent",
    copiedForAgent: "Copied",
    agentCopyFailed: "Clipboard access was denied. Select the instruction and copy it manually.",
    agentInstructionFailed: "Could not prepare the local Agent instruction.",
    closeAgentInstruction: "Close Agent instruction",
    manageLocal: "Find locally",
    manageLocalHint: "Installed WebUIs and computer scan",
    selfHosted: "Self-hosted WebUI",
    websiteShortcut: "Web shortcut",
    defaultPort: (port) => `Default :${port}`,
    statsApps: "Catalog apps",
    statsWebUis: "Local-ready WebUIs",
    statsCategories: "Categories",
    statsTrials: "Online trials",
    tryOnline: "Try online",
    quickOpen: "Quick open",
    quickOpenHint: "Open the official online trial in a browser tab",
    followDeveloper: "Follow",
    following: "Following",
    followedDeveloper: (developer) => `Following ${developer}. Their apps now appear in your local updates feed.`,
    unfollowedDeveloper: (developer) => `Stopped following ${developer}.`,
    followingUpdateTitle: "Updates from developers you follow",
    followingUpdateBody: (count) => `${count} catalog ${count === 1 ? "app" : "apps"} are collected in your local feed.`,
    viewFollowing: "View feed",
    followingEmptyTitle: "Follow a developer to build your feed",
    followingEmptyBody: "Open Discover and follow a GitHub developer. Their catalog apps will be collected here locally.",
    openImport: "Open WebUI Import",
    emptyTitle: "No apps in this category yet",
    emptyBody: "Switch categories or add any website from the desktop dock.",
    directoryHint: "Single click follows the app’s opening preference. Double click opens the website in a browser tab.",
    categoryCount: (count) => `${count}`,
    types: {
      all: "All",
      websites: "Websites",
      githubApps: "WebUI projects"
    },
    categoryIndex: "Browse",
    browseCategories: {
      all: "All apps",
      technology: "Technology",
      creative: "Creative",
      daily: "Everyday",
      finance: "Finance",
      other: "Other"
    },
    repository: "GitHub",
    starsSnapshot: (count, date) => `${count} stars · snapshot ${date}`,
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
  dialogs: {
    addAppTitle: "Add App",
    editAppTitle: "Edit App",
    wallpaperTitle: "Personalization",
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
    wallpaperLocalOnly: "Your image stays in this browser's local storage and is never uploaded.",
    currentWallpaper: "Desktop preview",
    builtinWallpapers: "Built-in wallpapers",
    customWallpaper: "My wallpaper",
    chooseLocalImage: "Choose a local image",
    wallpaperFileHint: "JPG, PNG, WebP, or AVIF · up to 20 MB",
    wallpaperFit: "Picture fit",
    wallpaperFits: { cover: "Fill", contain: "Fit", stretch: "Stretch", center: "Center" },
    restoreDefaultWallpaper: "Restore default",
    wallpaperSaved: "Wallpaper updated.",
    wallpaperInvalid: "Choose a JPG, PNG, WebP, or AVIF image.",
    wallpaperTooLarge: "This image is larger than 20 MB.",
    wallpaperSaveFailed: "Could not save this wallpaper.",
    wallpaperMissingRestored: "The local wallpaper is no longer available. The default wallpaper was restored.",
    untitledApp: "Untitled App"
  },
  market: {
    title: "Install app",
    loading: (repository) => `Reading ${repository} from GitHub…`,
    retry: "Try again",
    trust: { reviewed: "Reviewed", community: "Community", unlisted: "Not in the market" },
    trustNote: {
      reviewed: "The Vibe Desktop maintainer reviewed this exact commit.",
      community: "Listed automatically from its own repository. Nobody has reviewed this code; install it only if you trust the author.",
      unlisted: "This repository is not listed in the Vibe Desktop market. Install it only if you trust where the link came from."
    },
    commit: "Commit",
    requires: "Needs",
    missing: "not installed",
    setup: "Runs once to install",
    noSetup: "Nothing to install first.",
    services: "Starts",
    primary: "opens",
    data: "Keeps its data in",
    install: "Install and start",
    update: "Update to this commit",
    installed: "Already installed at this commit.",
    installing: "Installing…",
    open: "Open",
    done: (name) => `${name} is installed and running.`,
    missingBlocked: "Install the missing commands first, then try again.",
    failed: "Installation failed. Nothing was left running.",
    fromGithub: "Install from GitHub",
    fromGithubHint: "A repository that ships .vibedesktop/app.json, for example owner/repo.",
    preview: "Preview",
    browse: "Browse the market"
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
    changeWallpaper: "个性化",
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
    sidebarLabel: "应用目录导航",
    viewsLabel: "目录视图",
    localOnly: "本地软件中心",
    discover: "发现",
    followingFeed: "关注动态",
    searchLabel: "搜索应用目录",
    searchPlaceholder: "搜索应用、开发者或技术",
    add: "添加",
    addedState: "已添加",
    installWorkspace: "安装",
    installingWorkspace: "正在安装…",
    installedWorkspace: "已安装",
    healthUnknown: "服务状态未知",
    serviceHealthy: "运行正常",
    serviceStopped: "已停止或异常，请在本地应用中检查",
    updateWorkspace: "更新",
    uninstallWorkspace: "卸载",
    uninstallConfirm: (title) => `确定卸载 ${title}？应用数据会保留。`,
    uninstallDone: (path) => `已卸载，应用数据保留在 ${path}`,
    installFailed: "安装失败",
    agentNeeded: "可交给 Agent 接管",
    installStarted: (path) => `正在把完整项目安装到 ${path}`,
    installDialogEyebrow: "选择安装方式",
    installDialogTitle: (title) => `安装 ${title}`,
    installDialogBody: "选择这次使用的安装方式。推荐使用经过审核的官方安装方案，也可以把受约束的安装任务交给本地 Agent。",
    officialInstall: "官方安装",
    officialInstallHint: "使用经过审核并固定版本的安装方案",
    officialRecommended: "推荐",
    agentInstallHint: "复制仓库、工作区、注册与验收任务",
    closeInstallOptions: "关闭安装方式",
    agentInstall: "让本地 Agent 安装",
    agentDialogEyebrow: "交给本地 Agent",
    agentDialogTitle: (title) => `让本地 Agent 安装 ${title}`,
    agentDialogBody: "先审阅再复制这项受约束的安装任务；Agent 必须遵守审核源码、固定工作区、受管注册与健康验收边界。",
    agentWorkspace: "工作区",
    copyForAgent: "复制给 Agent",
    copiedForAgent: "已复制",
    agentCopyFailed: "浏览器未允许访问剪贴板，请选中指令后手动复制。",
    agentInstructionFailed: "无法生成本地 Agent 安装指令。",
    closeAgentInstruction: "关闭 Agent 安装指令",
    manageLocal: "扫描本机",
    manageLocalHint: "已安装 WebUI 与电脑扫描",
    selfHosted: "可自托管 WebUI",
    websiteShortcut: "网站快捷方式",
    defaultPort: (port) => `默认 :${port}`,
    statsApps: "目录应用",
    statsWebUis: "可本地管理 WebUI",
    statsCategories: "分类",
    statsTrials: "在线试用",
    tryOnline: "在线试用",
    quickOpen: "快速打开",
    quickOpenHint: "在浏览器标签页直接打开官方在线实例",
    followDeveloper: "关注",
    following: "已关注",
    followedDeveloper: (developer) => `已关注 ${developer}，其应用会出现在本机关注动态中。`,
    unfollowedDeveloper: (developer) => `已取消关注 ${developer}。`,
    followingUpdateTitle: "你关注的开发者有应用可看",
    followingUpdateBody: (count) => `已在本机关注动态中汇集 ${count} 个目录应用。`,
    viewFollowing: "查看动态",
    followingEmptyTitle: "关注开发者后，这里会形成你的动态流",
    followingEmptyBody: "回到“发现”，在 GitHub 项目卡片上关注开发者；他们的目录应用会仅在本机汇集到这里。",
    openImport: "打开 WebUI 导入",
    emptyTitle: "这个分类还没有应用",
    emptyBody: "切换分类，或从桌面 Dock 添加任意网站。",
    directoryHint: "单击按应用设置的方式打开，双击在浏览器新标签页打开。",
    categoryCount: (count) => `${count}`,
    types: {
      all: "全部",
      websites: "网站",
      githubApps: "WebUI 项目"
    },
    categoryIndex: "应用大类",
    browseCategories: {
      all: "全部应用",
      technology: "科技",
      creative: "创作",
      daily: "日常",
      finance: "金融",
      other: "其他"
    },
    repository: "GitHub",
    starsSnapshot: (count, date) => `${count} 星 · ${date} 快照`,
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
  dialogs: {
    addAppTitle: "添加应用",
    editAppTitle: "编辑应用",
    wallpaperTitle: "个性化",
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
    wallpaperLocalOnly: "图片只保存在本机浏览器的专用存储中，不会上传。",
    currentWallpaper: "桌面预览",
    builtinWallpapers: "内置壁纸",
    customWallpaper: "我的壁纸",
    chooseLocalImage: "选择本地图片",
    wallpaperFileHint: "支持 JPG、PNG、WebP、AVIF，最大 20 MB",
    wallpaperFit: "图片适配",
    wallpaperFits: { cover: "填充", contain: "适应", stretch: "拉伸", center: "居中" },
    restoreDefaultWallpaper: "恢复默认",
    wallpaperSaved: "壁纸已更新。",
    wallpaperInvalid: "请选择 JPG、PNG、WebP 或 AVIF 图片。",
    wallpaperTooLarge: "图片大小不能超过 20 MB。",
    wallpaperSaveFailed: "无法保存这张壁纸。",
    wallpaperMissingRestored: "本地壁纸已不存在，已恢复默认壁纸。",
    untitledApp: "未命名应用"
  },
  market: {
    title: "安装应用",
    loading: (repository) => `正在从 GitHub 读取 ${repository}…`,
    retry: "重试",
    trust: { reviewed: "已审核", community: "社区", unlisted: "未上架" },
    trustNote: {
      reviewed: "Vibe Desktop 维护者审核过这个确切的提交。",
      community: "由作者仓库自动收录，没有人审核过这份代码。请只安装你信任的作者的应用。",
      unlisted: "这个仓库不在 Vibe Desktop 应用市场里。请确认链接来源可信再安装。"
    },
    commit: "提交",
    requires: "需要",
    missing: "未安装",
    setup: "安装时运行一次",
    noSetup: "无需额外安装步骤。",
    services: "启动",
    primary: "打开这个",
    data: "数据保存在",
    install: "安装并启动",
    update: "更新到这个提交",
    installed: "已经安装了这个提交。",
    installing: "正在安装…",
    open: "打开",
    done: (name) => `${name} 已安装并在运行。`,
    missingBlocked: "请先安装缺少的命令，再重试。",
    failed: "安装失败，没有留下任何在运行的进程。",
    fromGithub: "从 GitHub 安装",
    fromGithubHint: "带有 .vibedesktop/app.json 的仓库，例如 owner/repo。",
    preview: "预览",
    browse: "逛逛应用市场"
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

  let storedValue: string | null = null;
  try {
    storedValue = window.localStorage.getItem(localeStorageKey);
  } catch {
    // Storage blocked (privacy mode, site data disabled): fall back to the browser language.
  }
  const stored = normalizeLocale(storedValue);

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

  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    // Storage blocked or full; the choice still applies for this session.
  }
}

export function intlLocale(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

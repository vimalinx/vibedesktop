/* vibedesktop.online — one script for every page. Everything that comes from
   GitHub or market.json is inserted with textContent, never as HTML. */

/* Inside a desktop window (/apps?embed=1) a page drops its own header and
   hands site navigation back to the desktop around it. */
const SITE_ROUTES = new Set(["/", "/apps", "/developers"]);
if (new URLSearchParams(location.search).has("embed") && window.parent !== window) {
  document.documentElement.classList.add("is-embedded");
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.protocol === "vibedesktop:") return;
    if (url.origin === location.origin && SITE_ROUTES.has(url.pathname)) {
      event.preventDefault();
      window.parent.postMessage({ type: "vd:navigate", path: url.pathname + url.hash }, location.origin);
    } else {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

for (const button of document.querySelectorAll("[data-copy-target]")) {
  button.addEventListener("click", () => copyFrom(button));
}

async function copyFrom(button) {
  const target = document.getElementById(button.dataset.copyTarget || "");
  const text = target?.textContent?.trim();
  if (!text) return;
  const status = button.parentElement?.querySelector(".copy-status");
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "Command copied.";
    else flash(button, "Copied", label);
  } catch {
    if (status) status.textContent = "Copy unavailable. Select the command above and copy it manually.";
    else flash(button, "Select and copy manually", label);
  }
}

function flash(button, text, original) {
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1600);
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs || {})) node.setAttribute(name, value);
  for (const child of children) if (child) node.append(child);
  return node;
}

/* ----- Market (/apps) ----- */

const CATEGORY_LABELS = {
  all: "All", ai: "AI", "developer-tools": "Developer tools", productivity: "Productivity",
  media: "Media", education: "Education", data: "Data", games: "Games", other: "Other"
};

if (document.body.dataset.page === "apps") void loadMarket();

async function loadMarket() {
  const status = document.querySelector("[data-market-status]");
  const grid = document.querySelector("[data-market-grid]");
  const search = document.querySelector("[data-market-search]");
  const categories = document.querySelector("[data-market-categories]");
  let apps = [];
  try {
    const response = await fetch("/market.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    const market = await response.json();
    apps = Array.isArray(market.apps) ? market.apps : [];
  } catch {
    status.textContent = "The app list could not be loaded. Refresh to try again.";
    return;
  }
  if (apps.length === 0) {
    status.textContent = "";
    document.querySelector("[data-market-empty]").hidden = false;
    return;
  }

  let category = "all";
  const present = ["all", ...Object.keys(CATEGORY_LABELS).filter((key) => key !== "all" && apps.some((app) => app.category === key))];
  for (const key of present) {
    const chip = el("button", { className: "chip", text: CATEGORY_LABELS[key], attrs: { type: "button", "aria-pressed": String(key === category) } });
    chip.addEventListener("click", () => {
      category = key;
      for (const other of categories.children) other.setAttribute("aria-pressed", String(other === chip));
      render();
    });
    categories.append(chip);
  }
  search.addEventListener("input", render);
  render();

  function render() {
    const query = search.value.trim().toLowerCase();
    const shown = apps.filter((app) => (category === "all" || app.category === category) &&
      (!query || `${app.name} ${app.description} ${app.repository}`.toLowerCase().includes(query)));
    grid.replaceChildren(...shown.map(card));
    status.textContent = shown.length === apps.length ? `${apps.length} app${apps.length === 1 ? "" : "s"}` : `${shown.length} of ${apps.length} apps`;
  }
}

function card(app) {
  // market.json is ours, but links still go through allow-lists: no other scheme can reach an href.
  const installLink = /^vibedesktop:\/\/install\?/.test(String(app.installLink)) ? app.installLink : "#";
  const repoUrl = /^https:\/\/github\.com\//.test(String(app.url)) ? app.url : "#";
  const iconPath = /^icons\/[a-z0-9._-]+\.(svg|png|webp|jpe?g)$/.test(String(app.icon)) ? app.icon : null;
  const icon = iconPath
    ? el("img", { attrs: { src: `/${iconPath}`, alt: "", width: "52", height: "52", loading: "lazy" } })
    : el("span", { className: "app-initial", text: String(app.name || "?").slice(0, 1).toUpperCase(), attrs: { "aria-hidden": "true" } });
  const command = `vibedesktop install ${app.repository}@${app.ref}`;
  const copy = el("button", { className: "button secondary", text: "Copy command", attrs: { type: "button", title: command } });
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(command); flash(copy, "Copied", "Copy command"); }
    catch { flash(copy, "Copy failed", "Copy command"); }
  });
  const meta = [
    app.stars ? `★ ${app.stars}` : null,
    app.license,
    app.services?.map((service) => `${service.name} :${service.port}`).join(" · "),
    app.requires?.length ? `needs ${app.requires.join(", ")}` : null
  ].filter(Boolean).join("  ·  ");
  return el("article", { className: "app-card" }, [
    el("div", { className: "app-card-head" }, [
      icon,
      el("div", {}, [
        el("h2", { text: app.name }),
        el("a", { className: "app-repo", text: app.repository, attrs: { href: repoUrl, rel: "noreferrer" } })
      ]),
      el("span", { className: `trust trust-${app.trust === "reviewed" ? "reviewed" : "community"}`, text: app.trust === "reviewed" ? "Reviewed" : "Community" })
    ]),
    el("p", { className: "app-description", text: app.description || "" }),
    el("p", { className: "app-meta", text: meta }),
    el("div", { className: "app-actions" }, [
      el("a", { className: "button primary", text: "Install", attrs: { href: installLink, title: `Opens Vibe Desktop to review ${app.repository} at ${String(app.ref).slice(0, 12)}` } }),
      copy
    ])
  ]);
}

/* ----- Market check (/developers) ----- */

const checker = document.querySelector("[data-checker]");
if (checker) {
  checker.addEventListener("submit", (event) => {
    event.preventDefault();
    void runCheck(new FormData(checker).get("repository"));
  });
}

async function runCheck(input) {
  const result = document.querySelector("[data-checker-result]");
  const spec = await import("/app-manifest.mjs");
  const list = el("ul", { className: "check-list" });
  const add = (ok, text, details = []) => {
    list.append(el("li", { className: ok === null ? "is-info" : ok ? "is-ok" : "is-bad" }, [
      el("span", { className: "check-mark", text: ok === null ? "•" : ok ? "✓" : "✗", attrs: { "aria-hidden": "true" } }),
      el("span", { text }),
      details.length ? el("ul", {}, details.map((line) => el("li", { text: line }))) : null
    ]));
  };
  result.replaceChildren(el("p", { text: "Checking…" }));

  const repository = spec.parseGithubRepository(String(input || ""));
  if (!repository) {
    result.replaceChildren(el("p", { className: "is-bad", text: "Enter a GitHub repository such as owner/repo." }));
    return;
  }
  const github = (path) => fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json" } });
  try {
    const repoResponse = await github(`/repos/${repository.slug}`);
    if (repoResponse.status === 403) throw new Error("GitHub's anonymous rate limit was reached. Try again in a few minutes.");
    if (!repoResponse.ok) {
      add(false, `${repository.slug} was not found, or it is private. The market lists public repositories only.`);
      return result.replaceChildren(list);
    }
    const repo = await repoResponse.json();
    add(!repo.archived, repo.archived ? "The repository is archived; archived repositories are not listed." : `Public repository ${repo.full_name}`);
    const commitResponse = await github(`/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`);
    const commit = commitResponse.ok ? await commitResponse.json() : null;
    const ref = spec.isCommitSha(commit?.sha) ? commit.sha : null;
    if (!ref) throw new Error("The default branch commit could not be read.");
    add(null, `Default branch ${repo.default_branch} at ${ref.slice(0, 12)}`);

    const raw = await fetch(`https://raw.githubusercontent.com/${repo.full_name}/${ref}/${spec.APP_MANIFEST_PATH}`);
    if (!raw.ok) {
      add(false, `No ${spec.APP_MANIFEST_PATH} on the default branch. Start with the example above or the skill's check.py --init.`);
      return result.replaceChildren(list);
    }
    let parsed = null;
    try { parsed = JSON.parse(await raw.text()); } catch { /* reported below */ }
    const validation = parsed === null ? { ok: false, errors: ["The file is not valid JSON."] } : spec.validateAppManifest(parsed);
    if (!validation.ok) {
      add(false, `${spec.APP_MANIFEST_PATH} has ${validation.errors.length} problem(s):`, validation.errors);
      return result.replaceChildren(list);
    }
    const manifest = validation.manifest;
    add(true, `${spec.APP_MANIFEST_PATH} is valid: ${manifest.name}`, manifest.services.map((service, index) =>
      `${service.name} :${service.port}${index === 0 ? " (opens in the desktop)" : ""} — ${service.run}`));
    if (manifest.icon) {
      const icon = await fetch(`https://raw.githubusercontent.com/${repo.full_name}/${ref}/.vibedesktop/${manifest.icon}`);
      const size = icon.ok ? (await icon.arrayBuffer()).byteLength : 0;
      add(icon.ok && size <= spec.APP_ICON_MAX_BYTES, icon.ok ? (size <= spec.APP_ICON_MAX_BYTES ? "Icon found" : "The icon is larger than 256 KB") : `.vibedesktop/${manifest.icon} is missing`);
    } else add(null, "No icon yet. Add .vibedesktop/icon.svg or .png so the app stands out.");
    const topics = Array.isArray(repo.topics) ? repo.topics : [];
    const tagged = topics.includes(spec.APP_MARKET_TOPIC);
    add(tagged, tagged ? `Topic ${spec.APP_MARKET_TOPIC} is set` : `Add the topic ${spec.APP_MARKET_TOPIC} to the repository to be listed`);

    const listed = await fetch("/market.json", { cache: "no-cache" }).then((response) => response.ok ? response.json() : null).catch(() => null);
    const entry = listed?.apps?.find((app) => String(app.repository).toLowerCase() === repo.full_name.toLowerCase());
    add(entry ? true : null, entry
      ? `Listed as ${entry.trust === "reviewed" ? "Reviewed" : "Community"} at ${String(entry.ref).slice(0, 12)}`
      : tagged ? "Not listed yet. The market rebuilds every six hours." : "Not listed yet.");

    const children = [list];
    if (tagged) {
      const issue = new URL("https://github.com/vimalinx/vibedesktop/issues/new");
      issue.searchParams.set("template", "market-review.yml");
      issue.searchParams.set("title", `Review: ${repo.full_name}`);
      issue.searchParams.set("repository", repo.full_name);
      issue.searchParams.set("commit", ref);
      children.push(el("div", { className: "checker-actions" }, [
        el("a", { className: "button secondary", text: "Try the install", attrs: { href: spec.marketInstallLink(repo.full_name, ref) } }),
        el("a", { className: "button secondary", text: "Request a review", attrs: { href: issue.toString(), rel: "noreferrer" } })
      ]));
    }
    result.replaceChildren(...children);
  } catch (error) {
    add(false, error instanceof Error ? error.message : "The check failed.");
    result.replaceChildren(list);
  }
}

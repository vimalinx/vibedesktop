import { describe, expect, it } from "vitest";
import { intlLocale, messagesForLocale, normalizeLocale } from "@/lib/i18n";
import { createDefaultApps } from "@/lib/seed-data";
import { displayAppDescription, displayAppTitle } from "@/lib/desktop-helpers";

describe("i18n", () => {
  it("normalizes supported browser locale strings", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBeNull();
  });

  it("exposes localized labels for shell and runtime seed data", () => {
    const zh = messagesForLocale("zh");

    expect(intlLocale("zh")).toBe("zh-CN");
    expect(zh.builtins.settings.title).toBe("设置");
    expect(zh.builtins.webUiImport.title).toBe("WebUI 导入");
    expect(zh.data.directory.yuanbao.title).toBe("腾讯元宝");
    expect(zh.data.themes["terminal-lime"].name).toBe("终端青柠");
  });

  // The Local WebApps tile kept its English title in a Chinese desktop because
  // `builtins` had no entry for it. Asserting the whole seed rather than that one
  // key means a newly added builtin cannot ship untranslated either.
  it("localizes the title and description of every builtin seed app", () => {
    const zh = messagesForLocale("zh");
    const builtins = createDefaultApps("d", "ts").filter((app) => app.kind === "builtin");

    expect(builtins.length).toBeGreaterThan(0);
    for (const app of builtins) {
      expect(displayAppTitle(app, zh), `title for ${app.title}`).not.toBe(app.title);
      expect(displayAppDescription(app, zh), `description for ${app.title}`).not.toBe(app.description);
    }
  });

  // The dock button draws its own PlusIcon, so a "+" in the label rendered "+ + Add App".
  it("keeps glyphs the dock draws itself out of the dock label", () => {
    for (const locale of ["en", "zh"] as const) {
      expect(messagesForLocale(locale).dock.addApp).not.toMatch(/^\s*\+/);
    }
  });
});

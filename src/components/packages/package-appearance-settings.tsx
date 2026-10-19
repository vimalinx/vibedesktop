"use client";

import { useRef, useState } from "react";
import { Check, ChevronRight, Monitor, Moon, Sun, Image as ImageIcon, Layers, MousePointer2, Sparkles } from "lucide-react";
import type { JsonObject } from "@/protocol/v1/types";
import { useSystemTools } from "./system-tools-context";

export function PackageAppearanceSettings({ zh }: { zh: boolean }) {
  const tools = useSystemTools()!;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve());
  const latest = useRef(tools); latest.current = tools;
  const text = (cn: string, en: string) => zh ? cn : en;
  const native = ["windows", "macos"].includes(tools.presentation.appearance);
  const values = tools.preferences.values;
  function save(patch: JsonObject) {
    setError(""); setSaving(true);
    queue.current = queue.current.catch(() => {}).then(async () => {
      try { await latest.current.patchPreferences(patch); }
      catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }).finally(() => setSaving(false));
  }
  const toggles = [
    { key: "glass", label: text("透明效果", "Transparency effects"), description: text("让窗口与菜单柔和地透出桌面", "Let the desktop show softly through windows and menus"), icon: Layers, defaultOn: true },
    { key: "motion", label: text("动画效果", "Animation effects"), description: text("窗口展开、收起与 Dock 缩放", "Window transitions and Dock magnification"), icon: MousePointer2, defaultOn: true },
    { key: "particles", label: text("星尘特效", "Stardust"), description: text("轻盈、缓慢移动的粒子", "Light, slowly floating particles"), icon: Sparkles, defaultOn: false },
    { key: "ambient", label: text("动态壁纸光影", "Ambient wallpaper motion"), description: text("缓慢变化的桌面光影", "Slowly shifting desktop light"), icon: Sun, defaultOn: false },
  ];
  return <div className="package-appearance-settings" aria-busy={saving}>
    <section className="settings-group settings-system-picker">
      <Monitor size={22} aria-hidden="true" />
      <div><h3>{text("桌面系统", "Desktop system")}</h3><p>{tools.presentation.appearance === "windows" ? "Windows 11" : tools.presentation.appearance === "macos" ? "macOS" : text("自定义桌面", "Custom desktop")}</p></div>
      <button className="settings-disclosure" onClick={tools.managePackages}>{text("选择桌面", "Choose desktop")}<ChevronRight size={16} aria-hidden="true" /></button>
    </section>
    {native ? <>
      <section className="settings-group appearance-mode-group">
        <div><h3>{text("选择模式", "Choose your mode")}</h3><p>{text("应用于桌面、窗口与系统工具", "Applies to your desktop, windows and system tools")}</p></div>
        <div className="appearance-modes" role="group" aria-label={text("外观模式", "Appearance mode")}>
          {[false, true].map(dark => <button key={String(dark)} className={`appearance-mode ${dark ? "mode-dark" : "mode-light"}`} aria-pressed={(values.dark === true) === dark} onClick={() => save({ dark })}>
            <span className="mode-preview" aria-hidden="true"><i /><i /><i /><b /><em /></span>
            <span>{dark ? <Moon size={15} /> : <Sun size={15} />}{dark ? text("深色", "Dark") : text("浅色", "Light")}{(values.dark === true) === dark ? <Check size={14} /> : null}</span>
          </button>)}
        </div>
      </section>
      <section className="settings-group appearance-accent-group">
        <div><h3>{text("强调色", "Accent color")}</h3><p>{text("用于选中状态、按钮与开关", "Used for selections, buttons and switches")}</p></div>
        <div className="appearance-swatches" role="group" aria-label={text("强调色", "Accent color")}>
          {["#2979ed", "#a360e8", "#ef688d", "#259879", "#d77b24", "#747780"].map((color, i) => <button key={color} style={{ backgroundColor: color }} aria-label={text(["蓝色", "紫色", "粉色", "绿色", "橙色", "灰色"][i], ["Blue", "Purple", "Pink", "Green", "Orange", "Gray"][i])} aria-pressed={(values.accent || "#2979ed") === color} onClick={() => save({ accent: color })}>{(values.accent || "#2979ed") === color ? <Check size={13} /> : null}</button>)}
        </div>
      </section>
      <section className="settings-group appearance-effects-group">
        {toggles.map(({ key, label, description, icon: Icon, defaultOn }) => <div className="native-setting-row" key={key}>
          <Icon size={20} aria-hidden="true" /><div><h3>{label}</h3><p>{description}</p></div>
          <button role="switch" className="native-switch" aria-label={label} aria-checked={defaultOn ? values[key] !== false : values[key] === true} onClick={() => save({ [key]: !(defaultOn ? values[key] !== false : values[key] === true) })}><span /></button>
        </div>)}
      </section>
      <section className="settings-group appearance-size-group">
        <label><span>{text("桌面图标大小", "Desktop icon size")}</span><input type="range" min="36" max="72" value={Number(values.iconSize) || 48} onChange={event => save({ iconSize: Number(event.target.value) })} /><output>{Number(values.iconSize) || 48}</output></label>
        <label><span>{tools.presentation.appearance === "macos" ? text("Dock 大小", "Dock size") : text("任务栏图标大小", "Taskbar icon size")}</span><input type="range" min="32" max="64" value={Number(values.dockSize) || (tools.presentation.appearance === "macos" ? 48 : 32)} onChange={event => save({ dockSize: Number(event.target.value) })} /><output>{Number(values.dockSize) || (tools.presentation.appearance === "macos" ? 48 : 32)}</output></label>
      </section>
    </> : null}
    <section className="settings-group settings-system-picker">
      <ImageIcon size={22} aria-hidden="true" /><div><h3>{text("桌面背景", "Desktop background")}</h3><p>{text("选择壁纸或使用自己的图片", "Choose wallpaper or use your own image")}</p></div>
      <button className="settings-disclosure" onClick={tools.wallpaper}>{text("更换壁纸", "Change wallpaper")}<ChevronRight size={16} aria-hidden="true" /></button>
    </section>
    {error ? <p className="form-status" role="alert">{error}</p> : null}
  </div>;
}

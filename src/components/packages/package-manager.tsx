"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Download, Upload, X, Trash2, ArrowLeft, Sparkles, Monitor, Palette } from "lucide-react";
import { messagesForLocale } from "@/lib/i18n";
import { Dialog } from "@/components/dialogs/dialog";
import type { DesktopPackageBundle } from "@/protocol/shell/package";
import { builtInPackages, maxPackageBytes, validateBundle } from "@/lib/desktop-packages/bundle";
import { downloadPackage, installedPackages, loadPackage, removePackage, savePackage } from "@/lib/desktop-packages/storage";
import { desktopData } from "@/lib/desktop-data";
import { packageCompatibility } from "@/protocol/v1/package";
import "./packages.css";

export function PackageCollection({ selected, onSelect, onboarding = false }: { selected: string; onSelect: (id: string) => void; onboarding?: boolean }) {
  const [installed, setInstalled] = useState<DesktopPackageBundle[]>([]);
  const [pending, setPending] = useState<DesktopPackageBundle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { void installedPackages().then(setInstalled).catch(error => setError(String(error))); }, []);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const choose = onSelect;
  return <div className="package-manager">
      <div className="package-intro"><span className="package-eyebrow"><Palette size={14} /> DESKTOP COLLECTION</span><h2>{onboarding ? "先选一个熟悉的系统" : "桌面系统"}</h2><p>选择后立即预览。以后可在系统设置中随时切换，应用和打开的窗口会保留。</p></div>
      <div className="package-choices">
        {builtInPackages.map(pack => <article key={pack.id} className={`package-choice ${selected === pack.id ? "is-selected" : ""}`}>
          <button className={`package-preview ${pack.style}`} onClick={() => choose(pack.id)} aria-label={`使用 ${pack.name} 桌面`}><span className="preview-window"><i /><i /><i /></span><span className="preview-dock"><i /><i /><i /><i /><i /></span>{selected === pack.id ? <span className="preview-check"><Check size={15} /></span> : null}</button>
          <div className="package-choice-info"><div><strong>{pack.name}</strong><p>{pack.caption}</p></div><button aria-label={`导出 ${pack.name} 桌面包`} title="导出完整桌面包" disabled={busy} onClick={() => void run(async () => downloadPackage(await loadPackage(pack.id)))}><Download size={17} /></button></div>
        </article>)}
      </div>
      {installed.length > 0 ? <section className="package-installed"><h3>收藏与分享的桌面</h3>{installed.map(bundle => <div key={bundle.manifest.id}><Monitor size={20} /><span><strong>{bundle.manifest.name}</strong><small>{bundle.manifest.id} · {bundle.manifest.version}</small></span><button onClick={() => choose(bundle.manifest.id)}>{selected === bundle.manifest.id ? "正在使用" : "使用"}</button><button aria-label={`导出 ${bundle.manifest.name}`} onClick={() => downloadPackage(bundle)}><Download size={16} /></button><button aria-label={`移除 ${bundle.manifest.name}`} disabled={selected === bundle.manifest.id || busy} onClick={() => void run(async () => { await removePackage(bundle.manifest.id); setInstalled(await installedPackages()); })}><Trash2 size={16} /></button></div>)}</section> : null}
      <div className="package-import"><Sparkles size={22} /><div><strong>使用别人分享的系统</strong><p>导入朋友或创作者分享的 .vibepack.json，即可从上方收藏中选择。每个桌面旁的导出按钮可把完整桌面分享给别人。</p></div><button disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} /> 导入桌面包</button><input ref={fileInput} type="file" accept=".json,.vibepack.json" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void run(async () => { if (file.size > maxPackageBytes) throw new Error("桌面包不能超过 16 MiB。"); const bundle = validateBundle(JSON.parse(await file.text())); if (!packageCompatibility(bundle.manifest, await desktopData().describe()).compatible) throw new Error("当前桌面服务不支持这个包要求的协议或能力。"); setPending(bundle); }); }} /></div>
      {pending ? <div className="package-confirm" role="alert"><strong>安装「{pending.manifest.name}」？</strong><p>此包包含 JavaScript，将以当前桌面的权限运行。请确认来源可信。安装同名包会替换其代码，保留配置。</p><div><button disabled={busy} onClick={() => void run(async () => { await savePackage(pending); setInstalled(await installedPackages()); setPending(null); })}><Check size={16} /> 信任并安装</button><button onClick={() => setPending(null)}><X size={16} /> 取消</button></div></div> : null}
      {error ? <p className="package-error" role="alert">{error}</p> : null}
      {!onboarding ? <footer><button className="package-classic" onClick={() => choose("classic")}><ArrowLeft size={14} /> 经典 / 恢复桌面</button><span>设置 → 外观 → 桌面系统</span></footer> : null}
    </div>;
}

export function PackageManager({ selected, onSelect, onClose }: { selected: string; onSelect: (id: string) => void; onClose: () => void }) {
  return <Dialog title="选择你的桌面" onClose={onClose} t={messagesForLocale("zh")} className="package-manager-dialog"><PackageCollection selected={selected} onSelect={id => { onSelect(id); onClose(); }} /></Dialog>;
}

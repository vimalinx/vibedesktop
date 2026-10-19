"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, MousePointer2, PanelBottom, PanelsTopLeft, Settings2, Share2 } from "lucide-react";
import { Dialog } from "@/components/dialogs/dialog";
import { messagesForLocale } from "@/lib/i18n";
import { PackageCollection } from "./package-manager";

const lessons = [
  { title: "从桌面打开应用", icon: MousePointer2, description: "单击选中图标，双击打开应用。按住图标可拖到新的位置；右键图标，可打开、固定或编辑快捷方式。", points: ["触摸屏上轻点图标即可打开。", "右键桌面空白处，可以添加应用、更换壁纸和整理分组。", "应用自己的透明图标会保留原样。"] },
  { title: "找到应用，继续工作", icon: PanelBottom, description: "Windows 点击任务栏的开始按钮；macOS 点击 Dock 的启动台。可以直接选择应用，也可以用搜索框查找。", points: ["任务栏或 Dock 的小圆点标记已打开的应用。", "点击应用图标回到窗口；右键可以固定、取消固定或关闭窗口。", "点击任务视图查看所有窗口，再点选要继续的窗口。"] },
  { title: "用鼠标安排窗口", icon: PanelsTopLeft, description: "拖动标题栏移动窗口，拖动边缘或四角改变大小。双击标题栏可最大化或还原。", points: ["Windows 的窗口按钮位于右上角，macOS 的红、黄、绿按钮位于左上角。", "点击标题栏的窗口布局按钮，或悬停最大化按钮，可选择分屏位置。", "最小化会保留窗口内容；关闭窗口前请先保存应用里的工作。"] },
  { title: "在系统设置里调整桌面", icon: Settings2, description: "打开设置，进入外观，即可更换桌面系统、明暗模式、强调色、图标大小、透明效果和动效。", points: ["设置的布局会跟随当前系统变化。", "应用商店用于查找应用，本地应用管理器用于查看和管理本机应用。", "设置中的备份与恢复可保存桌面配置；这里也可以再次打开新手教程。"] },
  { title: "选择与分享更多系统", icon: Share2, description: "在设置 → 外观 → 桌面系统中，可以继续挑选内置系统，或使用朋友和创作者分享的桌面。", points: ["收到 .vibepack.json 后，点击导入桌面包，确认来源后安装并选择使用。", "点击桌面卡片旁的导出按钮，得到可发送给别人的完整桌面包。", "导入的桌面保存在当前浏览器；完整桌面备份也会包含这些包。"] },
];

export function DesktopOnboarding({ selected, onSelect, onDone }: { selected: string; onSelect: (id: string) => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const lesson = lessons[step - 1];
  return <Dialog title="欢迎使用 Vibe Desktop" onClose={onDone} t={messagesForLocale("zh")} className="desktop-onboarding-dialog">
    <div className="onboarding-progress" aria-label={`第 ${step + 1} 步，共 ${lessons.length + 1} 步`}>
      {Array.from({ length: lessons.length + 1 }, (_, index) => <button key={index} aria-label={`前往第 ${index + 1} 步`} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)} />)}
      <span>{step + 1} / {lessons.length + 1}</span>
    </div>
    {step === 0 ? <PackageCollection selected={selected} onSelect={onSelect} onboarding /> : <article className="onboarding-lesson">
      <lesson.icon size={40} strokeWidth={1.4} /><h2>{lesson.title}</h2><p>{lesson.description}</p>
      <ul>{lesson.points.map(point => <li key={point}><Check size={17} /><span>{point}</span></li>)}</ul>
    </article>}
    <footer className="onboarding-actions"><button onClick={step ? () => setStep(step - 1) : onDone}>{step ? <><ArrowLeft size={16} /> 上一步</> : "稍后了解"}</button><button className="onboarding-next" onClick={step === lessons.length ? onDone : () => setStep(step + 1)}>{step === lessons.length ? "开始使用" : step === 0 ? "使用这个系统，继续" : "下一步"}<ArrowRight size={16} /></button></footer>
  </Dialog>;
}

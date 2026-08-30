"use client";

import { useEffect, useState } from "react";
import styles from "./site-sample-app.module.css";

const storageKey = "vd:site-sample-memo:v1";

const copy = {
  zh: {
    eyebrow: "Vibe Desktop · 站内示例程序",
    title: "Vibe 便签",
    intro: "你已经成功从桌面打开了本站提供的示例程序。随手写一句话，内容只会保存在这个浏览器里。",
    returnTitle: "下一步由你来完成",
    returnBody: "请自己切回刚才的 Vibe Desktop 标签页，然后在引导卡片上点击「下一步」。本站不会替你自动切换标签页。",
    label: "临时便签",
    placeholder: "例如：把我的本地开发工具放进 Vibe Desktop……",
    saved: "已保存在当前浏览器",
    empty: "还没有内容",
    count: (count: number) => `${count} 个字符`,
    clear: "清空"
  },
  en: {
    eyebrow: "Vibe Desktop · Site sample app",
    title: "Vibe Memo",
    intro: "You successfully opened a sample app provided by this site. Write a quick note; it stays only in this browser.",
    returnTitle: "The next move is yours",
    returnBody: "Switch back to the Vibe Desktop tab yourself, then click Next in the guide. This site will not switch tabs for you.",
    label: "Quick memo",
    placeholder: "For example: bring my local development tools into Vibe Desktop…",
    saved: "Saved in this browser",
    empty: "Nothing written yet",
    count: (count: number) => `${count} characters`,
    clear: "Clear"
  }
};

export function SiteSampleApp({ locale }: { locale: "en" | "zh" }) {
  const t = copy[locale];
  const [note, setNote] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setNote(window.localStorage.getItem(storageKey) ?? "");
    } catch {
      setNote("");
    } finally {
      setHydrated(true);
    }
  }, []);

  function updateNote(value: string) {
    setNote(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // The memo remains usable for this tab if browser storage is unavailable.
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandMark} aria-hidden="true">V</div>
          <div>
            <p className={styles.eyebrow}>{t.eyebrow}</p>
            <h1>{t.title}</h1>
          </div>
        </header>

        <p className={styles.intro}>{t.intro}</p>

        <aside className={styles.returnCard} aria-labelledby="return-title">
          <span className={styles.tabGlyph} aria-hidden="true">
            <i />
            <i />
          </span>
          <div>
            <strong id="return-title">{t.returnTitle}</strong>
            <p>{t.returnBody}</p>
          </div>
        </aside>

        <section className={styles.memo} aria-labelledby="memo-label">
          <div className={styles.memoHeader}>
            <label id="memo-label" htmlFor="vibe-sample-note">{t.label}</label>
            <span aria-live="polite">{hydrated && note ? t.saved : t.empty}</span>
          </div>
          <textarea
            id="vibe-sample-note"
            value={note}
            onChange={(event) => updateNote(event.target.value)}
            placeholder={t.placeholder}
            maxLength={1200}
          />
          <footer className={styles.memoFooter}>
            <span>{t.count(note.length)}</span>
            <button type="button" onClick={() => updateNote("")} disabled={!note}>
              {t.clear}
            </button>
          </footer>
        </section>
      </section>
    </main>
  );
}

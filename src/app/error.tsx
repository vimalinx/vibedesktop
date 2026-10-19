"use client";

import { useEffect } from "react";

/** Route-level fallback: the desktop shell itself failed to render. */
export default function DesktopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[vibedesktop] desktop shell crashed", error);
  }, [error]);

  return (
    <main className="app-recovery" role="alert">
      <strong>桌面遇到问题 · The desktop hit a problem</strong>
      <p>
        你的应用和数据都还在。可以先重试；如果某个窗口每次打开都出错，用安全模式启动，不会恢复上次打开的窗口。
      </p>
      <p>Your apps and data are safe. Try again, or start in safe mode to skip reopening the last windows.</p>
      {error.digest ? <code>{error.digest}</code> : null}
      <div className="app-recovery-actions">
        <button type="button" className="primary-action" onClick={reset}>重试 · Try again</button>
        {/* A full page load is the point: recovery must not reuse the crashed client state. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/?safe=1">安全模式启动 · Safe mode</a>
      </div>
    </main>
  );
}

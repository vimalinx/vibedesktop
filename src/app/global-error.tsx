"use client";

/** Last-resort fallback when even the root layout fails; it must render its own document. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 480, padding: 24, textAlign: "center", lineHeight: 1.6 }}>
          <h1 style={{ fontSize: 20 }}>Vibe Desktop 暂时无法显示</h1>
          <p>你的应用和数据都还在。The desktop could not render; your apps and data are safe.</p>
          <p>
            <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 16px", marginRight: 8 }}>重试 · Try again</button>
            {/* A full page load is the point: recovery must not reuse the crashed client state. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/?safe=1">安全模式 · Safe mode</a>
          </p>
        </main>
      </body>
    </html>
  );
}

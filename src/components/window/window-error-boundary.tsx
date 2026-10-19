"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface WindowErrorBoundaryProps {
  locale: "en" | "zh";
  title: string;
  onClose: () => void;
  children: ReactNode;
}

interface WindowErrorBoundaryState {
  error: Error | null;
}

/** A crash inside one window stays inside that window; the desktop keeps running. */
export class WindowErrorBoundary extends Component<WindowErrorBoundaryProps, WindowErrorBoundaryState> {
  state: WindowErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WindowErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[vibedesktop] window "${this.props.title}" crashed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const zh = this.props.locale === "zh";
    return (
      <div className="window-crash" role="alert">
        <strong>{zh ? "这个窗口出了点问题" : "This window ran into a problem"}</strong>
        <p>
          {zh
            ? `「${this.props.title}」遇到意外错误，桌面和其他窗口不受影响。`
            : `"${this.props.title}" hit an unexpected error. The desktop and other windows are unaffected.`}
        </p>
        <code>{this.state.error.message || this.state.error.name}</code>
        <div className="window-crash-actions">
          <button type="button" className="primary-action" onClick={() => this.setState({ error: null })}>
            {zh ? "重新加载窗口" : "Reload window"}
          </button>
          <button type="button" onClick={this.props.onClose}>
            {zh ? "关闭窗口" : "Close window"}
          </button>
        </div>
      </div>
    );
  }
}

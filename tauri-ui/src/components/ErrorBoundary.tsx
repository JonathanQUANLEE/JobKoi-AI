import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-stone-950/95 p-6 text-stone-200">
          <div className="max-w-xl w-full p-6 rounded-3xl border border-red-500/40 bg-stone-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400 font-bold text-base">
              <AlertTriangle className="size-6 text-red-500" />
              <span>{this.props.fallbackTitle || "界面组件运行时异常"}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-black/60 border border-stone-800 font-mono text-xs text-red-300 break-all overflow-auto max-h-48 select-text">
              <div className="font-bold text-red-200 mb-1">
                {this.state.error?.name}: {this.state.error?.message}
              </div>
              <div className="text-stone-500 text-[11px] whitespace-pre-wrap">
                {this.state.error?.stack}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer transition-all"
              >
                <RotateCcw className="size-3.5" />
                <span>恢复并返回主控制台</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

"use client";
import { Component, type ReactNode } from "react";
type S = { error: Error | null; key: number };
export default class SceneBoundary extends Component<{ children: ReactNode }, S> {
  state: S = { error: null, key: 0 };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.warn("[world] scene error", error); }
  render() {
    if (this.state.error) return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div><p className="font-semibold">The 3D world tripped 🌀</p>
          <p className="mt-1 text-sm text-zinc-400">Your device or a bad block may have caused it.</p>
          <button className="mt-3 rounded bg-violet-600 px-4 py-2 text-sm text-white" onClick={() => this.setState((s) => ({ error: null, key: s.key + 1 }))}>Reload world</button></div>
      </div>);
    return <div key={this.state.key} className="h-full w-full">{this.props.children}</div>;
  }
}

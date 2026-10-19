import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import GithubAuthGate from "./components/auth/GithubAuthGate";
import StarUnlockModal from "./components/auth/StarUnlockModal";
import { getStoredGithubUser, type GithubUser } from "./lib/githubAuth";
// storageSanitizer 由 main.tsx 首行 import（模块级自执行），保证在
// Zustand/React 初始化前完成 localStorage 版本隔离，这里不重复调用。

export default function App() {
  const [githubUser, setGithubUser] = useState<GithubUser | null>(() => getStoredGithubUser());
  const [isStarUnlocked, setIsStarUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem("jobkoi_star_unlocked") === "true";
    } catch {
      return false;
    }
  });

  return (
    <ErrorBoundary fallbackTitle="应用核心运行异常">
      {!githubUser ? (
        <GithubAuthGate onLoginSuccess={setGithubUser} />
      ) : !isStarUnlocked ? (
        <StarUnlockModal
          user={githubUser}
          onUnlocked={() => setIsStarUnlocked(true)}
          onLogout={() => setGithubUser(null)}
        />
      ) : (
        <Dashboard githubUser={githubUser} onLogout={() => setGithubUser(null)} />
      )}
    </ErrorBoundary>
  );
}

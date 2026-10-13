import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import GithubAuthGate from "./components/auth/GithubAuthGate";
import StarUnlockModal from "./components/auth/StarUnlockModal";
import { getStoredGithubUser, type GithubUser } from "./lib/githubAuth";

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

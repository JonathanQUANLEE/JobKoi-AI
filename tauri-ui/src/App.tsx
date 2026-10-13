import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import GithubAuthGate from "./components/auth/GithubAuthGate";
import { getStoredGithubUser, type GithubUser } from "./lib/githubAuth";

export default function App() {
  const [githubUser, setGithubUser] = useState<GithubUser | null>(() => getStoredGithubUser());

  return (
    <ErrorBoundary fallbackTitle="应用核心运行异常">
      {!githubUser ? (
        <GithubAuthGate onLoginSuccess={setGithubUser} />
      ) : (
        <Dashboard githubUser={githubUser} onLogout={() => setGithubUser(null)} />
      )}
    </ErrorBoundary>
  );
}

import Dashboard from "./pages/Dashboard";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="应用核心运行异常">
      <Dashboard />
    </ErrorBoundary>
  );
}

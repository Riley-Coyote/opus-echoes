import { MnemosProvider } from "./state/MnemosProvider";
import { ViewProvider } from "./state/ViewProvider";
import { Shell } from "./components/Shell";

export function App() {
  return (
    <MnemosProvider>
      <ViewProvider>
        <a className="skip-link" href="#stage">
          skip to the thread
        </a>
        <Shell />
        <div className="grain" aria-hidden="true" />
      </ViewProvider>
    </MnemosProvider>
  );
}

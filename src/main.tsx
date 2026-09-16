import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";
import "./styles/index.css";

// Auth cookies are bound to the host name, so "localhost" and "127.0.0.1" keep
// separate sessions and opening the other host looks like a random sign-out.
if (import.meta.env.DEV && window.location.hostname === "localhost") {
  const canonical = new URL(window.location.href);
  canonical.hostname = "127.0.0.1";
  window.location.replace(canonical.toString());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { XRayApp } from "./XRayApp.js";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found");
createRoot(root).render(
  <StrictMode>
    <XRayApp />
  </StrictMode>
);

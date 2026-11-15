import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Catalog } from "./Catalog.tsx";
import "@fontsource-variable/inter";
import "../../styles.css";
import "../tokens.css";
import "../ui.css";
import "./catalog.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Catalog />
  </StrictMode>,
);

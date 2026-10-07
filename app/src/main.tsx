import React from "react";
import ReactDOM from "react-dom/client";
import { SolanaProvider } from "./SolanaProvider";
import App from "./App";
import { Buffer } from "buffer";
window.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SolanaProvider>
      <App />
    </SolanaProvider>
  </React.StrictMode>
);

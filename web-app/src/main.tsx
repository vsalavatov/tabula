import React from "react";
import ReactDOM from "react-dom/client";
import {createKotlinBridge} from "./bridge/kotlinBridge";
import {App} from "./App";

async function bootstrap() {
  const bridge = await createKotlinBridge();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App bridge={bridge} />
    </React.StrictMode>,
  );
}

void bootstrap();

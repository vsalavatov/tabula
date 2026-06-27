import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

const baseByMode: Record<string, string> = {
  "local-dev": "/",
  "github-pages": "/tabula/",
};

export default defineConfig(({mode}) => ({
  base: baseByMode[mode] ?? "/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
}));

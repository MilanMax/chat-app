import { execSync } from "child_process";

console.log("📦 Installing client dependencies...");
execSync("cd client && npm install", { stdio: "inherit" });

console.log("🏗️ Building client with Vite...");
execSync("cd client && node ./node_modules/vite/bin/vite.js build", {
  stdio: "inherit"
});

console.log("✅ Client build complete!");

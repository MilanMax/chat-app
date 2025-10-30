import { existsSync, rmSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

const outputArg = process.argv[2] ?? "chat-app.zip";
const outputPath = resolve(process.cwd(), outputArg);

if (existsSync(outputPath)) {
  console.log(`Removing existing archive at ${outputPath}`);
  rmSync(outputPath);
}

console.log(`Creating project archive at ${outputPath}`);
const result = spawnSync(
  "git",
  ["archive", "--format=zip", `--output=${outputPath}`, "HEAD"],
  {
    stdio: "inherit"
  }
);

if (result.status !== 0) {
  console.error("git archive command failed");
  process.exit(result.status ?? 1);
}

console.log("Archive created successfully.");
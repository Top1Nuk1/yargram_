import { spawnSync } from "node:child_process";

// `install` is both an npm lifecycle event and a convenient project command.
// During `npm install`, dependencies are already being installed, so do not
// recursively invoke npm. `npm run install` enters the branch below instead.
if (process.env.YARGRAM_INSTALLING === "1" || process.env.npm_command === "install") {
  console.log("Yargram workspace dependencies are installed by npm.");
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["install", "--workspaces", "--include-workspace-root"],
  {
    stdio: "inherit",
    env: { ...process.env, YARGRAM_INSTALLING: "1" },
  },
);

if (result.error) {
  console.error(`Could not start npm: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, [path.join(root, "dist", "index.js")], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => {
  stdout += d.toString();
});
child.stderr.on("data", (d) => {
  stderr += d.toString();
});

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "probe", version: "1.0" },
  },
};

setTimeout(() => {
  child.stdin.write(JSON.stringify(init) + "\n");
}, 200);

setTimeout(() => {
  const list = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  };
  child.stdin.write(JSON.stringify(list) + "\n");
}, 600);

setTimeout(() => {
  child.kill();
  console.log("STDERR:", stderr.trim());
  console.log("STDOUT:", stdout.trim());
  const ok =
    stdout.includes('"id":1') &&
    stdout.includes("jio_login") &&
    !stdout.includes("injected env");
  console.log("OK:", ok);
  process.exit(ok ? 0 : 1);
}, 1500);

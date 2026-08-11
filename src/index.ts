#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, log } from "./config.js";
import { registerTools } from "./tools/register.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Still start the server so tools can return helpful config errors
    log(String(err));
    config = {
      id: process.env.JIOAICLOUD_ID || "",
      mobile: process.env.JIOAICLOUD_MOBILE || "",
      passphrase: process.env.JIOAICLOUD_PASSPHRASE || "",
      otp: process.env.JIOAICLOUD_OTP || undefined,
      sessionDir: process.env.JIOAICLOUD_SESSION_DIR || ".session",
      downloadDir: process.env.JIOAICLOUD_DOWNLOAD_DIR || "downloads",
      projectRoot: process.cwd(),
    };
  }

  const server = new McpServer({
    name: "jioaicloud",
    version: "1.0.0",
  });

  registerTools(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("JioAICloud MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

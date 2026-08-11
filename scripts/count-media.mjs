import { loadConfig } from "../dist/config.js";
import { sendOtp, verifyOtpAndLogin, login } from "../dist/auth/login.js";
import { JioClient } from "../dist/api/client.js";
import { listByMimeCategory, collectAll, normalizeFile } from "../dist/api/files.js";

const mode = process.argv[2] || "status";
const otp = process.argv[3];

const config = loadConfig();
console.error("mobile=", config.mobile);

if (mode === "send") {
  const r = await sendOtp(config);
  console.log(JSON.stringify(r, null, 2));
} else if (mode === "verify") {
  if (!otp) throw new Error("Usage: node scripts/count-media.mjs verify <otp>");
  const session = await verifyOtpAndLogin(config, otp);
  console.error("logged in userId=", session.userId);
  await printCounts(config);
} else if (mode === "count") {
  await login(config);
  await printCounts(config);
} else {
  console.log(JSON.stringify({ mobile: config.mobile, hint: "send | verify <otp> | count" }, null, 2));
}

async function printCounts(config) {
  const client = new JioClient(config);
  const result = {};
  for (const category of ["photos", "videos"]) {
    const objects = await collectAll(
      (nextLink) => listByMimeCategory(client, category, { nextLink, limit: 200 }),
      100
    );
    const files = objects.map(normalizeFile).filter((f) => f.id);
    const bytes = files.reduce((s, f) => s + (f.size || 0), 0);
    result[category] = {
      count: files.length,
      bytes,
      mb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
    };
  }
  console.log(JSON.stringify(result, null, 2));
}

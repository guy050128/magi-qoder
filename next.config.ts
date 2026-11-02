import path from "node:path";
import type { NextConfig } from "next";

const basePath = process.env.MAGI_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Without this, Next walks up and finds a package.json in the home dir, making
  // the standalone bundle nest under Downloads/magi-qoder/.
  outputFileTracingRoot: path.join(process.cwd()),
  // standalone output for the ECS deployment (systemd + nginx on shared port 443)
  output: "standalone",
  env: { NEXT_PUBLIC_MAGI_BASE_PATH: basePath },
  // Build-time only: local `npm run dev` stays at /, the server build is /maji.
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;

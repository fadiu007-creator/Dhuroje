import type { NextConfig } from "next";

// GitHub Pages hosts this project under /Dhuroje.
// Cloudflare Pages serves the export from the domain root, so set
// CLOUDFLARE_PAGES=1 in Cloudflare Pages build environment variables.
const isCloudflarePages = process.env.CLOUDFLARE_PAGES === "1";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(isCloudflarePages ? {} : { basePath: "/Dhuroje" }),
};

export default nextConfig;

import type { NextConfig } from "next";

// GitHub Pages hosts this project under /Dhuroje.
// Cloudflare Pages sets CF_PAGES=1 automatically; CLOUDFLARE_PAGES=1
// remains supported for manually configured builds.
const isCloudflarePages =
  process.env.CF_PAGES === "1" || process.env.CLOUDFLARE_PAGES === "1";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_DHUROJE_BASE_PATH: isCloudflarePages ? "" : "/Dhuroje",
  },
  ...(isCloudflarePages ? {} : { basePath: "/Dhuroje" }),
};

export default nextConfig;

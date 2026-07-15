import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/cells-images/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/profile-avatars/**",
      },
    ],
    // Uploaded images and avatars each get a unique random filename (see
    // nanoid() in cells.ts/profiles.ts) and are never overwritten in place,
    // so a cached optimized copy is valid forever — safe to cache far longer
    // than the 4-hour default, cutting repeat-view re-transforms/cache
    // writes way down.
    minimumCacheTTL: 2678400, // 31 days
    // resizeImage.ts caps every upload (cell photos and avatars alike) at
    // 1200px on the long edge before it ever reaches storage, so Next has no
    // source material to justify the default sizes above that — those would
    // just be wasted transforms upscaling toward a size that doesn't exist.
    deviceSizes: [640, 750, 828, 1080, 1200],
    // Single format explicitly, rather than relying on being unset — avoids
    // doubling transforms if a future Next.js default ever adds avif back in.
    formats: ["image/webp"],
  },
};

export default nextConfig;

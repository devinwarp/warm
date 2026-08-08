import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // demo-sites/*.html is read from disk at request time by /demo/[slug]. The
  // path is built from a param, so tracing can't see it — without this entry
  // the files are left out of the bundle and the route 500s in production only.
  outputFileTracingIncludes: {
    "/demo/[slug]": ["./demo-sites/**"],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // @leads/db ships raw TypeScript source, so let Next transpile it.
  transpilePackages: ["@leads/db"],
  reactStrictMode: true,
  webpack: (config) => {
    // @leads/db uses ESM-style ".js" import specifiers that point at .ts files.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;

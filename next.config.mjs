/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@node-rs/argon2"],
    serverActions: {
      bodySizeLimit: "5mb"
    }
  },
  images: {
    remotePatterns: []
  }
};

export default nextConfig;

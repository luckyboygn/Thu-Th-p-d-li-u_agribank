/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite', '@aws-sdk/client-s3'],
};

export default nextConfig;

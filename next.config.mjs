const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
const buildTimestamp = `${pad(vn.getDate())}/${pad(vn.getMonth() + 1)}/${vn.getFullYear()} ${pad(vn.getHours())}:${pad(vn.getMinutes())}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite', '@aws-sdk/client-s3'],
  env: {
    NEXT_PUBLIC_APP_BUILD_TIME: buildTimestamp,
  },
};

export default nextConfig;

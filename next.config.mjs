import { execSync } from 'child_process';

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const vn = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
const buildTimestamp = `${pad(vn.getDate())}/${pad(vn.getMonth() + 1)}/${vn.getFullYear()} ${pad(vn.getHours())}:${pad(vn.getMinutes())}`;

let gitCommit = '';
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  gitCommit = '';
}

const buildLabel = gitCommit ? `${buildTimestamp} (${gitCommit})` : buildTimestamp;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite', '@aws-sdk/client-s3'],
  env: {
    NEXT_PUBLIC_APP_BUILD_TIME: buildLabel,
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
  },
};

export default nextConfig;

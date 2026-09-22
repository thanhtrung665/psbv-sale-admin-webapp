/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['html-pdf-node', 'inline-css', 'batch', 'emitter', 'pdf2pic', 'tesseract.js'],
  },
};

export default nextConfig;

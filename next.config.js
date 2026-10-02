/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "maps.googleapis.com" },
    ],
  },
  // The local AI stack (Transformers.js → onnxruntime-node) ships native
  // binaries — keep them out of the bundler and require() them at runtime.
  // jimp does canvas/image decoding that must also load at runtime.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp", "jimp"],
};

module.exports = nextConfig;

import { Queue } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

// One queue per step
export const scriptQueue = new Queue("script-generation", { connection });
export const voiceoverQueue = new Queue("voiceover-generation", { connection });
export const scenesQueue = new Queue("scenes-generation", { connection });
export const sceneImageQueue = new Queue("scene-image-generation", { connection });
export const renderQueue = new Queue("video-render", { connection });

export { connection };
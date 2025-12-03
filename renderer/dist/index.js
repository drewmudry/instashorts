"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const redis_1 = require("@instashorts/redis");
const db_1 = require("@instashorts/db");
const db_2 = require("@instashorts/db");
const drizzle_orm_1 = require("drizzle-orm");
const storage_1 = require("@instashorts/storage");
const nanoid_1 = require("nanoid");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
// ===========================
// Step 5: Video Rendering
// ===========================
new bullmq_1.Worker("video-render", async (job) => {
    const { videoId } = job.data;
    console.log(`[Renderer] Processing video ${videoId}`);
    // Update status to RENDERING
    await db_1.db
        .update(db_2.video)
        .set({ status: "RENDERING" })
        .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
    // Fetch video with all data
    const [videoRecord] = await db_1.db
        .select()
        .from(db_2.video)
        .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId))
        .limit(1);
    if (!videoRecord) {
        throw new Error(`Video ${videoId} not found`);
    }
    if (!videoRecord.voiceOverUrl) {
        throw new Error(`Voiceover not found for video ${videoId}`);
    }
    if (!videoRecord.captions_processed) {
        throw new Error(`Captions not found for video ${videoId}`);
    }
    // Fetch all scenes
    const scenes = await db_1.db
        .select()
        .from(db_2.scene)
        .where((0, drizzle_orm_1.eq)(db_2.scene.videoId, videoId))
        .orderBy((0, drizzle_orm_1.asc)(db_2.scene.sceneIndex));
    if (scenes.length === 0) {
        throw new Error(`No scenes found for video ${videoId}`);
    }
    const scenesWithImages = scenes.filter((s) => s.imageUrl);
    if (scenesWithImages.length !== scenes.length) {
        throw new Error(`Not all scenes have images for video ${videoId}`);
    }
    // Prepare render data
    const captionsData = videoRecord.captions_processed;
    const scenesForRender = scenesWithImages.map((s) => ({
        id: s.id,
        sceneIndex: s.sceneIndex,
        imageUrl: s.imageUrl,
    }));
    const outputPath = (0, path_1.join)((0, os_1.tmpdir)(), `${videoId}-${(0, nanoid_1.nanoid)()}.mp4`);
    try {
        // Dynamic import for Remotion
        console.log(`[Renderer] Starting render for video ${videoId}...`);
        console.log(`[Renderer] Audio URL: ${videoRecord.voiceOverUrl}`);
        console.log(`[Renderer] Scenes count: ${scenesForRender.length}`);
        console.log(`[Renderer] Words count: ${captionsData.words.length}`);
        console.log(`[Renderer] Caption color: ${videoRecord.captionHighlightColor || '#FFD700'}`);
        console.log(`[Renderer] Caption position: ${videoRecord.captionPosition || 'bottom'}`);
        console.log(`[Renderer] Output path: ${outputPath}`);
        const { renderVideo } = await Promise.resolve().then(() => __importStar(require("./remotion/render")));
        await renderVideo({
            scenes: scenesForRender,
            audioUrl: videoRecord.voiceOverUrl,
            words: captionsData.words,
            outputPath,
            captionHighlightColor: videoRecord.captionHighlightColor || '#FFD700',
            captionPosition: videoRecord.captionPosition || 'bottom',
        });
        console.log(`[Renderer] Video rendered successfully to ${outputPath}`);
        // Update status to UPLOADING_FINAL_VIDEO
        await db_1.db
            .update(db_2.video)
            .set({ status: "UPLOADING_FINAL_VIDEO" })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        // Read and upload to GCS
        const videoBuffer = (0, fs_1.readFileSync)(outputPath);
        console.log(`[Renderer] Video file size: ${videoBuffer.length} bytes`);
        const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
        const destination = `videos/${videoId}/${(0, nanoid_1.nanoid)()}.mp4`;
        const videoUrl = await (0, storage_1.uploadBufferToGCS)(bucketName, videoBuffer, destination, "video/mp4");
        console.log(`[Renderer] Video uploaded to: ${videoUrl}`);
        // Update video
        await db_1.db
            .update(db_2.video)
            .set({
            videoUrl,
            status: "COMPLETED",
            completedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        // Cleanup
        try {
            (0, fs_1.unlinkSync)(outputPath);
            console.log(`[Renderer] Cleaned up temporary file: ${outputPath}`);
        }
        catch (error) {
            console.error(`[Renderer] Failed to delete temporary file ${outputPath}:`, error);
        }
        console.log(`[Renderer] Video ${videoId} completed successfully: ${videoUrl}`);
        return { videoUrl };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[Renderer] Error rendering video ${videoId}:`, error);
        if (errorStack) {
            console.error(`[Renderer] Error stack:`, errorStack);
        }
        // Mark as failed
        await db_1.db
            .update(db_2.video)
            .set({ status: "FAILED" })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        // Cleanup
        try {
            (0, fs_1.unlinkSync)(outputPath);
            console.log(`[Renderer] Cleaned up failed render file: ${outputPath}`);
        }
        catch { }
        throw new Error(`Failed to render video ${videoId}: ${errorMessage}`);
    }
}, {
    connection: redis_1.connection,
    concurrency: 2, // Limit concurrent renders (resource intensive)
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 }
    }
});
console.log("🎬 Renderer started and listening to render queue...");

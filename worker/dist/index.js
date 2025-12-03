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
const ai_1 = require("@instashorts/ai");
const ai_2 = require("@instashorts/ai");
const ai_3 = require("@instashorts/ai");
const storage_1 = require("@instashorts/storage");
const nanoid_1 = require("nanoid");
// ===========================
// Step 1: Script Generation
// ===========================
new bullmq_1.Worker("script-generation", async (job) => {
    const { videoId, theme } = job.data;
    console.log(`[Script Worker] Processing video ${videoId}`);
    try {
        // Status remains PENDING during script generation
        // Generate script and title
        const [script, title] = await Promise.all([
            ai_1.OpenRouter.generateVideoScript(theme),
            ai_1.OpenRouter.generateVideoTitle(theme),
        ]);
        // Update video
        await db_1.db
            .update(db_2.video)
            .set({ script, title })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        console.log(`[Script Worker] Script generated for video ${videoId}`);
        // Get art style from video record
        const [videoRecord] = await db_1.db
            .select()
            .from(db_2.video)
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId))
            .limit(1);
        // Enqueue next steps in parallel
        await Promise.all([
            redis_1.voiceoverQueue.add("generate", { videoId, script }),
            redis_1.scenesQueue.add("generate", { videoId, script, theme, artStyle: videoRecord?.artStyle }),
        ]);
        return { script, title };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Script Worker] Error processing video ${videoId}:`, error);
        // Mark video as failed if this is the last attempt
        if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
            await db_1.db
                .update(db_2.video)
                .set({ status: "FAILED" })
                .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
            console.error(`[Script Worker] Video ${videoId} marked as FAILED after all retries`);
        }
        throw new Error(`Failed to generate script for video ${videoId}: ${errorMessage}`);
    }
}, {
    connection: redis_1.connection,
    concurrency: 5,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
    }
});
// ===========================
// Step 2: Voiceover Generation
// ===========================
new bullmq_1.Worker("voiceover-generation", async (job) => {
    const { videoId, script, style } = job.data;
    // Handle AI video jobs (Sync-First strategy)
    if (job.name === "generate-ai-video-voiceover") {
        console.log(`[AI Video Voiceover Worker] Processing video ${videoId}`);
        try {
            // Update status to GENERATING_VOICEOVER
            await db_1.db
                .update(db_2.aivideo)
                .set({ status: "GENERATING_VOICEOVER" })
                .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId));
            if (!script) {
                throw new Error(`Script not found for video ${videoId}`);
            }
            // Generate voiceover with timestamps
            const { audio: audioBuffer, alignment, normalizedAlignment } = await (0, ai_2.generateVoiceoverWithTimestamps)(script);
            // Convert to word timestamps
            const words = (0, ai_2.convertCharactersToWords)(alignment);
            // Upload audio to GCS
            const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
            const destination = `ai-videos/${videoId}/voiceover/${(0, nanoid_1.nanoid)()}.mp3`;
            const voiceOverUrl = await (0, storage_1.uploadBufferToGCS)(bucketName, audioBuffer, destination, "audio/mpeg");
            // Update aivideo record with voiceover URL and word timings
            await db_1.db
                .update(db_2.aivideo)
                .set({
                voiceOverUrl,
                wordTimings: words,
            })
                .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId));
            console.log(`[AI Video Voiceover Worker] Voiceover generated for video ${videoId}`);
            // Trigger scene generation (next step in Sync-First strategy)
            await redis_1.scenesQueue.add("generate-ai-video-scenes", {
                videoId,
                script,
                style: style || "Hypothetical Chain Reaction",
            });
            return { voiceOverUrl, wordCount: words.length };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[AI Video Voiceover Worker] Error processing video ${videoId}:`, error);
            // Mark video as failed if this is the last attempt
            if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                await db_1.db
                    .update(db_2.aivideo)
                    .set({ status: "FAILED" })
                    .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId));
                console.error(`[AI Video Voiceover Worker] Video ${videoId} marked as FAILED after all retries`);
            }
            throw new Error(`Failed to generate voiceover for video ${videoId}: ${errorMessage}`);
        }
    }
    // Handle regular video jobs
    console.log(`[Voiceover Worker] Processing video ${videoId}`);
    try {
        // Update status to GENERATING_VOICEOVER
        await db_1.db
            .update(db_2.video)
            .set({ status: "GENERATING_VOICEOVER" })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        if (!script) {
            throw new Error(`Script not found for video ${videoId}`);
        }
        // Get voiceId from series if available
        const [videoRecord] = await db_1.db
            .select()
            .from(db_2.video)
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId))
            .limit(1);
        let voiceId = "21m00Tcm4TlvDq8ikWAM"; // Default
        if (videoRecord?.seriesId) {
            const [seriesRecord] = await db_1.db
                .select()
                .from(db_2.series)
                .where((0, drizzle_orm_1.eq)(db_2.series.id, videoRecord.seriesId))
                .limit(1);
            if (seriesRecord?.voiceId) {
                voiceId = seriesRecord.voiceId;
            }
        }
        // Generate voiceover with timestamps
        const { audio: audioBuffer, alignment, normalizedAlignment } = await (0, ai_2.generateVoiceoverWithTimestamps)(script, voiceId);
        // Process alignment
        let words = (0, ai_2.convertCharactersToWords)(alignment);
        // Add emojis if enabled
        if (videoRecord?.emojiCaptions) {
            const { OpenRouter } = await Promise.resolve().then(() => __importStar(require("@instashorts/ai")));
            words = await OpenRouter.addEmojisToWords(words, script, videoRecord.theme);
        }
        const srtContent = (0, ai_2.convertWordsToSRT)(words);
        // Upload to GCS
        const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
        const destination = `voiceovers/${videoId}/${(0, nanoid_1.nanoid)()}.mp3`;
        const voiceOverUrl = await (0, storage_1.uploadBufferToGCS)(bucketName, audioBuffer, destination, "audio/mpeg");
        // Update video
        await db_1.db
            .update(db_2.video)
            .set({
            voiceOverUrl,
            captions_raw: { alignment, normalizedAlignment },
            captions_processed: { words, srt: srtContent },
        })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        console.log(`[Voiceover Worker] Voiceover generated for video ${videoId}`);
        // Check if ready to render
        await checkAndRenderVideo(videoId);
        return { voiceOverUrl };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[Voiceover Worker] Error processing video ${videoId}:`, error);
        if (errorStack) {
            console.error(`[Voiceover Worker] Error stack:`, errorStack);
        }
        // Mark video as failed if this is the last attempt
        if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
            await db_1.db
                .update(db_2.video)
                .set({ status: "FAILED" })
                .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
            console.error(`[Voiceover Worker] Video ${videoId} marked as FAILED after all retries`);
        }
        throw new Error(`Failed to generate voiceover for video ${videoId}: ${errorMessage}`);
    }
}, {
    connection: redis_1.connection,
    concurrency: 3,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
    }
});
// ===========================
// Step 3: Scenes Generation
// ===========================
new bullmq_1.Worker("scenes-generation", async (job) => {
    const { videoId, script, theme, artStyle, style } = job.data;
    // Handle AI video jobs (Sync-First strategy)
    if (job.name === "generate-ai-video-scenes") {
        console.log(`[AI Video Scenes Worker] Processing video ${videoId}`);
        try {
            // Update status to GENERATING_SCENES
            await db_1.db
                .update(db_2.aivideo)
                .set({ status: "GENERATING_SCENES" })
                .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId));
            // Fetch the video record to get word timings
            const [videoRecord] = await db_1.db
                .select()
                .from(db_2.aivideo)
                .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId))
                .limit(1);
            if (!videoRecord) {
                throw new Error(`Video ${videoId} not found`);
            }
            if (!videoRecord.wordTimings) {
                throw new Error(`Word timings not found for video ${videoId}`);
            }
            if (!script) {
                throw new Error(`Script not found for video ${videoId}`);
            }
            // Convert wordTimings from JSONB to array
            const wordTimings = videoRecord.wordTimings;
            // Generate scenes using the Sync-First strategy
            const scenes = await ai_1.OpenRouter.generateScenesFromTimestamps(script, wordTimings, style || "Hypothetical Chain Reaction");
            // Save scenes to database
            await db_1.db
                .update(db_2.aivideo)
                .set({
                scenes: scenes,
            })
                .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId));
            console.log(`[AI Video Scenes Worker] Generated ${scenes.length} scenes for video ${videoId}`);
            // TODO: Trigger image generation for each scene
            // For now, we'll just mark it as ready for the next step
            // You can add scene image generation jobs here similar to the regular video flow
            return { sceneCount: scenes.length };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[AI Video Scenes Worker] Error processing video ${videoId}:`, error);
            // Mark video as failed if this is the last attempt
            if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                await db_1.db
                    .update(db_2.aivideo)
                    .set({ status: "FAILED" })
                    .where((0, drizzle_orm_1.eq)(db_2.aivideo.id, videoId));
                console.error(`[AI Video Scenes Worker] Video ${videoId} marked as FAILED after all retries`);
            }
            throw new Error(`Failed to generate scenes for video ${videoId}: ${errorMessage}`);
        }
    }
    // Handle regular video jobs
    console.log(`[Scenes Worker] Processing video ${videoId}`);
    try {
        // Update status to GENERATING_SCENES
        await db_1.db
            .update(db_2.video)
            .set({ status: "GENERATING_SCENES" })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        if (!script) {
            throw new Error(`Script not found for video ${videoId}`);
        }
        // Determine scene count
        const wordCount = script.split(/\s+/).length;
        // Dynamic scene count: ~1 scene per 15 words, minimum 3 scenes
        const sceneCount = Math.max(3, Math.ceil(wordCount / 15));
        // Generate scenes
        const scenes = await ai_1.OpenRouter.generateVideoScenes(script, theme, sceneCount, artStyle);
        // Store scenes
        const sceneRecords = scenes.map((s) => ({
            id: (0, nanoid_1.nanoid)(),
            videoId,
            sceneIndex: s.sceneIndex,
            imagePrompt: s.image_prompt,
        }));
        await db_1.db.insert(db_2.scene).values(sceneRecords);
        console.log(`[Scenes Worker] Generated ${scenes.length} scenes for video ${videoId}`);
        // Enqueue image generation for each scene
        const imageJobs = sceneRecords.map((sceneRecord) => redis_1.sceneImageQueue.add("generate", {
            videoId,
            sceneId: sceneRecord.id,
            imagePrompt: sceneRecord.imagePrompt,
        }));
        await Promise.all(imageJobs);
        return { sceneCount: scenes.length };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Scenes Worker] Error processing video ${videoId}:`, error);
        // Mark video as failed if this is the last attempt
        if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
            await db_1.db
                .update(db_2.video)
                .set({ status: "FAILED" })
                .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
            console.error(`[Scenes Worker] Video ${videoId} marked as FAILED after all retries`);
        }
        throw new Error(`Failed to generate scenes for video ${videoId}: ${errorMessage}`);
    }
}, {
    connection: redis_1.connection,
    concurrency: 5,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
    }
});
// ===========================
// Step 4: Scene Image Generation
// ===========================
new bullmq_1.Worker("scene-image-generation", async (job) => {
    const { videoId, sceneId, imagePrompt } = job.data;
    console.log(`[Image Worker] Processing scene ${sceneId} for video ${videoId}`);
    try {
        // Update status to GENERATING_IMAGES (only if not already in a later stage)
        await db_1.db
            .update(db_2.video)
            .set({ status: "GENERATING_IMAGES" })
            .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
        if (!imagePrompt) {
            throw new Error(`Image prompt not found for scene ${sceneId}`);
        }
        // Generate image
        const imageBuffer = await (0, ai_3.generateImage)(imagePrompt);
        // Upload to GCS
        const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
        const destination = `scenes/${videoId}/${sceneId}.png`;
        const imageUrl = await (0, storage_1.uploadBufferToGCS)(bucketName, imageBuffer, destination, "image/png");
        // Update scene
        await db_1.db
            .update(db_2.scene)
            .set({ imageUrl })
            .where((0, drizzle_orm_1.eq)(db_2.scene.id, sceneId));
        console.log(`[Image Worker] Image generated for scene ${sceneId}`);
        // Check if ready to render
        await checkAndRenderVideo(videoId);
        return { imageUrl };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Image Worker] Error processing scene ${sceneId} for video ${videoId}:`, error);
        // Mark video as failed if this is the last attempt
        // Note: We only mark the video as failed if ALL image generation jobs fail
        // For individual scene failures, we could track per-scene, but for now we'll
        // let the video stay in GENERATING_IMAGES state if some scenes fail
        // The render step will catch missing images and fail appropriately
        if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
            console.error(`[Image Worker] Scene ${sceneId} failed after all retries for video ${videoId}`);
            // Don't mark entire video as failed for a single scene failure
            // The render step will handle missing images
        }
        throw new Error(`Failed to generate image for scene ${sceneId}: ${errorMessage}`);
    }
}, {
    connection: redis_1.connection,
    concurrency: 10,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
    }
});
// ===========================
// Helper: Check if ready to render
// ===========================
async function checkAndRenderVideo(videoId) {
    console.log(`[Check Render] Checking if video ${videoId} is ready to render...`);
    const [videoRecord] = await db_1.db
        .select()
        .from(db_2.video)
        .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId))
        .limit(1);
    if (!videoRecord?.voiceOverUrl) {
        console.log(`[Check Render] Video ${videoId} - No voiceover URL`);
        return;
    }
    if (!videoRecord.captions_processed) {
        console.log(`[Check Render] Video ${videoId} - No captions processed`);
        return;
    }
    const allScenes = await db_1.db
        .select()
        .from(db_2.scene)
        .where((0, drizzle_orm_1.eq)(db_2.scene.videoId, videoId));
    if (allScenes.length === 0) {
        console.log(`[Check Render] Video ${videoId} - No scenes found`);
        return;
    }
    const scenesWithImages = allScenes.filter(s => s.imageUrl !== null);
    console.log(`[Check Render] Video ${videoId} - Scenes: ${scenesWithImages.length}/${allScenes.length} have images`);
    if (scenesWithImages.length !== allScenes.length) {
        console.log(`[Check Render] Video ${videoId} - Not all scenes have images yet`);
        return;
    }
    // All ready! Enqueue render
    console.log(`[Check Render] Video ${videoId} - All requirements met! Queueing render...`);
    // Update status to QUEUED_FOR_RENDERING
    await db_1.db
        .update(db_2.video)
        .set({ status: "QUEUED_FOR_RENDERING" })
        .where((0, drizzle_orm_1.eq)(db_2.video.id, videoId));
    await redis_1.renderQueue.add("render", { videoId });
    console.log(`[Check Render] Video ${videoId} - Render job added to queue`);
}
console.log("🚀 Worker started and listening to queues...");

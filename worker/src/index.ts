import { Worker, Job } from "bullmq";
import { connection, scriptQueue, voiceoverQueue, scenesQueue, sceneImageQueue, renderQueue } from "@/queues/client";
import { db } from "@/db";
import { video, scene, series, aivideo } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateVideoScript, generateVideoTitle, generateVideoScenes, generateScenesFromTimestamps } from "@/lib/ai/openrouter";
import { generateVoiceoverWithTimestamps, convertCharactersToWords, convertWordsToSRT } from "@/lib/ai/elevenlabs";
import { generateImage } from "@/lib/ai/replicate";
import { uploadBufferToGCS } from "@/lib/gcs";
import { nanoid } from "nanoid";

// ===========================
// Step 1: Script Generation
// ===========================
new Worker(
    "script-generation",
    async (job: Job) => {
        const { videoId, theme } = job.data;

        console.log(`[Script Worker] Processing video ${videoId}`);

        try {
            // Status remains PENDING during script generation

            // Generate script and title
            const [script, title] = await Promise.all([
                generateVideoScript(theme),
                generateVideoTitle(theme),
            ]);

            // Update video
            await db
                .update(video)
                .set({ script, title })
                .where(eq(video.id, videoId));

            console.log(`[Script Worker] Script generated for video ${videoId}`);

            // Get art style from video record
            const [videoRecord] = await db
                .select()
                .from(video)
                .where(eq(video.id, videoId))
                .limit(1);

            // Enqueue next steps in parallel
            await Promise.all([
                voiceoverQueue.add("generate", { videoId, script }),
                scenesQueue.add("generate", { videoId, script, theme, artStyle: videoRecord?.artStyle }),
            ]);

            return { script, title };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Script Worker] Error processing video ${videoId}:`, error);

            // Mark video as failed if this is the last attempt
            if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                await db
                    .update(video)
                    .set({ status: "FAILED" })
                    .where(eq(video.id, videoId));
                console.error(`[Script Worker] Video ${videoId} marked as FAILED after all retries`);
            }

            throw new Error(`Failed to generate script for video ${videoId}: ${errorMessage}`);
        }
    },
    {
        connection,
        concurrency: 5,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        }
    } as any
);

// ===========================
// Step 2: Voiceover Generation
// ===========================
new Worker(
    "voiceover-generation",
    async (job: Job) => {
        const { videoId, script, style } = job.data;

        // Handle AI video jobs (Sync-First strategy)
        if (job.name === "generate-ai-video-voiceover") {
            console.log(`[AI Video Voiceover Worker] Processing video ${videoId}`);

            try {
                // Update status to GENERATING_VOICEOVER
                await db
                    .update(aivideo)
                    .set({ status: "GENERATING_VOICEOVER" })
                    .where(eq(aivideo.id, videoId));

                if (!script) {
                    throw new Error(`Script not found for video ${videoId}`);
                }

                // Generate voiceover with timestamps
                const { audio: audioBuffer, alignment, normalizedAlignment } =
                    await generateVoiceoverWithTimestamps(script);

                // Convert to word timestamps
                const words = convertCharactersToWords(alignment);

                // Upload audio to GCS
                const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
                const destination = `ai-videos/${videoId}/voiceover/${nanoid()}.mp3`;
                const voiceOverUrl = await uploadBufferToGCS(
                    bucketName,
                    audioBuffer,
                    destination,
                    "audio/mpeg"
                );

                // Update aivideo record with voiceover URL and word timings
                await db
                    .update(aivideo)
                    .set({
                        voiceOverUrl,
                        wordTimings: words,
                    })
                    .where(eq(aivideo.id, videoId));

                console.log(`[AI Video Voiceover Worker] Voiceover generated for video ${videoId}`);

                // Trigger scene generation (next step in Sync-First strategy)
                await scenesQueue.add("generate-ai-video-scenes", {
                    videoId,
                    script,
                    style: style || "Hypothetical Chain Reaction",
                });

                return { voiceOverUrl, wordCount: words.length };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[AI Video Voiceover Worker] Error processing video ${videoId}:`, error);

                // Mark video as failed if this is the last attempt
                if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                    await db
                        .update(aivideo)
                        .set({ status: "FAILED" })
                        .where(eq(aivideo.id, videoId));
                    console.error(`[AI Video Voiceover Worker] Video ${videoId} marked as FAILED after all retries`);
                }

                throw new Error(`Failed to generate voiceover for video ${videoId}: ${errorMessage}`);
            }
        }

        // Handle regular video jobs
        console.log(`[Voiceover Worker] Processing video ${videoId}`);

        try {
            // Update status to GENERATING_VOICEOVER
            await db
                .update(video)
                .set({ status: "GENERATING_VOICEOVER" })
                .where(eq(video.id, videoId));

            if (!script) {
                throw new Error(`Script not found for video ${videoId}`);
            }

            // Get voiceId from series if available
            const [videoRecord] = await db
                .select()
                .from(video)
                .where(eq(video.id, videoId))
                .limit(1);

            let voiceId = "21m00Tcm4TlvDq8ikWAM"; // Default
            if (videoRecord?.seriesId) {
                const [seriesRecord] = await db
                    .select()
                    .from(series)
                    .where(eq(series.id, videoRecord.seriesId))
                    .limit(1);

                if (seriesRecord?.voiceId) {
                    voiceId = seriesRecord.voiceId;
                }
            }

            // Generate voiceover with timestamps
            const { audio: audioBuffer, alignment, normalizedAlignment } =
                await generateVoiceoverWithTimestamps(script, voiceId);

            // Process alignment
            let words = convertCharactersToWords(alignment);

            // Add emojis if enabled
            if (videoRecord?.emojiCaptions) {
                const { addEmojisToWords } = await import("@/lib/ai/openrouter");
                words = await addEmojisToWords(words, script, videoRecord.theme);
            }

            const srtContent = convertWordsToSRT(words);

            // Upload to GCS
            const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
            const destination = `voiceovers/${videoId}/${nanoid()}.mp3`;
            const voiceOverUrl = await uploadBufferToGCS(
                bucketName,
                audioBuffer,
                destination,
                "audio/mpeg"
            );

            // Update video
            await db
                .update(video)
                .set({
                    voiceOverUrl,
                    captions_raw: { alignment, normalizedAlignment },
                    captions_processed: { words, srt: srtContent },
                })
                .where(eq(video.id, videoId));

            console.log(`[Voiceover Worker] Voiceover generated for video ${videoId}`);

            // Check if ready to render
            await checkAndRenderVideo(videoId);

            return { voiceOverUrl };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error(`[Voiceover Worker] Error processing video ${videoId}:`, error);
            if (errorStack) {
                console.error(`[Voiceover Worker] Error stack:`, errorStack);
            }

            // Mark video as failed if this is the last attempt
            if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                await db
                    .update(video)
                    .set({ status: "FAILED" })
                    .where(eq(video.id, videoId));
                console.error(`[Voiceover Worker] Video ${videoId} marked as FAILED after all retries`);
            }

            throw new Error(`Failed to generate voiceover for video ${videoId}: ${errorMessage}`);
        }
    },
    {
        connection,
        concurrency: 3,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        }
    } as any
);

// ===========================
// Step 3: Scenes Generation
// ===========================
new Worker(
    "scenes-generation",
    async (job: Job) => {
        const { videoId, script, theme, artStyle, style } = job.data;

        // Handle AI video jobs (Sync-First strategy)
        if (job.name === "generate-ai-video-scenes") {
            console.log(`[AI Video Scenes Worker] Processing video ${videoId}`);

            try {
                // Update status to GENERATING_SCENES
                await db
                    .update(aivideo)
                    .set({ status: "GENERATING_SCENES" })
                    .where(eq(aivideo.id, videoId));

                // Fetch the video record to get word timings
                const [videoRecord] = await db
                    .select()
                    .from(aivideo)
                    .where(eq(aivideo.id, videoId))
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
                const wordTimings = videoRecord.wordTimings as Array<{ word: string; start: number; end: number }>;

                // Generate scenes using the Sync-First strategy
                const scenes = await generateScenesFromTimestamps(
                    script,
                    wordTimings,
                    style || "Hypothetical Chain Reaction"
                );

                // Save scenes to database
                await db
                    .update(aivideo)
                    .set({
                        scenes: scenes,
                    })
                    .where(eq(aivideo.id, videoId));

                console.log(`[AI Video Scenes Worker] Generated ${scenes.length} scenes for video ${videoId}`);

                // TODO: Trigger image generation for each scene
                // For now, we'll just mark it as ready for the next step
                // You can add scene image generation jobs here similar to the regular video flow

                return { sceneCount: scenes.length };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[AI Video Scenes Worker] Error processing video ${videoId}:`, error);

                // Mark video as failed if this is the last attempt
                if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                    await db
                        .update(aivideo)
                        .set({ status: "FAILED" })
                        .where(eq(aivideo.id, videoId));
                    console.error(`[AI Video Scenes Worker] Video ${videoId} marked as FAILED after all retries`);
                }

                throw new Error(`Failed to generate scenes for video ${videoId}: ${errorMessage}`);
            }
        }

        // Handle regular video jobs
        console.log(`[Scenes Worker] Processing video ${videoId}`);

        try {
            // Update status to GENERATING_SCENES
            await db
                .update(video)
                .set({ status: "GENERATING_SCENES" })
                .where(eq(video.id, videoId));

            if (!script) {
                throw new Error(`Script not found for video ${videoId}`);
            }

            // Determine scene count
            const wordCount = script.split(/\s+/).length;
            // Dynamic scene count: ~1 scene per 15 words, minimum 3 scenes
            const sceneCount = Math.max(3, Math.ceil(wordCount / 15));

            // Generate scenes
            const scenes = await generateVideoScenes(script, theme, sceneCount, artStyle);

            // Store scenes
            const sceneRecords = scenes.map((s) => ({
                id: nanoid(),
                videoId,
                sceneIndex: s.sceneIndex,
                imagePrompt: s.image_prompt,
            }));

            await db.insert(scene).values(sceneRecords);

            console.log(`[Scenes Worker] Generated ${scenes.length} scenes for video ${videoId}`);

            // Enqueue image generation for each scene
            const imageJobs = sceneRecords.map((sceneRecord) =>
                sceneImageQueue.add("generate", {
                    videoId,
                    sceneId: sceneRecord.id,
                    imagePrompt: sceneRecord.imagePrompt,
                })
            );

            await Promise.all(imageJobs);

            return { sceneCount: scenes.length };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Scenes Worker] Error processing video ${videoId}:`, error);

            // Mark video as failed if this is the last attempt
            if (job.attemptsMade >= (job.opts?.attempts || 3) - 1) {
                await db
                    .update(video)
                    .set({ status: "FAILED" })
                    .where(eq(video.id, videoId));
                console.error(`[Scenes Worker] Video ${videoId} marked as FAILED after all retries`);
            }

            throw new Error(`Failed to generate scenes for video ${videoId}: ${errorMessage}`);
        }
    },
    {
        connection,
        concurrency: 5,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        }
    } as any
);

// ===========================
// Step 4: Scene Image Generation
// ===========================
new Worker(
    "scene-image-generation",
    async (job: Job) => {
        const { videoId, sceneId, imagePrompt } = job.data;

        console.log(`[Image Worker] Processing scene ${sceneId} for video ${videoId}`);

        try {
            // Update status to GENERATING_IMAGES (only if not already in a later stage)
            await db
                .update(video)
                .set({ status: "GENERATING_IMAGES" })
                .where(eq(video.id, videoId));

            if (!imagePrompt) {
                throw new Error(`Image prompt not found for scene ${sceneId}`);
            }

            // Generate image
            const imageBuffer = await generateImage(imagePrompt);

            // Upload to GCS
            const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
            const destination = `scenes/${videoId}/${sceneId}.png`;
            const imageUrl = await uploadBufferToGCS(
                bucketName,
                imageBuffer,
                destination,
                "image/png"
            );

            // Update scene
            await db
                .update(scene)
                .set({ imageUrl })
                .where(eq(scene.id, sceneId));

            console.log(`[Image Worker] Image generated for scene ${sceneId}`);

            // Check if ready to render
            await checkAndRenderVideo(videoId);

            return { imageUrl };
        } catch (error) {
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
    },
    {
        connection,
        concurrency: 10,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        }
    } as any
);

// ===========================
// Helper: Check if ready to render
// ===========================
async function checkAndRenderVideo(videoId: string) {
    console.log(`[Check Render] Checking if video ${videoId} is ready to render...`);

    const [videoRecord] = await db
        .select()
        .from(video)
        .where(eq(video.id, videoId))
        .limit(1);

    if (!videoRecord?.voiceOverUrl) {
        console.log(`[Check Render] Video ${videoId} - No voiceover URL`);
        return;
    }

    if (!videoRecord.captions_processed) {
        console.log(`[Check Render] Video ${videoId} - No captions processed`);
        return;
    }

    const allScenes = await db
        .select()
        .from(scene)
        .where(eq(scene.videoId, videoId));

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
    await db
        .update(video)
        .set({ status: "QUEUED_FOR_RENDERING" })
        .where(eq(video.id, videoId));

    await renderQueue.add("render", { videoId });
    console.log(`[Check Render] Video ${videoId} - Render job added to queue`);
}

console.log("🚀 Worker started and listening to queues...");

import { Worker, Job } from "bullmq";
import { connection } from "@instashorts/redis";
import { db } from "@instashorts/db";
import { video, scene } from "@instashorts/db";
import { eq, asc } from "drizzle-orm";
import { uploadBufferToGCS } from "@instashorts/storage";
import { nanoid } from "nanoid";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ===========================
// Step 5: Video Rendering
// ===========================
new Worker(
    "video-render",
    async (job: Job) => {
        const { videoId } = job.data;

        console.log(`[Renderer] Processing video ${videoId}`);

        // Update status to RENDERING
        await db
            .update(video)
            .set({ status: "RENDERING" })
            .where(eq(video.id, videoId));

        // Fetch video with all data
        const [videoRecord] = await db
            .select()
            .from(video)
            .where(eq(video.id, videoId))
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
        const scenes = await db
            .select()
            .from(scene)
            .where(eq(scene.videoId, videoId))
            .orderBy(asc(scene.sceneIndex)) as Array<{
                id: string;
                sceneIndex: number;
                imageUrl: string | null;
                imagePrompt: string | null;
                videoId: string;
                createdAt: Date;
                updatedAt: Date;
            }>;

        if (scenes.length === 0) {
            throw new Error(`No scenes found for video ${videoId}`);
        }

        const scenesWithImages = scenes.filter((s) => s.imageUrl);
        if (scenesWithImages.length !== scenes.length) {
            throw new Error(`Not all scenes have images for video ${videoId}`);
        }

        // Prepare render data
        const captionsData = videoRecord.captions_processed as {
            words: Array<{ word: string; start: number; end: number }>;
            srt: string;
        };

        const scenesForRender = scenesWithImages.map((s) => ({
            id: s.id,
            sceneIndex: s.sceneIndex,
            imageUrl: s.imageUrl!,
        }));

        const outputPath = join(tmpdir(), `${videoId}-${nanoid()}.mp4`);

        try {
            // Dynamic import for Remotion
            console.log(`[Renderer] Starting render for video ${videoId}...`);
            console.log(`[Renderer] Audio URL: ${videoRecord.voiceOverUrl}`);
            console.log(`[Renderer] Scenes count: ${scenesForRender.length}`);
            console.log(`[Renderer] Words count: ${captionsData.words.length}`);
            console.log(`[Renderer] Caption color: ${videoRecord.captionHighlightColor || '#FFD700'}`);
            console.log(`[Renderer] Caption position: ${videoRecord.captionPosition || 'bottom'}`);
            console.log(`[Renderer] Output path: ${outputPath}`);

            const { renderVideo } = await import("@/remotion/render");
            await renderVideo({
                scenes: scenesForRender,
                audioUrl: videoRecord.voiceOverUrl,
                words: captionsData.words,
                outputPath,
                captionHighlightColor: videoRecord.captionHighlightColor || '#FFD700',
                captionPosition: (videoRecord.captionPosition as "top" | "middle" | "bottom") || 'bottom',
            });

            console.log(`[Renderer] Video rendered successfully to ${outputPath}`);

            // Update status to UPLOADING_FINAL_VIDEO
            await db
                .update(video)
                .set({ status: "UPLOADING_FINAL_VIDEO" })
                .where(eq(video.id, videoId));

            // Read and upload to GCS
            const videoBuffer = readFileSync(outputPath);
            console.log(`[Renderer] Video file size: ${videoBuffer.length} bytes`);

            const bucketName = process.env.GCS_BUCKET_NAME || "instashorts-content";
            const destination = `videos/${videoId}/${nanoid()}.mp4`;
            const videoUrl = await uploadBufferToGCS(
                bucketName,
                videoBuffer,
                destination,
                "video/mp4"
            );

            console.log(`[Renderer] Video uploaded to: ${videoUrl}`);

            // Update video
            await db
                .update(video)
                .set({
                    videoUrl,
                    status: "COMPLETED",
                    completedAt: new Date(),
                })
                .where(eq(video.id, videoId));

            // Cleanup
            try {
                unlinkSync(outputPath);
                console.log(`[Renderer] Cleaned up temporary file: ${outputPath}`);
            } catch (error) {
                console.error(`[Renderer] Failed to delete temporary file ${outputPath}:`, error);
            }

            console.log(`[Renderer] Video ${videoId} completed successfully: ${videoUrl}`);

            return { videoUrl };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            console.error(`[Renderer] Error rendering video ${videoId}:`, error);
            if (errorStack) {
                console.error(`[Renderer] Error stack:`, errorStack);
            }

            // Mark as failed
            await db
                .update(video)
                .set({ status: "FAILED" })
                .where(eq(video.id, videoId));

            // Cleanup
            try {
                unlinkSync(outputPath);
                console.log(`[Renderer] Cleaned up failed render file: ${outputPath}`);
            } catch { }

            throw new Error(`Failed to render video ${videoId}: ${errorMessage}`);
        }
    },
    {
        connection,
        concurrency: 2, // Limit concurrent renders (resource intensive)
        defaultJobOptions: {
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 }
        }
    } as any
);

console.log("🎬 Renderer started and listening to render queue...");

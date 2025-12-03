import Replicate from "replicate";
import "dotenv/config";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY,
});

export const REPLICATE_MODELS = {
    FLUX_SCHNELL: "black-forest-labs/flux-schnell",
    FLUX_PRO: "black-forest-labs/flux-1.1-pro",
    NANO_BANANA: "google/nano-banana-pro", // Note: This model name from user request might be hypothetical or specific, using as is
    IMAGEN_FAST: "google/imagen-4-fast", // Note: Also hypothetical/specific
    SEEDREAM: "bytedance/seedream-4", // Note: Also hypothetical/specific
} as const;

export type ReplicateModel = typeof REPLICATE_MODELS[keyof typeof REPLICATE_MODELS] | string;

interface GenerateImageOptions {
    model?: ReplicateModel;
    aspectRatio?: string;
    promptUpsampling?: boolean;
    goFast?: boolean;
    megapixels?: string;
    outputFormat?: string;
}

/**
 * Generates an image using Replicate and returns the Buffer
 */
export async function generateImage(prompt: string, options: GenerateImageOptions = {}): Promise<Buffer> {
    const model = options.model || REPLICATE_MODELS.FLUX_SCHNELL;

    console.log(`Generating image with Replicate model ${model} for prompt:`, prompt);

    // Build input based on model specific requirements
    let input: any = {
        prompt: prompt,
    };

    // Add model-specific parameters
    if (model === REPLICATE_MODELS.FLUX_SCHNELL) {
        input.aspect_ratio = options.aspectRatio || "9:16";
        input.output_format = options.outputFormat || "png";
        input.go_fast = options.goFast !== undefined ? options.goFast : true;
        input.megapixels = options.megapixels || "1";
    } else if (model === REPLICATE_MODELS.FLUX_PRO) {
        input.prompt_upsampling = options.promptUpsampling !== undefined ? options.promptUpsampling : true;
        // Flux Pro might handle aspect ratio differently or not at all in some versions, 
        // but usually it's supported.
        if (options.aspectRatio) input.aspect_ratio = options.aspectRatio;
    } else {
        // Generic/Other models usually support aspect_ratio
        if (options.aspectRatio) input.aspect_ratio = options.aspectRatio;
        if (options.outputFormat) input.output_format = options.outputFormat;
    }

    try {
        const output = await replicate.run(model as any, { input });

        let imageUrl: string | null = null;
        let imageBuffer: Buffer | null = null;

        // Handle different output formats
        if (Array.isArray(output) && output.length > 0) {
            const firstItem = output[0];
            if (typeof firstItem === 'string') {
                imageUrl = firstItem;
            } else if (firstItem instanceof ReadableStream || (firstItem && typeof firstItem.getReader === 'function')) {
                // Handle stream
                const reader = firstItem.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                imageBuffer = Buffer.concat(chunks);
            }
        } else if (typeof output === 'string') {
            imageUrl = output;
        } else if (output instanceof ReadableStream || (output && typeof (output as any).getReader === 'function')) {
            // Handle direct stream output
            const reader = (output as any).getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            imageBuffer = Buffer.concat(chunks);
        }

        if (imageBuffer) {
            return imageBuffer;
        }

        if (imageUrl) {
            console.log("Replicate generated image URL:", imageUrl);
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image from Replicate URL: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        console.error("Unexpected Replicate output format:", output);
        throw new Error("Unexpected output format from Replicate");
    } catch (error) {
        console.error("Replicate generation error:", error);
        throw error;
    }
}

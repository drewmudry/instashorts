// Removed server-only import for BullMQ worker compatibility
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';

interface RenderVideoOptions {
	scenes: Array<{
		id: string;
		sceneIndex: number;
		imageUrl: string;
	}>;
	audioUrl: string;
	words: Array<{
		word: string;
		start: number;
		end: number;
	}>;
	outputPath: string;
	captionHighlightColor?: string;
	captionPosition?: "top" | "middle" | "bottom";
}

/**
 * Renders a video using Remotion
 */
export async function renderVideo({
	scenes,
	audioUrl,
	words,
	outputPath,
	captionHighlightColor,
	captionPosition,
}: RenderVideoOptions): Promise<string> {
	// Get the entry point
	const entryPoint = path.resolve(process.cwd(), 'src/remotion/index.tsx');

	// Bundle the Remotion project
	console.log('Bundling Remotion project...');
	const bundleLocation = await bundle({
		entryPoint,
		webpackOverride: (config) => {
			// Configure webpack for Next.js compatibility
			config.resolve = config.resolve || {};
			config.resolve.alias = {
				...config.resolve.alias,
				'@': path.resolve(process.cwd(), 'src'),
			};
			return config;
		},
	});

	// Get audio duration to calculate video duration
	const audioDuration = await getAudioDuration(audioUrl, words);
	const fps = 30;
	const durationInFrames = Math.ceil(audioDuration * fps);

	// Select the composition
	const composition = await selectComposition({
		serveUrl: bundleLocation,
		id: 'VideoComposition',
		inputProps: {
			scenes,
			audioUrl,
			words,
			captionHighlightColor,
			captionPosition,
		},
	});

	// Override duration based on audio
	composition.durationInFrames = durationInFrames;
	composition.fps = fps;

	// Render the video
	console.log('Rendering video...');
	await renderMedia({
		composition,
		serveUrl: bundleLocation,
		codec: 'h264',
		outputLocation: outputPath,
		timeoutInMilliseconds: 300000, // 5 minutes
		concurrency: 1,
	});

	console.log('Video rendered successfully:', outputPath);
	return outputPath;
}

/**
 * Gets the duration of an audio file in seconds
 * Uses the words array to get the exact duration
 */
async function getAudioDuration(
	audioUrl: string,
	words: Array<{ word: string; start: number; end: number }>
): Promise<number> {
	// If we have words, use the last word's end time
	if (words.length > 0) {
		const lastWord = words[words.length - 1];
		return lastWord.end + 0.5; // Add a small buffer
	}

	// Fallback: try to estimate from file size
	try {
		const response = await fetch(audioUrl);
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Estimate from file size (128kbps MP3)
		const estimatedDuration = buffer.length / (128 * 1000 / 8);
		return estimatedDuration;
	} catch (error) {
		console.error('Error getting audio duration:', error);
		// Fallback: estimate 30 seconds
		return 30;
	}
}


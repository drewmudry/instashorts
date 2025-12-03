import React from 'react';
import {
	AbsoluteFill,
	Audio,
	Img,
	Sequence,
	useCurrentFrame,
	useVideoConfig,
	interpolate,
	Easing,
} from 'remotion';

interface WordTimestamp {
	word: string;
	start: number;
	end: number;
	emoji?: string;
}

interface Scene {
	id: string;
	sceneIndex: number;
	imageUrl: string;
}

interface VideoCompositionProps {
	scenes: Scene[];
	audioUrl: string;
	words: WordTimestamp[];
	captionHighlightColor?: string;
	captionPosition?: "top" | "middle" | "bottom";
}

// Caption component with page-based sliding window
// Shows 5 words per page, all visible at once, highlighting the currently spoken word
const Caption: React.FC<{
	words: WordTimestamp[];
	highlightColor?: string;
	position?: "top" | "middle" | "bottom";
}> = ({ words, highlightColor = "#FFD700", position = "bottom" }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const currentTime = frame / fps;

	if (words.length === 0) return null;

	// Don't show captions if we're before the first word or after the last word
	if (currentTime < words[0].start - 0.3 || currentTime > words[words.length - 1].end + 0.5) {
		return null;
	}

	const WORDS_PER_PAGE = 5;

	// Find which word is currently being spoken
	const getCurrentSpokenWordIndex = () => {
		for (let i = 0; i < words.length; i++) {
			if (currentTime >= words[i].start && currentTime <= words[i].end) {
				return i;
			}
		}

		// If no word is currently being spoken, find the most recent word that finished
		for (let i = words.length - 1; i >= 0; i--) {
			if (currentTime > words[i].end) {
				return i;
			}
		}

		return -1;
	};

	const currentSpokenWordIndex = getCurrentSpokenWordIndex();

	// Determine which page we're on based on the currently spoken word
	// Each page shows WORDS_PER_PAGE words (e.g., 0-4, 5-9, 10-14, etc.)
	const getCurrentPage = () => {
		if (currentSpokenWordIndex === -1) {
			return 0;
		}
		return Math.floor(currentSpokenWordIndex / WORDS_PER_PAGE);
	};

	const currentPage = getCurrentPage();
	const pageStartIndex = currentPage * WORDS_PER_PAGE;
	const pageEndIndex = Math.min(pageStartIndex + WORDS_PER_PAGE, words.length);
	const wordsToShow = words.slice(pageStartIndex, pageEndIndex);

	if (wordsToShow.length === 0) return null;

	// Calculate animation based on page transitions
	const firstWordStart = wordsToShow[0].start;
	const lastWordEnd = wordsToShow[wordsToShow.length - 1].end;
	const floatInDuration = 0.15;
	const floatOutDuration = 0.15;

	let translateY = 0;
	let opacity = 1;
	let scale = 1;

	// Determine if we're in the animation period for this page
	const isBeforePageStart = currentTime < firstWordStart - 0.1;
	const isAfterPageEnd = currentTime > lastWordEnd + 0.1;
	const isInFloatIn = currentTime >= firstWordStart - 0.1 && currentTime < firstWordStart + floatInDuration;
	const isInFloatOut = currentTime > lastWordEnd - floatOutDuration && currentTime <= lastWordEnd + 0.1;

	if (isBeforePageStart) {
		// Before this page starts
		opacity = 0;
	} else if (isAfterPageEnd) {
		// After this page ends
		opacity = 0;
	} else if (isInFloatIn) {
		// Float in animation
		const progress = (currentTime - (firstWordStart - 0.1)) / floatInDuration;
		translateY = interpolate(progress, [0, 1], [20, 0], {
			easing: Easing.out(Easing.ease),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		scale = interpolate(progress, [0, 1], [0.85, 1], {
			easing: Easing.out(Easing.ease),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		opacity = interpolate(progress, [0, 1], [0, 1], {
			easing: Easing.out(Easing.ease),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
	} else if (isInFloatOut) {
		// Float out animation
		const progress = (currentTime - (lastWordEnd - floatOutDuration)) / floatOutDuration;
		translateY = interpolate(progress, [0, 1], [0, -20], {
			easing: Easing.in(Easing.ease),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		scale = interpolate(progress, [0, 1], [1, 0.85], {
			easing: Easing.in(Easing.ease),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		opacity = interpolate(progress, [0, 1], [1, 0], {
			easing: Easing.in(Easing.ease),
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
	}

	// Calculate positioning based on position prop
	const getPositionStyles = () => {
		switch (position) {
			case "top":
				return {
					justifyContent: 'flex-start',
					alignItems: 'center',
					paddingTop: '10%',
				};
			case "middle":
				return {
					justifyContent: 'center',
					alignItems: 'center',
					paddingTop: 0,
				};
			case "bottom":
			default:
				return {
					justifyContent: 'flex-end',
					alignItems: 'center',
					paddingBottom: '10%',
				};
		}
	};

	// Check if any words on the current page have emojis
	const hasEmojisOnPage = wordsToShow.some(word => word.emoji);

	// Collect all emojis from words, extending their display time by 1.5x
	const currentEmojis = wordsToShow
		.map((word, index) => {
			const actualWordIndex = pageStartIndex + index;
			if (!word.emoji) return null;

			// Safety check: ensure valid word timing
			if (!word.start || !word.end || word.end <= word.start || !isFinite(word.start) || !isFinite(word.end)) {
				return null;
			}

			const wordDuration = word.end - word.start;
			const extensionTime = wordDuration * 0.25; // Extend by 25% on each side (50% total = 1.5x)
			const extendedStart = Math.max(0, word.start - extensionTime); // Don't go below 0
			const extendedEnd = word.end + extensionTime;

			// Show emoji if we're within the extended time window
			if (currentTime >= extendedStart && currentTime <= extendedEnd && extendedEnd > extendedStart) {
				return {
					emoji: word.emoji,
					start: extendedStart,
					end: extendedEnd,
					originalDuration: wordDuration,
					word: word.word,
				};
			}
			return null;
		})
		.filter((item): item is { emoji: string; start: number; end: number; originalDuration: number; word: string } => item !== null);

	return (
		<AbsoluteFill
			style={{
				...getPositionStyles(),
				zIndex: 10,
			}}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: '16px',
					maxWidth: '85%',
					opacity,
					transform: `translateY(${translateY}px) scale(${scale})`,
					textAlign: 'center',
				}}
			>
				{/* Words row - fixed height container to prevent jumping */}
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						justifyContent: 'center',
						alignItems: 'center',
						gap: '12px',
						minHeight: hasEmojisOnPage ? undefined : '100px', // Reserve space when no emojis
					}}
				>
					{wordsToShow.map((word, index) => {
						// Calculate the actual word index in the full words array
						const actualWordIndex = pageStartIndex + index;
						// Check if this word is currently being spoken
						const isCurrentWord = actualWordIndex === currentSpokenWordIndex;
						// Check if this word has already been spoken (for dimming effect, optional)
						const hasBeenSpoken = actualWordIndex < currentSpokenWordIndex;

						return (
							<span
								key={`${word.word}-${word.start}-${actualWordIndex}`}
								style={{
									color: isCurrentWord ? highlightColor : 'white',
									fontSize: 64,
									fontWeight: 900,
									fontStyle: 'italic',
									fontFamily: '"Arial", "Liberation Sans", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif',
									textTransform: 'uppercase',
									textShadow: `
										-3px -3px 0 #000,
										3px -3px 0 #000,
										-3px 3px 0 #000,
										3px 3px 0 #000,
										-2px -2px 0 #000,
										2px -2px 0 #000,
										-2px 2px 0 #000,
										2px 2px 0 #000,
										0 0 8px #000
									`,
									letterSpacing: '0.05em',
									transition: 'color 0.1s ease',
								}}
							>
								{word.word}
							</span>
						);
					})}
				</div>

				{/* Emojis row - fixed height container to prevent jumping */}
				<div
					style={{
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						gap: '20px',
						flexWrap: 'wrap',
						minHeight: '110px', // Fixed height to always reserve space for emojis
					}}
				>
					{currentEmojis.map((emojiData, index) => {
						const totalDuration = emojiData.end - emojiData.start;

						// Safety check: ensure valid duration
						if (totalDuration <= 0 || !isFinite(totalDuration)) {
							return null;
						}

						// Adjust fade durations based on extended time
						const fadeInDuration = Math.max(0.05, Math.min(0.15, totalDuration * 0.2));
						const fadeOutDuration = Math.max(0.05, Math.min(0.2, totalDuration * 0.25));

						// Ensure fade points are valid
						const fadeInEnd = emojiData.start + fadeInDuration;
						const fadeOutStart = Math.max(fadeInEnd, emojiData.end - fadeOutDuration);

						// Only render if we have valid time points
						if (fadeOutStart >= fadeInEnd && emojiData.end > emojiData.start) {
							const emojiOpacity = interpolate(
								currentTime,
								[emojiData.start, fadeInEnd, fadeOutStart, emojiData.end],
								[0, 1, 1, 0],
								{
									extrapolateLeft: 'clamp',
									extrapolateRight: 'clamp',
								}
							);

							const emojiScale = interpolate(
								currentTime - emojiData.start,
								[0, 0.15, 0.25],
								[0, 1.2, 1],
								{
									easing: Easing.out(Easing.back(1.5)),
									extrapolateLeft: 'clamp',
									extrapolateRight: 'clamp',
								}
							);

							return (
								<span
									key={`${emojiData.emoji}-${emojiData.start}-${index}`}
									style={{
										fontSize: 96,
										fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif',
										opacity: emojiOpacity,
										transform: `scale(${emojiScale})`,
										filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
										pointerEvents: 'none',
									}}
								>
									{emojiData.emoji}
								</span>
							);
						}

						return null;
					})}
				</div>
			</div>
		</AbsoluteFill>
	);
};

// Scene component with zoom/pan effects
const SceneWithEffects: React.FC<{
	imageUrl: string;
	durationInFrames: number;
	effectType: 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';
}> = ({ imageUrl, durationInFrames, effectType }) => {
	const frame = useCurrentFrame(); // This is relative to the Sequence, not global
	const { width } = useVideoConfig();

	// Clamp progress to [0, 1] to prevent animation glitches
	const progress = Math.min(1, Math.max(0, frame / Math.max(durationInFrames, 1)));

	// Apply effects with safer interpolation and clamping
	let transform = '';

	switch (effectType) {
		case 'zoomIn':
			const zoomInScale = interpolate(progress, [0, 1], [1.0, 1.15], {
				easing: Easing.out(Easing.quad),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
			transform = `scale(${zoomInScale})`;
			break;
		case 'zoomOut':
			const zoomOutScale = interpolate(progress, [0, 1], [1.15, 1.0], {
				easing: Easing.out(Easing.quad),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
			transform = `scale(${zoomOutScale})`;
			break;
		case 'panLeft':
			const panLeftX = interpolate(progress, [0, 1], [0, -width * 0.08], {
				easing: Easing.out(Easing.quad),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
			transform = `translateX(${panLeftX}px) scale(1.1)`;
			break;
		case 'panRight':
			const panRightX = interpolate(progress, [0, 1], [0, width * 0.08], {
				easing: Easing.out(Easing.quad),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
			transform = `translateX(${panRightX}px) scale(1.1)`;
			break;
	}

	return (
		<AbsoluteFill
			style={{
				overflow: 'hidden', // Prevent images from showing outside bounds
			}}
		>
			<Img
				src={imageUrl}
				style={{
					width: '100%',
					height: '100%',
					objectFit: 'cover',
					transform,
					transformOrigin: 'center center',
				}}
			/>
		</AbsoluteFill>
	);
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
	scenes,
	audioUrl,
	words,
	captionHighlightColor,
	captionPosition = "bottom",
}) => {
	const { durationInFrames, fps } = useVideoConfig();

	// Calculate duration per scene (equally distributed)
	const durationPerScene = durationInFrames / scenes.length;

	// Effect types to cycle through
	const effects: Array<'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight'> = [
		'zoomIn',
		'zoomOut',
		'panLeft',
		'panRight',
	];

	return (
		<AbsoluteFill style={{ backgroundColor: '#000' }}>
			{/* Audio */}
			<Audio src={audioUrl} />

			{/* Scenes with effects */}
			{scenes.map((scene, index) => {
				const startFrame = index * durationPerScene;
				const effectType = effects[index % effects.length];

				return (
					<Sequence
						key={scene.id}
						from={Math.floor(startFrame)}
						durationInFrames={Math.floor(durationPerScene)}
					>
						<SceneWithEffects
							imageUrl={scene.imageUrl}
							durationInFrames={Math.floor(durationPerScene)}
							effectType={effectType}
						/>
					</Sequence>
				);
			})}

			{/* Captions */}
			<Caption words={words} highlightColor={captionHighlightColor} position={captionPosition} />
		</AbsoluteFill>
	);
};
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { VideoComposition } from './VideoComposition';

interface WordTimestamp {
	word: string;
	start: number;
	end: number;
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

export const RemotionRoot: React.FC = () => {
	return (
		<Composition
			id="VideoComposition"
			component={VideoComposition as any}
			durationInFrames={900} // Will be calculated from audio duration
			fps={30}
			width={1080}
			height={1920} // 9:16 aspect ratio for shorts
			defaultProps={{
				scenes: [],
				audioUrl: '',
				words: [],
				captionHighlightColor: '#FFD700',
				captionPosition: 'bottom',
			}}
		/>
	);
};

// Register the root component
registerRoot(RemotionRoot);


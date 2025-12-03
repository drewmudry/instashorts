"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemotionRoot = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const remotion_1 = require("../remotion");
const VideoComposition_1 = require("./VideoComposition");
const RemotionRoot = () => {
    return ((0, jsx_runtime_1.jsx)(remotion_1.Composition, { id: "VideoComposition", component: VideoComposition_1.VideoComposition, durationInFrames: 900, fps: 30, width: 1080, height: 1920, defaultProps: {
            scenes: [],
            audioUrl: '',
            words: [],
            captionHighlightColor: '#FFD700',
            captionPosition: 'bottom',
        } }));
};
exports.RemotionRoot = RemotionRoot;
// Register the root component
(0, remotion_1.registerRoot)(exports.RemotionRoot);

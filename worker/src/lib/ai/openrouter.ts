import { OpenRouter } from '@openrouter/sdk';
import {
    VIDEO_STYLES,
    VideoStyle,
    THEME_PROMPT_HYPOTHETICAL,
    THEME_PROMPT_STORY,
    SCRIPT_PROMPT_HYPOTHETICAL,
    SCRIPT_PROMPT_STORY
} from "./prompts";

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

const TEXT_MODEL = "google/gemini-2.5-flash";
const IMAGE_MODEL = "google/gemini-3-pro-image-preview";

/**
 * Generates a video script based on a theme
 */
export async function generateVideoScript(theme: string): Promise<string> {
    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: `Write a compelling 1 paragraph script for a short video about: ${theme}. Make it engaging, clear, and suitable for a short-form video format. The script should be in paragraph format and should not have any voice changes or other formatting. Be slightly poetic in a way that the listener/reader can appreciate a conclusive story or theme by the end of the script.
        The script should be approximately 150 words long (65 seconds long).
        
        IMPORTANT STYLE RULES:
        - Use simple, direct language. Avoid dashes, em-dashes, or compound words with hyphens.
        - Write in short, clear sentences. Avoid complex nested phrases.
        - No parenthetical asides or interjections with dashes.
        - Keep the flow natural and conversational, not overly literary or academic.
        - Use straightforward sentence structure without excessive punctuation.`,
            },
        ],
    });

    return (completion.choices?.[0]?.message?.content as string) || "";
}

/**
 * Generates a short title (less than 10 words, no punctuation) based on a theme
 */
export async function generateVideoTitle(theme: string): Promise<string> {
    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: `Generate a short, catchy title (less than 10 words, no punctuation) for a video about: ${theme}. Return only the title text, nothing else.`,
            },
        ],
    });

    const text = (completion.choices?.[0]?.message?.content as string) || "";

    // Clean up the title: remove punctuation and ensure it's under 10 words
    const cleaned = text
        .replace(/[^\w\s]/g, "") // Remove all punctuation
        .trim()
        .split(/\s+/)
        .slice(0, 10) // Take first 10 words max
        .join(" ");
    return cleaned;
}

export interface Scene {
    sceneIndex: number;
    image_prompt: string;
}

export interface WordWithEmoji {
    word: string;
    start: number;
    end: number;
    emoji?: string; // Optional emoji for this word
}

/**
 * Adds relevant emojis to words in the captions
 */
export async function addEmojisToWords(
    words: Array<{ word: string; start: number; end: number }>,
    script: string,
    theme: string
): Promise<WordWithEmoji[]> {
    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: `Given this video script and list of words, identify 8-12 key words that would benefit from an emoji visualization. Choose words that are:

1. Nouns, verbs, or important concepts
2. Would have a clear, relevant emoji
3. Spread throughout the script (not all clustered together)
4. Enhance understanding and engagement

Script: ${script}
Theme: ${theme}

Words with timing:

${words.map((w, i) => `${i}: "${w.word}" (${w.start}s - ${w.end}s)`).join('\n')}

Return ONLY a JSON object with this structure:

{
  "emojiWords": [
    {"index": 5, "word": "Caesar", "emoji": "👑"},
    {"index": 12, "word": "Roman", "emoji": "🏛️"}
  ]
}

Choose emojis that are:
- Culturally universal and clear
- Relevant to the word meaning
- Visually distinct from each other
- Not overly complex (single emoji, not combinations)

Do not include any text before or after the JSON.`,
            },
        ],
    });

    const text = (completion.choices?.[0]?.message?.content as string) || "";

    try {
        let jsonText = text.trim();
        if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```(?:json)?\s*/i, "");
            jsonText = jsonText.replace(/\s*```$/i, "");
            jsonText = jsonText.trim();
        }

        const result = JSON.parse(jsonText) as {
            emojiWords: Array<{ index: number; word: string; emoji: string }>;
        };

        // Create a map of word indices to emojis
        const emojiMap = new Map(
            result.emojiWords.map(ew => [ew.index, ew.emoji])
        );

        // Add emojis to the words array
        return words.map((word, index) => ({
            ...word,
            emoji: emojiMap.get(index),
        }));
    } catch (error) {
        console.error('Failed to parse emoji response:', error);
        // Return original words without emojis if parsing fails
        return words;
    }
}

export async function generateVideoScenes(
    script: string,
    theme: string,
    sceneCount: number = 3,
    artStyle?: string | null
): Promise<Scene[]> {
    // Map art style IDs to descriptive prompts
    const artStylePrompts: Record<string, string> = {
        "collage": "collage style, layered mixed-media aesthetic, paper cutouts, textured elements, artistic composition",
        "cinematic": "cinematic style, film-like quality, dramatic lighting, cinematic composition, movie aesthetic",
        "digital-art": "modern digital art style, digital illustration, vibrant colors, contemporary art",
        "neon-futuristic": "neon futuristic style, cyberpunk aesthetic, neon lights, futuristic urban environment, vibrant neon colors",
        "comic-book": "comic book style, bold lines, vibrant colors, stylized illustration, comic art aesthetic",
        "playground": "playground style, bright and playful cartoon aesthetic, cheerful colors, fun and energetic",
        "4k-realistic": "ultra-realistic 4K style, photorealistic, high detail, professional photography quality",
        "cartoon": "cartoon style, classic animation, expressive characters, vibrant colors, animated aesthetic",
        "kawaii": "kawaii style, cute Japanese aesthetic, pastel colors, adorable characters, soft and sweet",
        "anime": "anime style, Japanese animation aesthetic, expressive eyes, vibrant colors, anime art",
        "line-art": "line art style, minimalist black and white line drawings, clean lines, simple elegant",
        "japanese-ink": "Japanese ink painting style, sumi-e aesthetic, black and red ink, traditional Japanese art",
    };

    const artStyleDescription = artStyle && artStylePrompts[artStyle]
        ? artStylePrompts[artStyle]
        : "consistent art style";

    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: `Based on this video script and theme, generate ${sceneCount} detailed scenes for a short video.

Script: ${script}
Theme: ${theme}
Art Style: ${artStyleDescription}

For each scene, create a detailed image prompt that includes:
- The specified art style: ${artStyleDescription}
- Color theme and vibe matching the art style
- Camera/animation style
- What's happening in the scene
- Who is doing what (if applicable)
- Background and foreground details
- Overall atmosphere and mood

IMPORTANT: All scenes must consistently use the ${artStyleDescription} art style throughout.

Return ONLY a valid JSON array with this exact structure:
[
  {"sceneIndex": 0, "image_prompt": "detailed description here"},
  {"sceneIndex": 1, "image_prompt": "detailed description here"},
  ...
]

Do not include any text before or after the JSON array.`,
            },
        ],
    });

    const text = (completion.choices?.[0]?.message?.content as string) || "";

    // Parse the JSON response
    try {
        let jsonText = text.trim();
        if (jsonText.startsWith("```")) {
            // Remove opening ```json or ```
            jsonText = jsonText.replace(/^```(?:json)?\s*/i, "");
            // Remove closing ```
            jsonText = jsonText.replace(/\s*```$/i, "");
            jsonText = jsonText.trim();
        }

        const scenes = JSON.parse(jsonText) as Scene[];
        // Ensure sceneIndex matches array position
        return scenes.map((scene, index) => ({
            ...scene,
            sceneIndex: index,
        }));
    } catch (error) {
        throw new Error(
            `Failed to parse scenes JSON: ${error}. Raw response: ${text.substring(
                0,
                200
            )}`
        );
    }
}

/**
 * Generates a viral theme, randomly rotating between styles to keep it fresh.
 */
export async function generateViralTheme(pastTopics: string[] = []): Promise<{ theme: string; style: VideoStyle }> {
    // 50/50 chance to pick a Science "What If" or a "True Story"
    const style = Math.random() > 0.5 ? VIDEO_STYLES.HYPOTHETICAL : VIDEO_STYLES.STORY;

    let prompt = style === VIDEO_STYLES.HYPOTHETICAL ? THEME_PROMPT_HYPOTHETICAL : THEME_PROMPT_STORY;

    if (pastTopics.length > 0) {
        prompt += `\n\nIMPORTANT: Do NOT generate the following topics again: ${pastTopics.join(", ")}`;
    }

    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
    });

    const text = (completion.choices?.[0]?.message?.content as string) || "";
    return { theme: text.trim(), style };
}

/**
 * Generates the script using the correct template for the style.
 */
export async function generateChainReactionScript(topic: string, style?: VideoStyle): Promise<string> {
    // If we somehow don't know the style, default to Hypothetical
    const effectiveStyle = style || VIDEO_STYLES.HYPOTHETICAL;

    const promptTemplate = effectiveStyle === VIDEO_STYLES.STORY
        ? SCRIPT_PROMPT_STORY(topic)
        : SCRIPT_PROMPT_HYPOTHETICAL(topic);

    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: promptTemplate,
            },
        ],
    });

    return ((completion.choices?.[0]?.message?.content as string) || "").trim();
}

/**
 * Generates a script for AI videos.
 */
export async function generateAiVideoScript(topic: string, style?: VideoStyle): Promise<string> {
    return generateChainReactionScript(topic, style);
}

export interface AiScene {
    sceneIndex: number;
    textSegment: string;
    duration: number;
    imagePrompt: string;
}

/**
 * Generates scene descriptions based on the script and exact timing of the voiceover.
 */
export async function generateScenesFromTimestamps(
    script: string,
    wordTimings: Array<{ word: string; start: number; end: number }>,
    style: string = "Hypothetical Chain Reaction"
): Promise<AiScene[]> {
    const totalDuration = wordTimings[wordTimings.length - 1].end;

    const prompt = `
    You are a 3D Animation Director for a viral video channel.
    
    **Context:**
    - Total Audio Duration: ${totalDuration.toFixed(2)} seconds.
    - Script: "${script}"
    - Style: "${style}" (Visuals must match this tone).
    
    **Task:**
    Break this script into 4-8 distinct visual scenes.
    For each scene:
    1. **textSegment**: Identify the exact start and end words from the script.
    2. **duration**: Estimate the duration of this segment (must sum up to approx ${totalDuration}s).
    3. **imagePrompt**: Write a HIGHLY DETAILED prompt for a 3D video generator (like Minimax or Luma).
       - Include: Lighting (bright/studio), Camera Angle (extreme close-up, cross-section), and Action.
       - Style keywords: "3D medical animation", "Hyper-realistic", "Unreal Engine 5", "Satisfying".

    **Output Format:**
    Return ONLY a raw JSON array. No markdown formatting.
    Example:
    [
      {
        "sceneIndex": 0,
        "textSegment": "If you fell into liquid nitrogen...",
        "duration": 3.5,
        "imagePrompt": "3D animation, medium shot. A realistic 3D human character falling backwards into a vat of bubbling liquid nitrogen. Bright laboratory lighting. High quality render, 4k."
      }
    ]
  `;

    const completion = await openRouter.chat.send({
        model: TEXT_MODEL,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
    });

    const text = (completion.choices?.[0]?.message?.content as string) || "";

    try {
        const cleanJson = text.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJson) as AiScene[];
    } catch (e) {
        console.error("Failed to parse scenes:", e);
        throw new Error("Failed to generate scenes");
    }
}

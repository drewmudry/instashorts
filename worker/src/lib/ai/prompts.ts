// src/lib/ai/prompts.ts

export const VIDEO_STYLES = {
  HYPOTHETICAL: "hypothetical",
  STORY: "story",
} as const;

export type VideoStyle = typeof VIDEO_STYLES[keyof typeof VIDEO_STYLES];

// --- 1. Theme Generation Prompts ---

export const THEME_PROMPT_HYPOTHETICAL = `
You are a creative director for a viral science YouTube channel (like Zack D. Films). 
Generate ONE catchy, visceral, and dramatic "What If" or "Physics Question" topic.

Criteria:
1. It must involve extreme physics, biology, or chemistry.
2. It must have a clear "chain reaction" of events (A causes B, B causes C).
3. It must be physical and visual.

Examples:
- "What if you fell into liquid nitrogen?"
- "Can a sponge stop a tsunami?"
- "What happens if you swallow a magnet?"
- "Farting in a space suit"

Return ONLY the topic string. No quotes.
`;

export const THEME_PROMPT_STORY = `
You are a creative director for a viral storytelling channel.
Generate ONE viral "True Story" hook. It should be about a survival event, a dumb criminal, or a lucky escape.

Criteria:
1. High stakes (life or death, prison, or huge money).
2. Irony or a twist ending.

Examples:
- "Man trapped in bear trap for 10 days"
- "Thief hides gold bars in his body"
- "Bullet stopped by a video game"

Return ONLY the topic string. No quotes.
`;

// --- 2. Script Generation Prompts ---

export const SCRIPT_PROMPT_HYPOTHETICAL = (topic: string) => `
Topic: "${topic}"
Style: "Hypothetical Chain Reaction"

Write a script for a 1-minute video following this EXACT formula.
The tone must be: **Dramatic, Fast-Paced, and Visceral.**

### Formula to Follow:

1. **The Hook:** "If you [action]..." or "What if [scenario]..."

2. **Immediate Reaction:** "Instantly, [visceral physical effect]..."

3. **Escalation (Chain Reaction):** "Next, [step 2]... Then, [step 3]..."

4. **The Science:** "This happens because [simple explanation]..."

5. **The Climax:** "Causing [final destruction] like [vivid simile]."

### Example Output:

"If you were dropped into liquid nitrogen, the extreme cold would cause your skin to freeze instantly. Next, the water in your tissue would turn to ice, causing your muscles to become rigid and brittle. After just a few seconds, your body would be frozen solid... This happens because rapid cooling locks molecules in place. Causing your cells to burst like water balloons."

**Output ONLY the script text. Keep it under 100 words.**
`;

export const SCRIPT_PROMPT_STORY = (topic: string) => `
Topic: "${topic}"
Style: "Viral Storytelling"

Write a script for a 1-minute video telling this specific story.
The tone must be: **Tense, Dramatic, and Irony-focused.**

### Formula to Follow:

1. **The Incident:** Start immediately with the action. ("He stepped into the trap...")

2. **The Struggle/Action:** What did they try? ("He tried to pry it off...")

3. **The Twist:** Something unexpected happens. ("The hunter found him... but walked away.")

4. **The Climax/Resolution:** How it ended. ("2 weeks later, a fisherman found him...")

**Output ONLY the script text. Keep it under 100 words.**
`;


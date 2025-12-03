import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export type ElevenLabsSpeechModel =
  | 'eleven_v3'
  | 'eleven_multilingual_v2'
  | 'eleven_flash_v2_5'
  | 'eleven_flash_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_turbo_v2'
  | 'eleven_monolingual_v1'
  | 'eleven_multilingual_v1';

export interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface NormalizedAlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TimestampResponse {
  audio_base64: string;
  alignment: AlignmentData;
  normalized_alignment: NormalizedAlignmentData;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

/**
 * Generates a voiceover audio file from text using ElevenLabs
 * Returns the audio as a Buffer
 */
export async function generateVoiceover(
  text: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM', // Default voice ID (Rachel)
  modelId: ElevenLabsSpeechModel = "eleven_flash_v2_5",
  outputFormat: "mp3_44100_128"
): Promise<Buffer> {
  const audio = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId,
    outputFormat,
  });

  // Convert ReadableStream to Buffer
  const reader = audio.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  // Combine all chunks into a single buffer
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return Buffer.from(result);
}

/**
 * Generates a voiceover audio file with timestamps from text using ElevenLabs
 * Returns the audio as a Buffer and the alignment data
 */
export async function generateVoiceoverWithTimestamps(
  text: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM', // Default voice ID (Rachel)
  modelId: ElevenLabsSpeechModel = "eleven_flash_v2_5",
  outputFormat: "mp3_44100_128" = "mp3_44100_128"
): Promise<{ audio: Buffer; alignment: AlignmentData; normalizedAlignment: NormalizedAlignmentData }> {
  const response = await elevenlabs.textToSpeech.convertWithTimestamps(voiceId, {
    text,
    modelId,
    outputFormat,
  });

  if (!response.alignment) {
    throw new Error('Alignment data not returned from ElevenLabs API');
  }

  // Convert base64 audio to Buffer (SDK uses camelCase)
  const audioBuffer = Buffer.from(response.audioBase64, 'base64');

  // Convert SDK response format to our internal format
  const alignment: AlignmentData = {
    characters: response.alignment.characters || [],
    character_start_times_seconds: response.alignment.characterStartTimesSeconds || [],
    character_end_times_seconds: response.alignment.characterEndTimesSeconds || [],
  };

  const normalizedAlignment: NormalizedAlignmentData = response.normalizedAlignment ? {
    characters: response.normalizedAlignment.characters || [],
    character_start_times_seconds: response.normalizedAlignment.characterStartTimesSeconds || [],
    character_end_times_seconds: response.normalizedAlignment.characterEndTimesSeconds || [],
  } : alignment;

  return {
    audio: audioBuffer,
    alignment,
    normalizedAlignment,
  };
}

/**
 * Converts character-level timestamps to word-level timestamps
 */
export function convertCharactersToWords(alignment: AlignmentData): WordTimestamp[] {
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const words: WordTimestamp[] = [];
  
  let currentWord = '';
  let wordStartTime: number | null = null;
  let wordEndTime: number | null = null;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const startTime = character_start_times_seconds[i];
    const endTime = character_end_times_seconds[i];

    // Only spaces are word boundaries; punctuation is included with the word
    const isWordBoundary = char === ' ';

    if (isWordBoundary) {
      // If we have a word in progress, save it
      if (currentWord && wordStartTime !== null && wordEndTime !== null) {
        words.push({
          word: currentWord,
          start: wordStartTime,
          end: wordEndTime,
        });
        currentWord = '';
        wordStartTime = null;
        wordEndTime = null;
      }
    } else {
      // Start of a new word
      if (wordStartTime === null) {
        wordStartTime = startTime;
      }
      currentWord += char;
      wordEndTime = endTime; // Update end time as we go
    }
  }

  // Don't forget the last word if there's no trailing space
  if (currentWord && wordStartTime !== null && wordEndTime !== null) {
    words.push({
      word: currentWord,
      start: wordStartTime,
      end: wordEndTime,
    });
  }

  return words;
}

/**
 * Formats seconds to SRT time format (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Converts word timestamps to SRT format captions
 * Groups words into caption blocks (by sentence or max words per block)
 */
export function convertWordsToSRT(
  words: WordTimestamp[],
  maxWordsPerBlock: number = 10
): string {
  if (words.length === 0) {
    return '';
  }

  const blocks: { words: WordTimestamp[] }[] = [];
  let currentBlock: WordTimestamp[] = [];
  let wordCount = 0;

  for (const word of words) {
    currentBlock.push(word);
    wordCount++;

    // Check if we should end the block (sentence end or max words)
    const isSentenceEnd = /[.!?]/.test(word.word);
    const reachedMaxWords = wordCount >= maxWordsPerBlock;

    if (isSentenceEnd || reachedMaxWords) {
      blocks.push({ words: [...currentBlock] });
      currentBlock = [];
      wordCount = 0;
    }
  }

  // Add remaining words as a final block
  if (currentBlock.length > 0) {
    blocks.push({ words: currentBlock });
  }

  // Format blocks as SRT
  let srtContent = '';
  blocks.forEach((block, index) => {
    if (block.words.length === 0) return;

    const firstWord = block.words[0];
    const lastWord = block.words[block.words.length - 1];
    const startTime = formatSRTTime(firstWord.start);
    const endTime = formatSRTTime(lastWord.end);
    const text = block.words.map(w => w.word).join(' ');

    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${text}\n\n`;
  });

  return srtContent.trim();
}




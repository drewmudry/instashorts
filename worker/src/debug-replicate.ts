import Replicate from "replicate";
import dotenv from "dotenv";
import path from "path";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("REPLICATE_API_TOKEN present:", !!process.env.REPLICATE_API_TOKEN);
console.log("REPLICATE_API_KEY present:", !!process.env.REPLICATE_API_KEY);

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY,
});

async function testReplicate() {
    console.log("Testing Replicate generation...");
    const model = "black-forest-labs/flux-schnell";
    const input = {
        prompt: "A cute cat sitting on a windowsill",
        aspect_ratio: "9:16",
        output_format: "png",
        go_fast: true,
        megapixels: "1"
    };

    try {
        const output = await replicate.run(model, { input });
        console.log("Output:", output);
    } catch (error) {
        console.error("Error:", error);
    }
}

testReplicate();

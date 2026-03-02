/**
 * Integration test: Generate 3 images using Gemini API with key rotation.
 *
 * Usage:
 *   npx tsx test/integration/test_key_rotation_images.ts
 *
 * This script:
 *  1. Loads GEMINI_API_KEYS from .env
 *  2. Creates a KeyRotator
 *  3. Generates 3 images, each using a different API key (round-robin)
 *  4. Saves results to /tmp/key_rotation_test/
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { KeyRotator } from "../../src/utils/key_rotator.js";

dotenv.config();

const OUTPUT_DIR = "/tmp/key_rotation_test";

const prompts = [
    "A cute cartoon cat sitting on a red cushion, simple illustration style",
    "A beautiful sunset over a calm ocean, watercolor painting style",
    "A cozy coffee shop interior with warm lighting, digital art style",
];

async function main() {
    const geminiApiKeys = process.env.GEMINI_API_KEYS;
    if (!geminiApiKeys) {
        console.error("❌ GEMINI_API_KEYS is not set in .env");
        process.exit(1);
    }

    const rotator = new KeyRotator(geminiApiKeys);
    console.log(`🔑 Loaded ${rotator.size} API keys for rotation\n`);

    // Ensure output dir exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    for (let i = 0; i < prompts.length; i++) {
        const apiKey = rotator.getNext();
        const maskedKey = apiKey.slice(0, 10) + "..." + apiKey.slice(-4);
        console.log(`🖼️  [${i + 1}/3] Generating image with key: ${maskedKey}`);
        console.log(`   Prompt: "${prompts[i]}"`);

        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [{ text: prompts[i] }],
                config: {
                    imageConfig: {
                        aspectRatio: "16:9",
                    },
                },
            });

            // Extract image data from response
            let saved = false;
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        const buffer = Buffer.from(part.inlineData.data, "base64");
                        const outputPath = path.join(OUTPUT_DIR, `test_image_${i + 1}.png`);
                        fs.writeFileSync(outputPath, buffer);
                        console.log(`   ✅ Saved to ${outputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
                        saved = true;
                        break;
                    }
                    if (part.text) {
                        console.log(`   📝 Text response: ${part.text.slice(0, 100)}`);
                    }
                }
            }
            if (!saved) {
                console.log(`   ⚠️  No image data in response`);
            }
        } catch (error) {
            console.error(`   ❌ Failed: ${(error as Error).message}`);
        }
        console.log();
    }

    console.log(`\n🎉 Done! Check output in ${OUTPUT_DIR}/`);
}

main();

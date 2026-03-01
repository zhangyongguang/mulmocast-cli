import { GraphAILogger } from "graphai";
import type { AgentFunction, AgentFunctionInfo } from "graphai";
import { randomUUID } from "crypto";

import { apiKeyMissingError, agentGenerationError, audioAction, audioFileTarget } from "../utils/error_cause.js";
import type { AgentBufferResult, AgentTextInputs, AgentErrorResult } from "../types/agent.js";

const ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";

async function volcengineTTS(appId: string, token: string, voice: string, text: string, speedRatio: number): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer;${token}`,
      },
      body: JSON.stringify({
        app: { appid: appId, token, cluster: "volcano_tts" },
        user: { uid: randomUUID() },
        audio: { voice_type: voice, encoding: "mp3", speed_ratio: speedRatio },
        request: { reqid: randomUUID(), text, operation: "query" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = (await response.json()) as { code: number; message: string; data?: string };

    if (result.code !== 3000) {
      throw new Error(`Volcengine TTS error ${result.code}: ${result.message}`);
    }
    if (!result.data) {
      throw new Error("No audio data returned");
    }

    return Buffer.from(result.data, "base64");
  } finally {
    clearTimeout(timeoutId);
  }
}

type VolcengineTTSParams = {
  voice?: string;
  speed?: number;
  suppressError?: boolean;
};

export const ttsVolcengineAgent: AgentFunction<VolcengineTTSParams, AgentBufferResult | AgentErrorResult, AgentTextInputs> = async ({
  namedInputs,
  params,
  config,
}) => {
  const { text } = namedInputs;
  const { voice, speed, suppressError } = params;

  const apiKey = config?.apiKey;
  const appId = process.env.VOLCENGINE_APP_ID;

  if (!apiKey || !appId) {
    throw new Error("Volcengine requires VOLCENGINE_API_KEY and VOLCENGINE_APP_ID", {
      cause: apiKeyMissingError("ttsVolcengineAgent", audioAction, "VOLCENGINE_API_KEY"),
    });
  }

  try {
    const buffer = await volcengineTTS(appId, apiKey, voice ?? "zh_male_shaonianzixin_moon_bigtts", text, speed ?? 1.0);
    return { buffer };
  } catch (e) {
    if (suppressError) {
      return { error: e };
    }
    GraphAILogger.info(e);
    throw new Error("TTS Volcengine Error", {
      cause: agentGenerationError("ttsVolcengineAgent", audioAction, audioFileTarget),
    });
  }
};

const ttsVolcengineAgentInfo: AgentFunctionInfo = {
  name: "ttsVolcengineAgent",
  agent: ttsVolcengineAgent,
  mock: ttsVolcengineAgent,
  samples: [],
  description: "Volcengine (ByteDance) TTS agent using HTTP v1 API",
  category: ["tts"],
  author: "MulmoCast",
  repository: "https://github.com/receptron/mulmocast-cli/",
  license: "MIT",
  environmentVariables: ["VOLCENGINE_API_KEY", "VOLCENGINE_APP_ID"],
};

export default ttsVolcengineAgentInfo;

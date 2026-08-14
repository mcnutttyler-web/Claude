const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

export interface VisionCardGuess {
  name: string | null;
  setNameGuess: string | null;
  cardNumberGuess: string | null;
  printingGuess: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

const PROMPT = `You are looking at a photo of a physical Pokemon trading card. Read what is printed on the card and respond with ONLY a JSON object (no markdown fences, no commentary) with this exact shape:

{
  "name": string | null,          // the card's name as printed, e.g. "Mew ex"
  "setNameGuess": string | null,  // the set name or set symbol you can identify, e.g. "Scarlet & Violet 151"
  "cardNumberGuess": string | null, // the collector number as printed, e.g. "232/165"
  "printingGuess": string | null, // e.g. "Holofoil", "Reverse Holofoil", "Normal", "1st Edition"
  "confidence": "high" | "medium" | "low",
  "notes": string | null          // anything relevant: glare, blur, partially obscured, uncertain set, etc.
}

If you cannot read a field, set it to null rather than guessing. Do not include anything except the JSON object in your response.`;

export class VisionConfigError extends Error {}
export class VisionApiError extends Error {}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Send a card photo to Claude's vision API and get back a structured guess
 * at what card it is. Requires ANTHROPIC_API_KEY in the environment. */
export async function identifyCardFromImage(
  imageBytes: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<VisionCardGuess> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new VisionConfigError(
      "ANTHROPIC_API_KEY is not configured. Set it in .env.local to enable photo-based card recognition."
    );
  }

  const model = process.env.ANTHROPIC_VISION_MODEL || DEFAULT_MODEL;
  const base64 = imageBytes.toString("base64");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new VisionApiError(`Vision API request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const textBlock = data.content?.find((b) => b.type === "text")?.text;
  if (!textBlock) {
    throw new VisionApiError("Vision API returned no text content.");
  }

  let parsed: Partial<VisionCardGuess>;
  try {
    parsed = JSON.parse(extractJson(textBlock));
  } catch {
    throw new VisionApiError(`Could not parse vision response as JSON: ${textBlock.slice(0, 300)}`);
  }

  return {
    name: parsed.name ?? null,
    setNameGuess: parsed.setNameGuess ?? null,
    cardNumberGuess: parsed.cardNumberGuess ?? null,
    printingGuess: parsed.printingGuess ?? null,
    confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "low",
    notes: parsed.notes ?? null,
  };
}

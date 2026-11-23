
import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const apiKey = process.env.GEMINI_API_KEY;

const triviaSchema = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    correctAnswerIndex: { type: Type.INTEGER },
    explanation: { type: Type.STRING },
  },
  required: [
    "question",
    "options",
    "correctAnswerIndex",
    "explanation",
  ],
};

type Trivia = {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
};

const fallbackQuestions = [
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctAnswerIndex: 1,
    explanation:
      "Mars is known as the Red Planet because iron minerals on its surface create a reddish appearance.",
    topic: "science",
    difficulty: "easy",
  },
  {
    question: "What is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Pacific", "Arctic"],
    correctAnswerIndex: 2,
    explanation:
      "The Pacific Ocean is the largest and deepest ocean on Earth.",
    topic: "geography",
    difficulty: "easy",
  },
  {
    question: "Who wrote Romeo and Juliet?",
    options: [
      "Charles Dickens",
      "William Shakespeare",
      "Jane Austen",
      "Mark Twain",
    ],
    correctAnswerIndex: 1,
    explanation:
      "William Shakespeare wrote the tragedy Romeo and Juliet.",
    topic: "history",
    difficulty: "medium",
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Ag", "Fe", "Au", "Cu"],
    correctAnswerIndex: 2,
    explanation:
      "Au is the chemical symbol for gold, derived from the Latin word aurum.",
    topic: "science",
    difficulty: "medium",
  },
  {
    question: "How many sides does a hexagon have?",
    options: ["Five", "Six", "Seven", "Eight"],
    correctAnswerIndex: 1,
    explanation:
      "A hexagon is a polygon with six sides.",
    topic: "general knowledge",
    difficulty: "easy",
  },
];

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getFallback(topic: string, difficulty: string) {
  const normalizedTopic = topic.toLowerCase();

  const matching = fallbackQuestions.filter(
    (question) =>
      (normalizedTopic.includes(question.topic) ||
        question.topic.includes(normalizedTopic)) &&
      question.difficulty === difficulty
  );

  const topicMatching = fallbackQuestions.filter(
    (question) =>
      normalizedTopic.includes(question.topic) ||
      question.topic.includes(normalizedTopic)
  );

  const pool = matching.length
    ? matching
    : topicMatching.length
      ? topicMatching
      : fallbackQuestions;

  const question =
    pool[Math.floor(Math.random() * pool.length)];

  return {
    question: question.question,
    options: question.options,
    correctAnswerIndex: question.correctAnswerIndex,
    explanation: question.explanation,
    source: "fallback",
  };
}

function isValidTrivia(data: unknown): data is Trivia {
  if (!data || typeof data !== "object") {
    return false;
  }

  const trivia = data as Record<string, unknown>;

  return (
    typeof trivia.question === "string" &&
    trivia.question.length > 0 &&
    Array.isArray(trivia.options) &&
    trivia.options.length === 4 &&
    trivia.options.every(
      (option) =>
        typeof option === "string" && option.length > 0
    ) &&
    new Set(trivia.options).size === 4 &&
    Number.isInteger(trivia.correctAnswerIndex) &&
    (trivia.correctAnswerIndex as number) >= 0 &&
    (trivia.correctAnswerIndex as number) <= 3 &&
    typeof trivia.explanation === "string"
  );
}

async function generateTrivia(prompt: string): Promise<Trivia> {
  // Create the Gemini client inside the function.
  // This prevents missing API keys from crashing the build.
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const models = [
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(
          `Trying Gemini model: ${model}, attempt ${attempt + 1}`
        );

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: triviaSchema,
            temperature: 0.8,
          },
        });

        if (!response.text) {
          throw new Error("Empty Gemini response.");
        }

        const parsed: unknown = JSON.parse(response.text);

        if (!isValidTrivia(parsed)) {
          throw new Error("Invalid trivia response from Gemini.");
        }

        return parsed;
      } catch (error: unknown) {
        const status =
          typeof error === "object" &&
          error !== null &&
          "status" in error
            ? Number(error.status)
            : undefined;

        console.error(
          `Gemini model ${model} failed:`,
          status,
          error
        );

        if (status === 404) {
          break;
        }

        if (
          status !== 429 &&
          status !== 500 &&
          status !== 503
        ) {
          throw error;
        }

        if (attempt < 2) {
          await sleep(1000 * Math.pow(2, attempt));
        }
      }
    }
  }

  throw new Error("All Gemini models are unavailable.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const topic =
      typeof body.topic === "string" && body.topic.trim()
        ? body.topic.trim().slice(0, 150)
        : "General Knowledge";

    const difficulty = [
      "easy",
      "medium",
      "hard",
    ].includes(body.difficulty)
      ? body.difficulty
      : "medium";

    const prompt = `
      Generate one unique ${difficulty} trivia question
      about "${topic}".

      Requirements:
      - Return exactly four distinct answer options.
      - Only one option must be correct.
      - correctAnswerIndex must be between 0 and 3.
      - Include a clear and concise explanation.
      - Avoid ambiguous questions.
      - Return valid JSON matching the requested schema.
    `;

    try {
      const trivia = await generateTrivia(prompt);

      return NextResponse.json({
        ...trivia,
        source: "gemini",
      });
    } catch (geminiError) {
      console.error(
        "Gemini unavailable. Using fallback questions:",
        geminiError
      );

      return NextResponse.json(
        getFallback(topic, difficulty),
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Trivia API Error:", error);

    return NextResponse.json(
      { error: "Invalid request or server error." },
      { status: 500 }
    );
  }
}

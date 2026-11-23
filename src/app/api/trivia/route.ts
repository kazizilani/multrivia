
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

function getGeminiClient() {
  if (!apiKey) {
    return null;
  }

  return new GoogleGenAI({ apiKey });
}

async function generateTrivia(
  ai: GoogleGenAI,
  prompt: string
) {
  const models = [
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(
          `Trying ${model}, attempt ${attempt + 1}`
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

        return JSON.parse(response.text);
      } catch (error: unknown) {
        const status =
          typeof error === "object" &&
          error !== null &&
          "status" in error
            ? Number(error.status)
            : undefined;

        console.error(
          `Gemini ${model} error:`,
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

  throw new Error("All Gemini models unavailable.");
}

function getFallback(topic: string) {
  const normalizedTopic = topic.toLowerCase();

  const matching = fallbackQuestions.filter(
    (question) =>
      normalizedTopic.includes(question.topic) ||
      question.topic.includes(normalizedTopic)
  );

  const pool = matching.length
    ? matching
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const topic =
      typeof body.topic === "string" &&
      body.topic.trim()
        ? body.topic.trim().slice(0, 150)
        : "General Knowledge";

    const difficulty = [
      "easy",
      "medium",
      "hard",
    ].includes(body.difficulty)
      ? body.difficulty
      : "medium";

    // Check API key at request time, not build time.
    const ai = getGeminiClient();

    if (!ai) {
      console.error("GEMINI_API_KEY is missing.");

      return NextResponse.json(
        getFallback(topic),
        { status: 200 }
      );
    }

    const prompt = `
      Generate one unique ${difficulty} trivia question
      about "${topic}".

      Return exactly four distinct options.
      Only one option must be correct.
      correctAnswerIndex must be between 0 and 3.
      Include a concise explanation.
      Return valid JSON.
    `;

    try {
      const trivia = await generateTrivia(ai, prompt);

      if (
        !trivia ||
        typeof trivia.question !== "string" ||
        !Array.isArray(trivia.options) ||
        trivia.options.length !== 4 ||
        !trivia.options.every(
          (option: unknown) => typeof option === "string"
        ) ||
        new Set(trivia.options).size !== 4 ||
        !Number.isInteger(trivia.correctAnswerIndex) ||
        trivia.correctAnswerIndex < 0 ||
        trivia.correctAnswerIndex > 3 ||
        typeof trivia.explanation !== "string"
      ) {
        throw new Error("Invalid trivia response.");
      }

      return NextResponse.json({
        ...trivia,
        source: "gemini",
      });
    } catch (geminiError) {
      console.error(
        "Gemini unavailable. Using local fallback.",
        geminiError
      );

      return NextResponse.json(
        getFallback(topic),
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

"use client";

import { useState, useEffect } from "react";
import { TriviaQuestion } from "@/types/trivia";

interface QuizCardProps {
  topic?: string;
}

export default function QuizCard({ topic = "Science & Space" }: QuizCardProps) {
  const [trivia, setTrivia] = useState<TriviaQuestion | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestion = async () => {
    setLoading(true);
    setError(null);
    setSelectedIndex(null);

    try {
      const res = await fetch("/api/trivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, difficulty: "medium" }),
      });

      if (!res.ok) throw new Error("Failed to fetch question");
      const data: TriviaQuestion = await res.json();
      setTrivia(data);
    } catch (err) {
      setError("Could not load question. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestion();
  }, [topic]);

  const isAnswered = selectedIndex !== null;
  const isCorrect = isAnswered && selectedIndex === trivia?.correctAnswerIndex;

  const getOptionStyles = (index: number) => {
    const base = "w-full text-left p-4 rounded-xl border transition-all font-medium ";

    if (!isAnswered) {
      return base + "border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer";
    }

    // Highlight the right answer in green regardless of what the user picked
    if (index === trivia?.correctAnswerIndex) {
      return base + "border-green-500 bg-green-50 text-green-900";
    }

    // Highlight the user's wrong selection in red
    if (index === selectedIndex) {
      return base + "border-red-500 bg-red-50 text-red-900";
    }

    return base + "border-gray-200 opacity-50";
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 rounded w-1/4" />
        <div className="h-6 bg-gray-200 rounded w-3/4" />
        <div className="space-y-3 pt-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !trivia) {
    return (
      <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-red-100 text-center space-y-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchQuestion}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-md border border-gray-100 space-y-6">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-blue-600">
        <span>{topic}</span>
      </div>

      <h2 className="text-xl font-bold text-gray-900 leading-snug">
        {trivia.question}
      </h2>

      <div className="space-y-3">
        {trivia.options.map((option, index) => (
          <button
            key={index}
            disabled={isAnswered}
            onClick={() => setSelectedIndex(index)}
            className={getOptionStyles(index)}
          >
            <div className="flex items-center justify-between">
              <span>{option}</span>
              {isAnswered && index === trivia.correctAnswerIndex && (
                <span className="text-xs font-bold uppercase text-green-700">Correct</span>
              )}
              {isAnswered && index === selectedIndex && index !== trivia.correctAnswerIndex && (
                <span className="text-xs font-bold uppercase text-red-700">Your Choice</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {isAnswered && (
        <div
          className={`p-4 rounded-xl border ${
            isCorrect
              ? "bg-green-50/70 border-green-200 text-green-900"
              : "bg-amber-50/70 border-amber-200 text-amber-900"
          }`}
        >
          <p className="font-bold mb-1">
            {isCorrect ? "Spot on!" : "Not quite!"}
          </p>
          <p className="text-sm leading-relaxed">{trivia.explanation}</p>
        </div>
      )}

      {isAnswered && (
        <button
          onClick={fetchQuestion}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors cursor-pointer"
        >
          Next Question →
        </button>
      )}
    </div>
  );
}
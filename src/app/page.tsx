import QuizCard from "@/components/QuizCard";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <QuizCard topic="World History" />
    </main>
  );
}
// Server-side answer key for the mandatory provider quiz.
// Never imported from client code.
export const PROVIDER_QUIZ_KEY = "provider_basics_v1";
export const PROVIDER_QUIZ_MAX = 8;
export const PROVIDER_QUIZ_PASS_SCORE = 7;

export const PROVIDER_QUIZ_ANSWERS: Record<string, string> = {
  q1: "a",
  q2: "a",
  q3: "a",
  q4: "a",
  q5: "a",
  q6: "a",
  q7: "a",
  q8: "a",
};

export function scoreQuiz(answers: Record<string, unknown>): {
  score: number;
  max: number;
  passed: boolean;
} {
  let score = 0;
  for (const [qid, correct] of Object.entries(PROVIDER_QUIZ_ANSWERS)) {
    if (String(answers?.[qid] ?? "") === correct) score += 1;
  }
  return { score, max: PROVIDER_QUIZ_MAX, passed: score >= PROVIDER_QUIZ_PASS_SCORE };
}

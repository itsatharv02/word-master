import { useEffect, useState, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import toast from "react-hot-toast";
import Cookies from "js-cookie";

type LetterState = "absent" | "present" | "correct" | "empty";

import WORDS from "../data/words.json";

const GRID_ROWS = 6;
const WORD_LEN = 5;

function pickDailySolution() {
  const IST_OFFSET_MIN = 330; // +5:30

  function toISTDate(date: Date) {
    return new Date(date.getTime() + IST_OFFSET_MIN * 60 * 1000);
  }

  // Reference start date: 16 Nov 2025 (IST midnight)
  const startIST = toISTDate(new Date(Date.UTC(2025, 10, 16)));
  const todayIST = toISTDate(new Date());

  // Only compare Y/M/D (remove hours)
  const start = new Date(
    startIST.getFullYear(),
    startIST.getMonth(),
    startIST.getDate()
  );
  const today = new Date(
    todayIST.getFullYear(),
    todayIST.getMonth(),
    todayIST.getDate()
  );

  const diffTime = today.getTime() - start.getTime();
  const dayIndex = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const idx = ((dayIndex % WORDS.length) + WORDS.length) % WORDS.length;
  return WORDS[idx];
}

function evaluateGuess(guess: string, solution: string): LetterState[] {
  // classic Wordle evaluation: first mark correct, then present, then absent
  const result: LetterState[] = Array(WORD_LEN).fill("absent");
  const solChars = solution.split("");

  // First pass: correct
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === solChars[i]) {
      result[i] = "correct";
      solChars[i] = ""; // consume
    }
  }

  // Second pass: present
  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === "correct") continue;
    const idx = solChars.indexOf(guess[i]);
    if (idx > -1) {
      result[i] = "present";
      solChars[idx] = ""; // consume
    } else {
      result[i] = "absent";
    }
  }

  return result;
}

export default function WordleClone() {
  const solution = pickDailySolution();
  const [showDailyPopup, setShowDailyPopup] = useState(false);
  const [guesses, setGuesses] = useState<string[]>([]); // completed guesses
  const [rowsState, setRowsState] = useState<LetterState[][]>(
    Array(GRID_ROWS)
      .fill(null)
      .map(() => Array(WORD_LEN).fill("empty"))
  );
  const [current, setCurrent] = useState<string>("");
  const [keyboard, setKeyboard] = useState<Record<string, LetterState>>({});
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const checkedWords = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const hidden = Cookies.get("dailyPopupHidden");
    if (!hidden) {
      setShowDailyPopup(true);
    }
  }, []);

  useEffect(() => {
    // reset keyboard
    setKeyboard({});
  }, [solution]);

  useEffect(() => {
    if (won) {
      confetti({
        particleCount: 500,
        spread: 70,
        origin: { y: 0.7 },
      });
    }
  }, [won]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showDailyPopup) return; // ⛔ block input when popup is open

      const key = e.key.toUpperCase();
      if (key === "BACKSPACE") handleBackspace();
      else if (key === "ENTER") handleEnter();
      else if (/^[A-Z]$/.test(key) && key.length === 1) handleType(key);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, guesses, solution, showDailyPopup]); // ← include popup state

  const closeDailyPopup = () => {
    Cookies.set("dailyPopupHidden", "true", { expires: 1 }); // 1 day expiry
    setShowDailyPopup(false);
  };

  const handleType = useCallback(
    (letter: string) => {
      if (won || lost) return;
      if (current.length >= WORD_LEN) return;
      setCurrent((s) => (s + letter).slice(0, WORD_LEN));
    },
    [current, won, lost]
  );

  const handleBackspace = useCallback(() => {
    if (won || lost) return;
    setCurrent((s) => s.slice(0, -1));
  }, [won, lost]);

  const updateKeyboard = (guess: string, evaluation: LetterState[]) => {
    setKeyboard((prev) => {
      const copy = { ...prev };
      for (let i = 0; i < guess.length; i++) {
        const ch = guess[i];
        const state = evaluation[i];

        const currentState: LetterState | undefined = copy[ch];
        if (!currentState) copy[ch] = state;
        else if (currentState !== "correct") {
          if (state === "correct") copy[ch] = "correct";
          else if (state === "present" && currentState === "absent")
            copy[ch] = "present";
        }
      }
      return copy;
    });
  };

  const checkWordExists = async (word: string) => {
    if (checkedWords.current[word] !== undefined) {
      return checkedWords.current[word];
    }

    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`
    );

    if (!response.ok) {
      toast.error("Word does not exists");
      checkedWords.current[word] = false;
      return false;
    }

    checkedWords.current[word] = true;
    return true;
  };

  const handleEnter = useCallback(async () => {
    if (won || lost) return;
    if (current.length !== WORD_LEN) {
      toast.error("Not enough letters");
      return;
    }

    // Check if word has already been guessed
    if (guesses.includes(current)) {
      toast.error("Already guessed this word!");
      return;
    }

    const wordExists = await checkWordExists(current);

    if (!wordExists) return;

    const guess = current;
    const evaluation = evaluateGuess(guess, solution.word);

    const rowIndex = guesses.length;
    setRowsState((rs) => {
      const copy = rs.map((r) => r.slice());
      copy[rowIndex] = evaluation;
      return copy;
    });

    setGuesses((g) => [...g, guess]);
    updateKeyboard(guess, evaluation);
    setCurrent("");

    if (evaluation.every((s) => s === "correct")) {
      setWon(true);
      return;
    }

    if (guesses.length + 1 >= GRID_ROWS) {
      setLost(true);
      //   toast.error(`No more guesses — answer: ${solution.word}`);
      return;
    }
  }, [current, guesses, solution, won, lost]);

  const renderCell = (r: number, c: number) => {
    const guessIndex = r;
    const letter =
      guessIndex < guesses.length
        ? guesses[guessIndex][c]
        : guessIndex === guesses.length
        ? current[c] ?? ""
        : "";
    const state = rowsState[r][c];
    const base =
      "w-16 h-16 flex items-center justify-center border text-2xl font-bold select-none";
    const stateClass =
      state === "correct"
        ? "bg-emerald-500 text-white border-emerald-500"
        : state === "present"
        ? "bg-yellow-400 text-white border-yellow-400"
        : state === "absent"
        ? "bg-gray-700 text-white border-gray-700"
        : "bg-transparent text-white border-gray-300";
    return (
      <div key={`${r}-${c}`} className={`${base} ${stateClass} m-1 rounded-sm`}>
        {letter}
      </div>
    );
  };

  const keyboardRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  return (
    <div className="max-h-screen flex items-start justify-center  p-6">
      <div className="w-full max-w-xl">
        <main className=" p-6 rounded-lg shadow">
          <div className="grid grid-rows-6">
            {Array.from({ length: GRID_ROWS }).map((_, r) => (
              <div key={r} className="flex justify-center">
                {Array.from({ length: WORD_LEN }).map((_, c) =>
                  renderCell(r, c)
                )}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="select-none">
              {keyboardRows.map((row, idx) => (
                <div
                  key={idx}
                  className={`flex justify-center mb-2 ${
                    idx === 2 ? "ml-6" : ""
                  }`}
                >
                  {idx === 2 && (
                    <button
                      onClick={handleEnter}
                      className="px-3 py-2 bg-[#828384] mr-2 rounded border"
                    >
                      ENTER
                    </button>
                  )}
                  {row.split("").map((k) => (
                    <button
                      key={k}
                      onClick={() => handleType(k)}
                      className={`w-10 h-12 m-1 rounded-sm cursor-pointer text-sm font-semibold uppercase  flex items-center justify-center ${
                        keyboard[k] === "correct"
                          ? "bg-emerald-500 text-white"
                          : keyboard[k] === "present"
                          ? "bg-yellow-400 text-white"
                          : keyboard[k] === "absent"
                          ? "bg-gray-500 text-white"
                          : "bg-[#828384]"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                  {idx === 2 && (
                    <button
                      onClick={handleBackspace}
                      className="px-3 bg-[#828384] py-2 ml-2 rounded border"
                    >
                      ⌫
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>

        {(won || lost) && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
            <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md">
              <h2 className="text-xl font-semibold mb-2">
                {won ? "You Cracked It! 🎉" : "Better Luck Next Time! 💡"}
              </h2>
              <p className="text-gray-600 mb-4">
                <strong>Word:</strong> {solution.word}
                <br />
                <strong>Meaning:</strong> {solution.meaning}
                <br />
                <strong>Example:</strong> {solution.example}
              </p>
              <p className="text-gray-500">
                Come back tomorrow to learn a new word! 🌟
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setWon(false);
                    setLost(false);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showDailyPopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
            <div className="bg-white rounded-xl p-8 w-full max-w-lg shadow-xl relative max-h-[90vh] overflow-y-auto">
              {/* Close button */}
              <button
                onClick={closeDailyPopup}
                className="absolute cursor-pointer top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* Title */}
              <h2 className="text-3xl font-bold mb-2">How To Play</h2>
              <p className="text-lg text-gray-700 mb-6">
                Guess the Wordle in 6 tries.
              </p>

              {/* Rules */}
              <ul className="space-y-2 mb-6">
                <li className="text-gray-700">
                  <span className="inline-block w-2 h-2 bg-gray-700 rounded-full mr-2"></span>
                  Each guess must be a valid 5-letter word.
                </li>
                <li className="text-gray-700">
                  <span className="inline-block w-2 h-2 bg-gray-700 rounded-full mr-2"></span>
                  The color of the tiles will change to show how close your
                  guess was to the word.
                </li>
              </ul>

              {/* Examples */}
              <h3 className="text-xl font-bold mb-4">Examples</h3>

              {/* Example 1 */}
              <div className="mb-6">
                <div className="flex gap-1 mb-3">
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold bg-green-600 text-white">
                    W
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    O
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    R
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    D
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    Y
                  </div>
                </div>
                <p className="text-gray-700">
                  <span className="font-bold">W</span> is in the word and in the
                  correct spot.
                </p>
              </div>

              {/* Example 2 */}
              <div className="mb-6">
                <div className="flex gap-1 mb-3">
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    L
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-yellow-500">
                    I
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    G
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    H
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    T
                  </div>
                </div>
                <p className="text-gray-700">
                  <span className="font-bold">I</span> is in the word but in the
                  wrong spot.
                </p>
              </div>

              {/* Example 3 */}
              <div className="mb-6">
                <div className="flex gap-1 mb-3">
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    R
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    O
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    G
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-500">
                    U
                  </div>
                  <div className="w-12 h-12 border-2 border-gray-300 flex items-center justify-center text-2xl font-bold text-white bg-gray-700">
                    E
                  </div>
                </div>
                <p className="text-gray-700">
                  <span className="font-bold">U</span> is not in the word in any
                  spot.
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-300 my-6"></div>

              {/* Footer note */}
              <p className="text-sm text-gray-600">
                A new puzzle is released daily at midnight.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

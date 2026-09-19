import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Card, DailyCounts, Grade, ReviewMode, Settings, Word } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import * as repo from '../data/repository';

interface StoreState {
  ready: boolean;
  words: Word[];
  cards: Card[];
  settings: Settings;
  counts: DailyCounts;
}

interface StoreValue extends StoreState {
  wordsById: Map<string, Word>;
  cardsById: Map<string, Card>;
  addWord: (input: repo.WordInput) => Promise<Word>;
  updateWord: (word: Word) => Promise<void>;
  deleteWord: (wordId: string) => Promise<void>;
  setWordSuspended: (wordId: string, suspended: boolean) => Promise<void>;
  answer: (card: Card, grade: Grade, mode?: ReviewMode) => Promise<Card>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>({
    ready: false,
    words: [],
    cards: [],
    settings: DEFAULT_SETTINGS,
    counts: { date: repo.dayKey(Date.now()), newIntroduced: 0, reviewsDone: 0 },
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [words, cards, settings, counts] = await Promise.all([
        repo.listWords(),
        repo.listCards(),
        repo.loadSettings(),
        repo.getDailyCounts(),
      ]);
      if (!cancelled) setState({ ready: true, words, cards, settings, counts });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addWord = useCallback(async (input: repo.WordInput) => {
    const word = await repo.addWord(input);
    const cards = await repo.listCards();
    setState((previous) => ({ ...previous, words: [...previous.words, word], cards }));
    return word;
  }, []);

  const updateWord = useCallback(async (word: Word) => {
    await repo.updateWord(word);
    setState((previous) => ({
      ...previous,
      words: previous.words.map((candidate) => (candidate.id === word.id ? word : candidate)),
    }));
  }, []);

  const deleteWord = useCallback(async (wordId: string) => {
    await repo.deleteWord(wordId);
    setState((previous) => ({
      ...previous,
      words: previous.words.filter((word) => word.id !== wordId),
      cards: previous.cards.filter((card) => card.wordId !== wordId),
    }));
  }, []);

  const setWordSuspended = useCallback(async (wordId: string, suspended: boolean) => {
    await repo.setWordSuspended(wordId, suspended);
    setState((previous) => ({
      ...previous,
      cards: previous.cards.map((card) => (card.wordId === wordId ? { ...card, suspended } : card)),
    }));
  }, []);

  const answer = useCallback(async (card: Card, grade: Grade, mode: ReviewMode = 'reveal') => {
    const result = await repo.recordAnswer(card, grade, mode);
    setState((previous) => ({
      ...previous,
      cards: previous.cards.map((candidate) =>
        candidate.id === result.card.id ? result.card : candidate,
      ),
      counts: result.counts,
    }));
    return result.card;
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...state.settings, ...patch };
      setState((previous) => ({ ...previous, settings: next }));
      await repo.saveSettings(next);
    },
    [state.settings],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      wordsById: new Map(state.words.map((word) => [word.id, word])),
      cardsById: new Map(state.cards.map((card) => [card.id, card])),
      addWord,
      updateWord,
      deleteWord,
      setWordSuspended,
      answer,
      updateSettings,
    }),
    [state, addWord, updateWord, deleteWord, setWordSuspended, answer, updateSettings],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore doit être utilisé dans un StoreProvider');
  return store;
}

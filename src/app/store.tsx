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
import { attachImage } from '../data/imageStore';
import type { ImageCandidate } from '../domain/images';

interface StoreState {
  ready: boolean;
  words: Word[];
  cards: Card[];
  settings: Settings;
  counts: DailyCounts;
  /** Mots disposant d'une image, pour l'afficher sans interroger la base à chaque ligne. */
  imagedWordIds: string[];
}

interface StoreValue extends StoreState {
  wordsById: Map<string, Word>;
  cardsById: Map<string, Card>;
  hasImage: (wordId: string) => boolean;
  setWordImage: (wordId: string, candidate: ImageCandidate) => Promise<void>;
  removeWordImage: (wordId: string) => Promise<void>;
  addWord: (input: repo.WordInput) => Promise<Word>;
  updateWord: (word: Word) => Promise<void>;
  deleteWord: (wordId: string) => Promise<void>;
  setWordSuspended: (wordId: string, suspended: boolean) => Promise<void>;
  answer: (card: Card, grade: Grade, mode?: ReviewMode) => Promise<Card>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** Relit tout depuis le stockage — après une restauration de sauvegarde. */
  reload: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>({
    ready: false,
    words: [],
    cards: [],
    settings: DEFAULT_SETTINGS,
    counts: { date: repo.dayKey(Date.now()), newIntroduced: 0, reviewsDone: 0 },
    imagedWordIds: [],
  });

  const reload = useCallback(async () => {
    const [words, cards, settings, counts, imagedWordIds] = await Promise.all([
      repo.listWords(),
      repo.listCards(),
      repo.loadSettings(),
      repo.getDailyCounts(),
      repo.listImagedWordIds(),
    ]);
    setState({ ready: true, words, cards, settings, counts, imagedWordIds });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      imagedWordIds: previous.imagedWordIds.filter((id) => id !== wordId),
    }));
  }, []);

  const setWordImage = useCallback(async (wordId: string, candidate: ImageCandidate) => {
    await attachImage(wordId, candidate);
    setState((previous) => ({
      ...previous,
      imagedWordIds: previous.imagedWordIds.includes(wordId)
        ? previous.imagedWordIds
        : [...previous.imagedWordIds, wordId],
    }));
  }, []);

  const removeWordImage = useCallback(async (wordId: string) => {
    await repo.deleteImage(wordId);
    setState((previous) => ({
      ...previous,
      imagedWordIds: previous.imagedWordIds.filter((id) => id !== wordId),
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
      hasImage: (wordId: string) => state.imagedWordIds.includes(wordId),
      setWordImage,
      removeWordImage,
      addWord,
      updateWord,
      deleteWord,
      setWordSuspended,
      answer,
      updateSettings,
      reload,
    }),
    [
      state,
      addWord,
      updateWord,
      deleteWord,
      setWordSuspended,
      answer,
      updateSettings,
      reload,
      setWordImage,
      removeWordImage,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore doit être utilisé dans un StoreProvider');
  return store;
}

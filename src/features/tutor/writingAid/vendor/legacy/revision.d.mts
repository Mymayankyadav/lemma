export function makeRevision(phrases: unknown, veto: unknown, config: unknown): {
  predict(text: string, options: {
    surface: 'ghost'; origin: 'learner'; authoredText: string;
  }): {ghost: {suffix: string} | null};
};

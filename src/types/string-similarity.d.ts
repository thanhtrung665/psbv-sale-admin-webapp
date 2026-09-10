declare module 'string-similarity' {
  interface CompareTwoStringsResult {
    score: number;
  }

  interface FindBestMatchResult {
    ratings: Array<{ target: string; rating: number }>;
    bestMatch: { target: string; rating: number };
    bestMatchIndex: number;
  }

  function compareTwoStrings(string1: string, string2: string): number;
  function findBestMatch(mainString: string, targetStrings: string[]): FindBestMatchResult;
  function findBestMatch(mainString: string, targetStrings: string[]): FindBestMatchResult;

  const stringSimilarity: {
    compareTwoStrings: typeof compareTwoStrings;
    findBestMatch: typeof findBestMatch;
    compareTwoStrings: (s1: string, s2: string) => number;
    findBestMatch: (main: string, targets: string[]) => FindBestMatchResult;
  };

  export default stringSimilarity;
  export { compareTwoStrings, findBestMatch, FindBestMatchResult };
}

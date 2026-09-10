const PROFANITY = /(?<![\p{L}\p{N}])([ёе]б(?:а|и|у|л|н|т|уч|ош|ы)|бля(?:д|т)|пизд|ху(?:й|я|е|ё|и|ю)|муд(?:ак|ил)|долбо[ёе]б|за(?:е|ё)б|на(?:е|ё)б|вы(?:е|ё)б|у(?:е|ё)б|сук(?:а|и|у|ой|е))(?:[\p{L}]*)/giu;

export function maskProfanity(value: string) {
  return value.replace(PROFANITY, (word) => {
    const letters = Array.from(word);
    if (letters.length < 3) return "*".repeat(letters.length);
    return letters[0] + "*".repeat(letters.length - 2) + letters[letters.length - 1];
  });
}

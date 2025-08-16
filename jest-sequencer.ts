import Sequencer from "@jest/test-sequencer";
import type { Test } from "@jest/test-result";

class CustomSequencer extends Sequencer {
  sort(tests: Test[]): Test[] {
    const copyTests = Array.from(tests);
    const integrationTests = copyTests.filter((test) =>
      test.path.includes("integration.test"),
    );
    const unitTests = copyTests.filter(
      (test) => !test.path.includes("integration.test"),
    );

    // Shuffle tests but run integration tests afterwards so we have coverage files
    this.shuffleArray(unitTests);
    this.shuffleArray(integrationTests);
    return [...unitTests, ...integrationTests];
  }

  // Fisher-Yates shuffle algorithm
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

export default CustomSequencer;

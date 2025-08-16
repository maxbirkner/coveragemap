import * as core from '@actions/core';

export interface ActionInputs {
  lcovFile: string;
  coverageThreshold: string;
}

export function getInputs(): ActionInputs {
  const lcovFile = core.getInput('lcov-file') || 'No LCOV file specified';
  const coverageThreshold = core.getInput('coverage-threshold') || 'No threshold specified';

  return {
    lcovFile,
    coverageThreshold
  };
}

async function run(): Promise<void> {
  try {
    core.info('Hello World from Coverage Treemap Action!');

    // Get inputs if provided
    const inputs = getInputs();

    core.info(`📁 LCOV file input: ${inputs.lcovFile}`);
    core.info(`🎯 Coverage threshold input: ${inputs.coverageThreshold}`);

    core.info('✅ Hello World action completed successfully!');

  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();

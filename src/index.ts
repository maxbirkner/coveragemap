import * as core from '@actions/core';

async function run(): Promise<void> {
  try {
    core.info('Hello World from Coverage Treemap Action!');

    // Get inputs if provided
    const lcovFile = core.getInput('lcov-file') || 'No LCOV file specified';
    const coverageThreshold = core.getInput('coverage-threshold') || 'No threshold specified';

    core.info(`📁 LCOV file input: ${lcovFile}`);
    core.info(`🎯 Coverage threshold input: ${coverageThreshold}`);

    core.info('✅ Hello World action completed successfully!');

  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();

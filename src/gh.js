const core = require('@actions/core');
const github = require('@actions/github');
const _ = require('lodash');
const config = require('./config');

// use the unique label to find the runner
// as we don't have the runner's id, it's not possible to get it in any other way
async function getRunners(names) {
  const octokit = github.getOctokit(config.input.githubToken);

  try {
    const runners = await octokit.paginate('GET /repos/{owner}/{repo}/actions/runners', config.githubContext);
    const foundRunners = runners.filter((r) => names.includes(r.name));
    core.info(`Found GitHub runners ${JSON.stringify(foundRunners, null, 2)}`);
    return foundRunners;
  } catch (error) {
    core.error(`No GitHub runners found: ${error}`);
    return null;
  }
}

// get GitHub Registration Token for registering a self-hosted runner
async function getRegistrationToken() {
  const octokit = github.getOctokit(config.input.githubToken);

  try {
    const response = await octokit.request('POST /repos/{owner}/{repo}/actions/runners/registration-token', config.githubContext);
    core.info('GitHub Registration Token is received');
    return response.data.token;
  } catch (error) {
    core.error(`GitHub Registration Token receiving error: ${error}`);
    throw error;
  }
}

async function removeRunners(names) {
  const runners = await getRunners(names);
  const octokit = github.getOctokit(config.input.githubToken);

  // skip the runner removal process if the runner is not found
  if (!runners) {
    core.info(`GitHub self-hosted runners are not found, so the removal is skipped`);
    return;
  }
  for (const runner of runners) {
    try {
      await octokit.request('DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}', _.merge(config.githubContext, { runner_id: runner.id }));
      core.info(`GitHub self-hosted runner ${runner.name} is removed`);
      return;
    } catch (error) {
      core.error(`GitHub self-hosted runner removal error: ${error}`);
    }
  }
}

async function waitForRunnersRegistered(runnerNames) {
  const timeoutMinutes = 5;
  const retryIntervalSeconds = 10;
  const readyRunnerNames = [];
  let waitSeconds = 0;

  core.info(`Checking every ${retryIntervalSeconds}s if the GitHub self-hosted runner is registered`);

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      if (waitSeconds > timeoutMinutes * 60) {
        core.error('GitHub self-hosted runner registration error');
        clearInterval(interval);
        reject(
          `A timeout of ${timeoutMinutes} minutes is exceeded. Your AWS EC2 instance was not able to register itself in GitHub as a new self-hosted runner.`
        );
      }

      core.info('Checking...');

      waitSeconds += retryIntervalSeconds;

      const runners = await getRunners(runnerNames);

      core.info(`Expected runners: ${JSON.stringify(runnerNames)}`);

      for (const runner of runners) {
        if (runner.status === 'online') {
          core.info(`GitHub self-hosted runner ${runner.name} is ready.`);
          if (!readyRunnerNames.includes(runner.name)) {
            readyRunnerNames.push(runner.name);
          }
        }
      }

      if (readyRunnerNames.length === runnerNames.length) {
        core.info(`All GitHub self-hosted runners are registered and ready to use.`);
        clearInterval(interval);
        resolve();
      } else {
        core.info(`Ready runners: ${JSON.stringify(readyRunnerNames)}`);
      }
    }, retryIntervalSeconds * 1000);
  });
}

module.exports = {
  getRegistrationToken,
  removeRunners,
  waitForRunnersRegistered,
};

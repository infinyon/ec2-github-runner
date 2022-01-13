const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

async function startInstance(label, index, githubRegistrationToken, instanceIds) {
  const ec2InstanceId = await aws.startEc2Instance(label, index, githubRegistrationToken);
  instanceIds.push(ec2InstanceId);
  await aws.waitForInstanceRunning(ec2InstanceId);
  await gh.waitForRunnerRegistered(`${label}-${index}`);
  return ec2InstanceId;
}

async function start() {
  core.info('config.stateLabel' + config.stateLabel);
  core.info('config.stateInstanceIds' + config.stateInstanceIds);

  const label = config.input.label;
  core.setOutput(config.stateLabel, label);
  core.saveState(config.stateLabel, label);
  const githubRegistrationToken = await gh.getRegistrationToken();

  let instancePromises = [];
  let instanceIds = [];
  for (let i = 1; i <= config.input.count; i++) {
    instancePromises.push(startInstance(label, i, githubRegistrationToken, instanceIds));
  }

  await Promise.all(instancePromises);
  core.saveState(config.stateInstanceIds, JSON.stringify(instanceIds));
}

async function stop() {
  try {
    const label = core.getState(config.stateLabel);
    const instanceIdsJson = core.getState(config.stateInstanceIds);

    let promises = [];

    if (instanceIdsJson) {
      const instanceIds = JSON.parse(instanceIdsJson);
      instanceIds.forEach((instanceId) => {
        promises.push(aws.terminateEc2Instance(instanceId));
      });
    }

    if (label) {
      for (let step = 1; step <= config.input.count; step++) {
        promises.push(gh.removeRunner(`${label}-${step}`));
      }
    }

    await Promise.all(promises);
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();

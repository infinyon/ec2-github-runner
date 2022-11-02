const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

async function startInstances(label, count, githubRegistrationToken) {
  const ec2InstanceIds = await aws.startEc2Instances(label, count, githubRegistrationToken);
  const waitForRunnersRegisteredPromise = gh.waitForRunnersRegistered(ec2InstanceIds);
  await aws.waitForInstancesRunning(ec2InstanceIds);
  await waitForRunnersRegisteredPromise;
  return ec2InstanceIds;
}

async function start() {
  const label = config.input.label;
  const count = config.input.count;

  const githubRegistrationToken = await gh.getRegistrationToken();

  const instanceIds = await startInstances(label, count, githubRegistrationToken);

  core.setOutput('label', label);
  core.setOutput('instance-ids', JSON.stringify(instanceIds));
}

async function stop() {
  try {
    const label = config.input.label;
    const instanceIds = JSON.parse(config.input.ec2InstanceId);

    await aws.terminateEc2Instances(instanceIds);
    await gh.removeRunners(label);
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

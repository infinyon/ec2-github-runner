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

  const ec2InstanceIds = await startInstances(label, count, githubRegistrationToken);

  core.setOutput('label', label);
  core.setOutput('ec2-instance-ids', JSON.stringify(ec2InstanceIds));
}

async function stop() {
  try {
    const ec2InstanceIds = JSON.parse(config.input.ec2InstanceIds);

    await aws.terminateEc2Instances(ec2InstanceIds);
    await gh.removeRunners(ec2InstanceIds);
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

const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label) {
  if (config.input.runnerHomeDir && config.input.runnerUser) {
    return [
      '#!/bin/bash -xe',
      `cd "${config.input.runnerHomeDir}"`,
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      'export EC2_INSTANCE_ID="`wget -q -O - http://169.254.169.254/latest/meta-data/instance-id || die "wget instance-id has failed: $?"`"',
      `sudo -u ${config.input.runnerUser} ./config.sh --unattended --name $EC2_INSTANCE_ID --ephemeral --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
      `sudo -u ${config.input.runnerUser} timeout 30m ./run.sh || systemctl poweroff`,
      'systemctl poweroff',
    ];
  } else if (config.input.runnerHomeDir) {
    // If runner home directory is specified, we expect the actions-runner software (and dependencies)
    // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
    return [
      '#!/bin/bash -xe',
      `cd "${config.input.runnerHomeDir}"`,
      'export RUNNER_ALLOW_RUNASROOT=1',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      'export EC2_INSTANCE_ID="`wget -q -O - http://169.254.169.254/latest/meta-data/instance-id || die "wget instance-id has failed: $?"`"',
      `./config.sh --unattended --name $EC2_INSTANCE_ID --ephemeral --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
      'timeout 30m ./run.sh || systemctl poweroff',
      'systemctl poweroff',
    ];
  } else {
    return [
      '#!/bin/bash -xe',
      'mkdir actions-runner && cd actions-runner',
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      'curl -O -L https://github.com/actions/runner/releases/download/v2.280.3/actions-runner-linux-${RUNNER_ARCH}-2.280.3.tar.gz',
      'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.280.3.tar.gz',
      'export RUNNER_ALLOW_RUNASROOT=1',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      'export EC2_INSTANCE_ID="`wget -q -O - http://169.254.169.254/latest/meta-data/instance-id || die "wget instance-id has failed: $?"`"',
      `./config.sh --unattended --name $EC2_INSTANCE_ID --ephemeral --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
      'timeout 30m  ./run.sh || systemctl poweroff',
      'systemctl poweroff',
    ];
  }
}

async function startEc2Instances(label, count, githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  const userData = buildUserDataScript(githubRegistrationToken, label);

  const params = {
    ImageId: config.input.ec2ImageId,
    InstanceType: config.input.ec2InstanceType,
    MinCount: count,
    MaxCount: count,
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
    SubnetId: config.input.subnetId,
    SecurityGroupIds: [config.input.securityGroupId],
    IamInstanceProfile: { Name: config.input.iamRoleName },
    TagSpecifications: config.tagSpecifications,
    InstanceMarketOptions: {
      MarketType: 'spot',
    },
  };

  try {
    const result = await ec2.runInstances(params).promise();
    const ec2InstanceIds = result.Instances.flatMap((i) => i.InstanceId);
    core.info(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} have started`);
    return ec2InstanceIds;
  } catch (error) {
    core.error('AWS EC2 instance starting error');
    throw error;
  }
}

async function terminateEc2Instances(ec2InstanceIds) {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: ec2InstanceIds,
  };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} are terminated`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} termination error`);
    throw error;
  }
}

async function waitForInstancesRunning(ec2InstanceIds) {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: ec2InstanceIds,
  };

  try {
    await ec2.waitFor('instanceRunning', params).promise();
    core.info(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} are up and running`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances ${JSON.stringify(ec2InstanceIds)} initialization error`);
    throw error;
  }
}

module.exports = {
  startEc2Instances,
  terminateEc2Instances,
  waitForInstancesRunning,
};

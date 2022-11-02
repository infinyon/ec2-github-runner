const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      count: core.getInput('count'),
      ec2ImageId: core.getInput('ec2-image-id'),
      ec2InstanceType: core.getInput('ec2-instance-type'),
      subnetId: core.getInput('subnet-id'),
      securityGroupId: core.getInput('security-group-id'),
      label: core.getInput('label'),
      ec2InstanceIds: core.getInput('ec2-instance-ids'),
      iamRoleName: core.getInput('iam-role-name'),
      runnerHomeDir: core.getInput('runner-home-dir'),
      runnerUser: core.getInput('runner-user'),
    };

    const tags = JSON.parse(core.getInput('aws-resource-tags'));
    this.tagSpecifications = null;
    if (tags.length > 0) {
      this.tagSpecifications = [
        { ResourceType: 'instance', Tags: tags },
        { ResourceType: 'volume', Tags: tags },
      ];
    }

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    //
    // validate input
    //

    if (!this.input.mode) {
      this.input.mode = 'start';
    }

    if (!this.input.githubToken) {
      throw new Error(`The 'github-token' input is not specified`);
    }

    if (!this.input.count) {
      this.input.count = 1;
    }

    if (this.input.mode === 'start' && !this.input.label) {
      this.input.label = Math.random().toString(36).substr(2, 5);
    }

    if (this.input.mode === 'stop') {
      if (!this.input.label) {
        throw new Error(`The 'label' input is not specified`);
      }
      if (!this.input.ec2InstanceIds) {
        throw new Error(`The 'ec2-instance-ids' input is not specified`);
      }
    }
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}

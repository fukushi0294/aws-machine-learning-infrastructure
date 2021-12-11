import * as cdk from '@aws-cdk/core';
import { NetworkStack } from './network';
import { ComputeStack } from './compute';
import { EMRStudioStack } from './compute/emr';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const network = new NetworkStack(this, 'NetworkResource', {
      vpcCidr: "10.0.0.0/16"
    })
    
    const cluserAdminUsers = this.node.tryGetContext('eks_admin') as string[]
    const compute = new ComputeStack(this, 'ComputeResource', {
      vpc: network.vpc,
      sparkNamespace: 'spark',
      clusterAdmin: cluserAdminUsers
    });
    compute.addDependency(network);

    const emrStudio = new EMRStudioStack(this, 'EMRWorkSpace', {
      vpc: network.vpc,
    });
    emrStudio.addDependency(network);
  }
}

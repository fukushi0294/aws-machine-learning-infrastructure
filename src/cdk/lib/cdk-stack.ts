import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'MainVPC', {
      cidr: "10.0.0.0/16",
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'private-subnet-1',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24,
        },
        {
          name: 'public-subnet-1',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });
    const mainCluster = new eks.FargateCluster(this, 'MainEKSFargate', {
      version: eks.KubernetesVersion.V1_21,
      vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }],
    });

    const cluserAdminUsers = this.node.tryGetContext('eks_admin') as string[]
    cluserAdminUsers.forEach(user=> {
      const clusterAdimnUser = iam.User.fromUserAttributes(this, 'ClusterAdminUser', {
        userArn: `arn:aws:iam::${this.account}:user/${user}`,
      });
      mainCluster.awsAuth.addUserMapping(clusterAdimnUser, { groups: [ 'system:masters' ]});
    });
  }
}

import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';
import * as emrcontainers from '@aws-cdk/aws-emrcontainers';
import * as yaml from 'js-yaml';
import path = require('path');
import fs = require('fs');

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

    const emrRoleText = fs.readFileSync(path.resolve(__dirname, "./manifest/role.yaml"), 'utf8');
    const emrRole = mainCluster.addManifest('EMRRole', yaml.loadAll(emrRoleText));
    const emrRoleBindingText =  fs.readFileSync(path.resolve(__dirname, "./manifest/rolebinding.yaml"), 'utf8');
    const emrRoleBinding = mainCluster.addManifest('EMRRoleBinding', yaml.loadAll(emrRoleBindingText));
    emrRoleBinding.node.addDependency(emrRole);

    const emrServiceRoleArn = `arn:aws:iam::${this.account}:role/AWSServiceRoleForAmazonEMRContainers`
    const emrSvcRole = iam.Role.fromRoleArn(this, 'EmrSvcRole', emrServiceRoleArn, {
      mutable: false
    });
    mainCluster.awsAuth.addRoleMapping(emrSvcRole, {
      groups: [],
      username: 'emr-containers'
    });
    const jobRole = new iam.Role(this, "EMR_EKS_Job_Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSGlueConsoleFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchFullAccess")
      ]
    });
    jobRole.assumeRolePolicy?.addStatements(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRoleWithWebIdentity"],
        principals: [new iam.OpenIdConnectPrincipal(mainCluster.openIdConnectProvider, {
          StringLike: new cdk.CfnJson(this, 'ConditionJsonAud', {
            value: {
              [`${mainCluster.clusterOpenIdConnectIssuer}:aud`] : "sts.amazon.com"
            }
          }) 
        })]
      })
    );
    
    const cfnVirtualCluster = new emrcontainers.CfnVirtualCluster(this, 'EMRCluster', {
      containerProvider: {
        id: mainCluster.clusterName,
        info: {
          eksInfo: {
            namespace: 'default',
          },
        },
        type: 'EKS',
      },
      name: 'EMRCluster',
    });
  }
}

import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';
import * as emrcontainers from '@aws-cdk/aws-emrcontainers';

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

    const emrRole = mainCluster.addManifest('EMRRole', {
      apiVersion:"rbac.authorization.k8s.io/v1",
      kind:"Role",
      metadata:{name: "emr-containers", namespace: "default"},
      rules: [
          {apiGroups: [""], resources:["namespaces"],verbs:["get"]},
          {apiGroups: [""], resources:["serviceaccounts", "services", "configmaps", "events", "pods", "pods/log"],verbs:["get", "list", "watch", "describe", "create", "edit", "delete", "deletecollection", "annotate", "patch", "label"]},
          {apiGroups: [""], resources:["secrets"],verbs:["create", "patch", "delete", "watch"]},
          {apiGroups: ["apps"], resources:["statefulsets", "deployments"],verbs:["get", "list", "watch", "describe", "create", "edit", "delete", "annotate", "patch", "label"]},
          {apiGroups: ["batch"], resources:["jobs"],verbs:["get", "list", "watch", "describe", "create", "edit", "delete", "annotate", "patch", "label"]},
          {apiGroups: ["extensions"], resources:["ingresses"],verbs:["get", "list", "watch", "describe", "create", "edit", "delete", "annotate", "patch", "label"]},
          {apiGroups: ["rbac.authorization.k8s.io"], resources:["roles", "rolebindings"],verbs:["get", "list", "watch", "describe", "create", "edit", "delete", "deletecollection", "annotate", "patch", "label"]}
      ]
    });
    const emrRoleBinding = mainCluster.addManifest('EMRRoleBinding',  {
      apiVersion:"rbac.authorization.k8s.io/v1",
      kind:"RoleBinding",
      metadata:{name: "emr-containers", namespace: "default"},
      subjects:[{kind: "User",name:"emr-containers",apiGroup: "rbac.authorization.k8s.io"}],
      roleRef:{kind:"Role",name:"emr-containers",apiGroup: "rbac.authorization.k8s.io"}
    });
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
        principals: [new iam.WebIdentityPrincipal(`arn:aws:iam::${this.account}:oidc-provider/${mainCluster.clusterOpenIdConnectIssuer}`, {
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

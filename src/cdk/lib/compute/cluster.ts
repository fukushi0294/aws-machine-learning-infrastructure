import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as eks from '@aws-cdk/aws-eks';
import * as iam from '@aws-cdk/aws-iam';
import * as emrcontainers from '@aws-cdk/aws-emrcontainers';

interface ComputeStackProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc
  clusterAdmin: string[]
  sparkNamespace: string
}

export class ComputeStack extends cdk.NestedStack {
  public readonly mainCluster: eks.Cluster
  public readonly sparkExecutionJobRole : iam.Role
  public readonly emrVirtualCluster: emrcontainers.CfnVirtualCluster

  constructor(scope: cdk.Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.mainCluster = new eks.Cluster(
      this, 'MainCluster', {
          version: eks.KubernetesVersion.V1_21,
          vpc: props.vpc,
          vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT }],
          defaultCapacity: 2,
          defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
          albController: {
            version: eks.AlbControllerVersion.V2_3_0,
          },
      }
    );

    props.clusterAdmin.forEach(user=> {
      const clusterAdimnUser = iam.User.fromUserAttributes(this, 'ClusterAdminUser', {
        userArn: `arn:aws:iam::${this.account}:user/${user}`,
      });
      this.mainCluster.awsAuth.addUserMapping(clusterAdimnUser, { groups: [ 'system:masters' ]});
    });

    const sparkNS = this.mainCluster.addManifest('SparkNamespace', {
      apiVersion:"v1",
      kind:"Namespace",
      metadata:{name: props.sparkNamespace},
    });

    const emrRole = this.mainCluster.addManifest('EMRRole', {
      apiVersion:"rbac.authorization.k8s.io/v1",
      kind:"Role",
      metadata:{name: "emr-containers", namespace: props.sparkNamespace},
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
    emrRole.node.addDependency(sparkNS);
    const emrRoleBinding = this.mainCluster.addManifest('EMRRoleBinding',  {
      apiVersion:"rbac.authorization.k8s.io/v1",
      kind:"RoleBinding",
      metadata:{name: "emr-containers", namespace: props.sparkNamespace},
      subjects:[{kind: "User",name:"emr-containers",apiGroup: "rbac.authorization.k8s.io"}],
      roleRef:{kind:"Role",name:"emr-containers",apiGroup: "rbac.authorization.k8s.io"}
    });
    emrRoleBinding.node.addDependency(emrRole);

    const emrServiceRoleArn = `arn:aws:iam::${this.account}:role/AWSServiceRoleForAmazonEMRContainers`
    const emrSvcRole = iam.Role.fromRoleArn(this, 'EmrSvcRole', emrServiceRoleArn, {
      mutable: false
    });
    this.mainCluster.awsAuth.addRoleMapping(emrSvcRole, {
      groups: [],
      username: 'emr-containers'
    });
    this.sparkExecutionJobRole = new iam.Role(this, "EMR_EKS_Job_Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSGlueConsoleFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchFullAccess")
      ]
    });

    this.sparkExecutionJobRole.assumeRolePolicy?.addStatements(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRoleWithWebIdentity"],
        principals: [new iam.WebIdentityPrincipal(`arn:aws:iam::${this.account}:oidc-provider/${this.mainCluster.clusterOpenIdConnectIssuer}`, {
          StringLike: new cdk.CfnJson(this, 'ConditionJson', {
            value: {
              [`${this.mainCluster.clusterOpenIdConnectIssuer}:sub`] : `system:serviceaccount:emr:emr-containers-sa-*-*-${this.account}-*`
            }
          }),
          StringEquals: new cdk.CfnJson(this, 'ConditionJsonAud', {
            value: {
              [`${this.mainCluster.clusterOpenIdConnectIssuer}:aud`] : "sts.amazon.com"
            }
          })
        })]
      })
    );

    this.emrVirtualCluster = new emrcontainers.CfnVirtualCluster(this, 'EMRCluster', {
      containerProvider: {
        id: this.mainCluster.clusterName,
        info: {
          eksInfo: {
            namespace: props.sparkNamespace,
          },
        },
        type: 'EKS',
      },
      name: 'EMRCluster',
    });
    this.emrVirtualCluster.node.addDependency(sparkNS, emrRoleBinding);
  }
}

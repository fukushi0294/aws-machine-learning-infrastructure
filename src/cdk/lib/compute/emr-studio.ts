import * as cdk from '@aws-cdk/core';
import * as emr from '@aws-cdk/aws-emr';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';

interface EMRStudioStackProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc
  emrStudioAdmin: string
}

export class EMRStudioStack extends cdk.NestedStack {
  constructor(scope: cdk.Construct, id: string, props: EMRStudioStackProps){
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'EMRStudioBucket', {
      bucketName: `aws-emr-workspace-bk-${this.account}`,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true
    });

    const engineSG = new ec2.SecurityGroup(this, 'EngineSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true
    });
    const workspaceSG = new ec2.SecurityGroup(this, 'WorkspaceSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: false
    });

    workspaceSG.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "allow egress on port 443");
    workspaceSG.addEgressRule(engineSG, ec2.Port.tcp(18888), "allow egress on port 18888 to eng");
    engineSG.addIngressRule(workspaceSG, ec2.Port.tcp(18888), "allow ingress on port 18888 from ws");

    const emrStudioRole = this.initEmrStudioRole();
    const emrStudionAdminPolicy = this.initEmrStudioPolicy(emrStudioRole, bucket);
    const emrUserRole = this.initEmrUserRole(emrStudionAdminPolicy);

    const cfnStudio = new emr.CfnStudio(this, 'EMRStudio', {
      authMode: 'SSO',
      defaultS3Location: `s3://${bucket.bucketName}/studio`,
      engineSecurityGroupId: engineSG.securityGroupId,
      name: 'emr-studio',
      serviceRole: emrStudioRole.roleArn,
      subnetIds: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
      vpcId: props.vpc.vpcId,
      workspaceSecurityGroupId: workspaceSG.securityGroupId,
      userRole: emrUserRole.roleArn,
    });
    
    const cfnStudioSessionMapping = new emr.CfnStudioSessionMapping(this, 'EMRStudioSessionMapping', {
      identityName: props.emrStudioAdmin,
      identityType: 'USER',
      sessionPolicyArn: emrStudionAdminPolicy.managedPolicyArn,
      studioId: cfnStudio.attrStudioId,
    });
  }

  private initEmrStudioRole(): iam.Role {
    const emrStudioRole = new iam.Role(this, "StudioRole", {
      assumedBy: new iam.ServicePrincipal("elasticmapreduce.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
      ]
    });
    emrStudioRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      effect: iam.Effect.ALLOW,
      actions: [
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:CreateSecurityGroup",
        "ec2:CreateTags",
        "ec2:DescribeSecurityGroups",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:CreateNetworkInterface",
        "ec2:CreateNetworkInterfacePermission",
        "ec2:DeleteNetworkInterface",
        "ec2:DeleteNetworkInterfacePermission",
        "ec2:DescribeNetworkInterfaces",
        "ec2:ModifyNetworkInterfaceAttribute",
        "ec2:DescribeTags",
        "ec2:DescribeInstances",
        "ec2:DescribeSubnets",
        "ec2:DescribeVpcs",
        "elasticmapreduce:ListInstances",
        "elasticmapreduce:DescribeCluster",
        "elasticmapreduce:ListSteps"
        ]
      })
    );
    return emrStudioRole;
  }

  private initEmrStudioPolicy(emrStudioRole: iam.Role, emrStudiobBucket: s3.IBucket) : iam.ManagedPolicy {
    const policyDocument = iam.PolicyDocument.fromJson(
      {
        "Version": "2012-10-17T00:00:00.000Z",
        "Statement": [
          {
            "Action": [
              "elasticmapreduce:CreateEditor",
              "elasticmapreduce:DescribeEditor",
              "elasticmapreduce:ListEditors",
              "elasticmapreduce:StartEditor",
              "elasticmapreduce:StopEditor",
              "elasticmapreduce:DeleteEditor",
              "elasticmapreduce:OpenEditorInConsole",
              "elasticmapreduce:AttachEditor",
              "elasticmapreduce:DetachEditor",
              "elasticmapreduce:CreateRepository",
              "elasticmapreduce:DescribeRepository",
              "elasticmapreduce:DeleteRepository",
              "elasticmapreduce:ListRepositories",
              "elasticmapreduce:LinkRepository",
              "elasticmapreduce:UnlinkRepository",
              "elasticmapreduce:DescribeCluster",
              "elasticmapreduce:ListInstanceGroups",
              "elasticmapreduce:ListBootstrapActions",
              "elasticmapreduce:ListClusters",
              "elasticmapreduce:ListSteps",
              "elasticmapreduce:CreatePersistentAppUI",
              "elasticmapreduce:DescribePersistentAppUI",
              "elasticmapreduce:GetPersistentAppUIPresignedURL",
              "secretsmanager:CreateSecret",
              "secretsmanager:ListSecrets",
              "emr-containers:DescribeVirtualCluster",
              "emr-containers:ListVirtualClusters",
              "emr-containers:DescribeManagedEndpoint",
              "emr-containers:ListManagedEndpoints",
              "emr-containers:CreateAccessTokenForManagedEndpoint",
              "emr-containers:DescribeJobRun",
              "emr-containers:ListJobRuns"
            ],
            "Resource": "*",
            "Effect": "Allow",
            "Sid": "AllowBasicActions"
          },
          {
            "Action": [
              "servicecatalog:DescribeProduct",
              "servicecatalog:DescribeProductView",
              "servicecatalog:DescribeProvisioningParameters",
              "servicecatalog:ProvisionProduct",
              "servicecatalog:SearchProducts",
              "servicecatalog:UpdateProvisionedProduct",
              "servicecatalog:ListProvisioningArtifacts",
              "servicecatalog:DescribeRecord",
              "cloudformation:DescribeStackResources"
            ],
            "Resource": "*",
            "Effect": "Allow",
            "Sid": "AllowIntermediateActions"
          },
          {
            "Action": [
              "elasticmapreduce:RunJobFlow"
            ],
            "Resource": "*",
            "Effect": "Allow",
            "Sid": "AllowAdvancedActions"
          },
          {
            "Action": "iam:PassRole",
            "Resource": [
              emrStudioRole.roleArn,
              `arn:aws:iam::${this.account}:role/EMR_DefaultRole`,
              `arn:aws:iam::${this.account}:role/EMR_EC2_DefaultRole`
            ],
            "Effect": "Allow",
            "Sid": "PassRolePermission"
          },
          {
            "Action": [
              "s3:ListAllMyBuckets",
              "s3:ListBucket",
              "s3:GetBucketLocation"
            ],
            "Resource": "arn:aws:s3:::*",
            "Effect": "Allow",
            "Sid": "S3ListPermission"
          },
          {
            "Action": [
              "s3:GetObject"
            ],
            "Resource": [
              `arn:aws:s3:::${emrStudiobBucket.bucketName}/*`,
              `arn:aws:s3:::aws-logs-${this.account}-${this.region}/elasticmapreduce/*`
            ],
            "Effect": "Allow",
            "Sid": "S3GetObjectPermission"
          }
        ]
      });
      return new iam.ManagedPolicy(this, "EMRStudioAdminPolicy", {
        document: policyDocument
      });
  }

  private initEmrUserRole(emrUserPolicy: iam.ManagedPolicy): iam.Role {
    const userRole = new iam.Role(this, "StudioUserRole", {
      assumedBy: new iam.ServicePrincipal("elasticmapreduce.amazonaws.com"),
      
    });
    userRole.addManagedPolicy(emrUserPolicy)
    return userRole;
  }
}

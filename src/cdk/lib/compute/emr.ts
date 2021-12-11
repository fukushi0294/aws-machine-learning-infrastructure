import * as cdk from '@aws-cdk/core';
import * as emr from '@aws-cdk/aws-emr';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';

interface EMRStudioStackProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc
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
    const emrUserRole = this.initEmrUserRole(emrStudioRole, bucket);

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
  }

  private initEmrStudioRole(): iam.Role {
    const emrStudioRole = new iam.Role(this, "StudioRole", {
      assumedBy: new iam.ServicePrincipal("elasticmapreduce.amazonaws.com"),
    });
    emrStudioRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      effect: iam.Effect.ALLOW,
      actions: [
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:CreateSecurityGroup",
          "ec2:DescribeSecurityGroups",
          "ec2:RevokeSecurityGroupEgress",
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
    emrStudioRole.addToPolicy(new iam.PolicyStatement({
      resources: ["arn:aws:ec2:*:*:network-interface/*"],
      actions: ["ec2:CreateTags"],
      effect: iam.Effect.ALLOW,
      conditions: {"ForAllValues:StringEquals": {
        "aws:TagKeys": ["aws:elasticmapreduce:editor-id","aws:elasticmapreduce:job-flow-id"]
      }}
    }));
    emrStudioRole.addToPolicy(new iam.PolicyStatement({
      resources: ["arn:aws:s3:::*"],
      actions: [
        "s3:PutObject",
        "s3:GetObject",
        "s3:GetEncryptionConfiguration",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      effect: iam.Effect.ALLOW
    }));
    emrStudioRole.addToPolicy(new iam.PolicyStatement({
        resources: ["arn:aws:secretsmanager:*:*:secret:*"],
        actions: ["secretsmanager:GetSecretValue"],
        effect: iam.Effect.ALLOW
    }));
    return emrStudioRole;
  }

  private initEmrUserRole(emrStudioRole: iam.Role, emrStudiobBucket: s3.IBucket): iam.Role {
    const userRole = new iam.Role(this, "StudioUserRole", {
      assumedBy: new iam.ServicePrincipal("elasticmapreduce.amazonaws.com")
    });

    userRole.addToPolicy(new iam.PolicyStatement({
      actions: [
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
      resources: ["*"],
      effect: iam.Effect.ALLOW
    }));
    userRole.addToPolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: [
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
      effect: iam.Effect.ALLOW
    }));
    userRole.addToPolicy(new iam.PolicyStatement({
      resources:["*"],
      actions: ["elasticmapreduce:RunJobFlow"],
      effect: iam.Effect.ALLOW
    }));
    userRole.addToPolicy(new iam.PolicyStatement({
      resources: [
        emrStudioRole.roleArn,
        `arn:aws:iam::${this.account}:role/EMR_DefaultRole`,
        `arn:aws:iam::${this.account}:role/EMR_EC2_DefaultRole`
      ],
      actions:["iam:PassRole"],
      effect:iam.Effect.ALLOW
    }));
    userRole.addToPolicy(new iam.PolicyStatement({
      resources: ["arn:aws:s3:::*"],
      actions: [
        "s3:ListAllMyBuckets",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      effect: iam.Effect.ALLOW
    }));
    userRole.addToPolicy(new iam.PolicyStatement({
      resources: [
        `arn:aws:s3:::${emrStudiobBucket.bucketName}/*`,
        `arn:aws:s3:::aws-logs-${this.account}-${this.region}/elasticmapreduce/*`
      ],
      actions: ["s3:GetObject"],
      effect: iam.Effect.ALLOW
    }));
    return userRole;
  }
}

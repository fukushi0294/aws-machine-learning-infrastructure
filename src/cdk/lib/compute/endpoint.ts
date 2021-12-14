import * as cdk from '@aws-cdk/core';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
import * as cr from '@aws-cdk/custom-resources';
import * as emrcontainers from '@aws-cdk/aws-emrcontainers';

interface EMRClusterEndpointStackProps extends cdk.NestedStackProps {
  executionRole: iam.Role
  virtualCluster: emrcontainers.CfnVirtualCluster
}

export class EMRClusterEndpointStack extends cdk.NestedStack {
  constructor(scope: cdk.Construct, id: string, props: EMRClusterEndpointStackProps) {
    super(scope, id, props);

    const domainName = ssm.StringParameter.fromStringParameterAttributes(this, 'MainDomain', {
      parameterName: '/Main/Domain',
    }).stringValue;
    const zoneId = ssm.StringParameter.fromStringParameterAttributes(this, 'MainDomainZoneId', {
      parameterName: '/Main/ZONE_ID',
    }).stringValue;

    const myHostedZone = route53.HostedZone.fromHostedZoneId(this, 'HostedZone', zoneId);
    const cert = new acm.Certificate(this, 'Certificate', {
      domainName: `*.${domainName}`,
      validation: acm.CertificateValidation.fromDns(myHostedZone),
    });

    const customResourceManagedPolicy = new iam.ManagedPolicy(this, "EMR_on_EKS_security_group",{
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "ec2:CreateSecurityGroup",
              "ec2:RevokeSecurityGroupEgress",
              "ec2:CreateSecurityGroup",
              "ec2:DeleteSecurityGroup",
              "ec2:AuthorizeSecurityGroupEgress",
              "ec2:AuthorizeSecurityGroupIngress",
              "ec2:RevokeSecurityGroupIngress",
              "ec2:DeleteSecurityGroup"
            ],
            resources: ["*"]
          })
        ]
      }) 
    });

    const customResourceRole = new iam.Role(this, 'CreateManagedEndpointLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies : [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
        customResourceManagedPolicy
      ]
    });
    const endpoint = new cr.AwsCustomResource(this, "CreateEndpoint", {
      onCreate: {
        service: "EMRcontainers",
        action: "createManagedEndpoint",
        parameters: {
            certificateArn: cert.certificateArn,
            executionRoleArn: props.executionRole.roleArn,
            name: "spark",
            releaseLabel: "emr-6.4.0-latest",
            type: "JUPYTER_ENTERPRISE_GATEWAY",
            virtualClusterId: props.virtualCluster.attrId,
        },
        physicalResourceId: cr.PhysicalResourceId.fromResponse("arn"),
      },
      functionName: "CreateEpFn",
      role: customResourceRole,
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE})
    });
    endpoint.node.addDependency(cert);
    const onDelete = new cr.AwsCustomResource(this, "DeleteEndpoint", {
      onDelete: {
        service: "EMRcontainers",
        action: "deleteManagedEndpoint",
        parameters: {
            id: endpoint.getResponseField("id"),
            virtualClusterId: props.virtualCluster.attrId,
        },
      },
      functionName: "CreateEpFn",
      role: customResourceRole,
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE})
    });
  }
}

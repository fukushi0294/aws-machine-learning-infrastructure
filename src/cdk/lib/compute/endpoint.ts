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
    const zoneId = ssm.StringParameter.fromStringParameterAttributes(this, 'MainDomain', {
      parameterName: '/Main/ZONE_ID',
    }).stringValue;

    const myHostedZone = route53.HostedZone.fromHostedZoneId(this, 'HostedZone', zoneId);
    const cert = new acm.Certificate(this, 'Certificate', {
      domainName: `*.${domainName}`,
      validation: acm.CertificateValidation.fromDns(myHostedZone),
    });

    const endpoint = new cr.AwsCustomResource(this, "CreateEndpoint", {
      onCreate: {
        service: "EMRcontainers",
        action: "createManagedEndpoint",
        parameters: {
            certificateArn: cert.certificateArn,
            executionRoleArn: props.executionRole.roleArn,
            name: "emr-endpoint-eks-spark",
            releaseLabel: "emr-6.2.0-latest",
            type: "JUPYTER_ENTERPRISE_GATEWAY",
            virtualClusterId: props.virtualCluster.attrId,
        },
        physicalResourceId: cr.PhysicalResourceId.fromResponse("arn"),
      },
      functionName: "CreateEpFn",
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE})
    })
    endpoint.node.addDependency(cert);
  }
}

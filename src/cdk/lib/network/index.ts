import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

interface NetworkStackProps extends cdk.NestedStackProps {
  vpcCidr: string
}

export class NetworkStack extends cdk.NestedStack {
  public readonly vpc: ec2.IVpc

  constructor(scope: cdk.Construct, id: string, props?: NetworkStackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'MainVPC', {
      cidr: props?.vpcCidr,
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

    const emrEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EMREndpoint', {
      vpc: this.vpc,
      service: new ec2.InterfaceVpcEndpointService('com.amazonaws.ap-northeast-1.emr-containers')
    });
    emrEndpoint.node.addDependency(this.vpc);

    const storageEndpoint = new ec2.InterfaceVpcEndpoint(this, 'StorageEndpoint', {
      vpc: this.vpc,
      service: new ec2.InterfaceVpcEndpointService('com.amazonaws.ap-northeast-1.s3')
    });
    storageEndpoint.node.addDependency(this.vpc);
  }
}
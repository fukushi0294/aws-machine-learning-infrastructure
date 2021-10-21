terraform {
  backend "s3" {
    bucket = "aws-ml-remote-state"
    key    = "src"
    region = "ap-northeast-1"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region  = "ap-northeast-1"
  profile = "default"
}

resource "aws_s3_bucket" "hdfs" {
  bucket = "aws-ml-hdfs"
  acl    = "private"
  versioning {
    enabled = true
  }
}

module "network" {
  source             = "./network"
  vpc_cidr_block     = "10.0.0.0/16"
  public_cidr_block  = "10.0.1.0/24"
  private_cidr_block = "10.0.2.0/24"
}

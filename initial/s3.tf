terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"
  profile = "default"
}

resource "aws_s3_bucket" "remote_state" {
  bucket = "aws-ml-remote-state"
  acl    = "private"
}

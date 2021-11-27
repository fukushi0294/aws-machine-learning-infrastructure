data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "emr_bootstrap_script_bucket" {
  bucket = "emr-bootstrap-script-bucket"
  acl    = "private"
  versioning {
    enabled = true
  }
}

resource "aws_s3_bucket_object" "object" {
  bucket = aws_s3_bucket.emr_bootstrap_script_bucket.id
  key    = "bootstrap.sh"
  source = "${path.module}/bootstrap.sh"
}

resource "aws_emr_cluster" "cluster" {
  name          = "aws-ml-emr-cluster"
  release_label = "emr-5.33.1"
  service_role  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/EMR_DefaultRole"
  applications  = ["Zeppelin", "Spark"]

  termination_protection            = false
  keep_job_flow_alive_when_no_steps = true

  log_uri = "s3://aws-logs-${data.aws_caller_identity.current.account_id}-ap-northeast-1/elasticmapreduce/"

  ec2_attributes {
    subnet_id        = var.private_subnet_id
    instance_profile = aws_iam_instance_profile.emr_instanse_profile.arn
  }

  master_instance_group {
    instance_type = "m4.large"
  }

  bootstrap_action {
    path = "s3://${aws_s3_bucket.emr_bootstrap_script_bucket.id}/bootstrap.sh"
    name = "bootstrap"
  }

  core_instance_group {
    instance_type  = "c4.large"
    instance_count = 1

    ebs_config {
      size                 = "40"
      type                 = "gp2"
      volumes_per_instance = 1
    }

    bid_price = "0.30"
  }

  configurations_json = <<EOF
  [
    {
      "Classification": "spark-env",
      "Configurations": [
        {
          "Classification": "export",
          "Properties": {
            "AWS_REGION": "ap-northeast-1"
          }
        }
      ],
      "Properties": {}
    }
  ]
EOF

  ebs_root_volume_size = 100
}

resource "aws_emr_managed_scaling_policy" "cluster_policy" {
  cluster_id = aws_emr_cluster.cluster.id
  compute_limits {
    unit_type                       = "Instances"
    minimum_capacity_units          = 2
    maximum_capacity_units          = 3
    maximum_ondemand_capacity_units = 2
    maximum_core_capacity_units     = 2
  }
}

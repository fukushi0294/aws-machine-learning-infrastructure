data "aws_iam_policy_document" "emr_instance_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "emr_instance" {
  name               = "emr-instance-role"
  path               = "/"
  assume_role_policy = data.aws_iam_policy_document.emr_instance_assume_role_policy.json
}

resource "aws_iam_role_policy_attachment" "emr_default_role_attach" {
  role       = aws_iam_role.emr_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonElasticMapReduceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ssm_managed_role_attach" {
  role       = aws_iam_role.emr_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_policy" "emr_ssm_policy" {
  name   = "emr-ssm-policy"
  policy = data.aws_iam_policy_document.emr_ssm_policy_document.json
}

data "aws_iam_policy_document" "emr_ssm_policy_document" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:DescribeInstanceProperties",
      "ssm:DescribeSessions",
      "ec2:describeInstances",
      "ssm:GetConnectionStatus",
      "ssm:StartSession"
    ]
    resources = [
      "*",
    ]
  }
}

resource "aws_iam_role_policy_attachment" "emr_ssm_role_attach" {
  role       = aws_iam_role.emr_instance.name
  policy_arn = aws_iam_policy.emr_ssm_policy.arn
}

resource "aws_iam_instance_profile" "emr_instanse_profile" {
  name = "emr-instance-profile"
  role = aws_iam_role.emr_instance.name
}

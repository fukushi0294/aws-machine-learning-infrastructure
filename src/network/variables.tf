variable "vpc_cidr_block" {
  type        = string
  description = "VPC cider block. e.g. 10.0.0.0/16"
}

variable "public_cidr_block" {
  type        = string
  description = "VPC cider block. e.g. 10.0.1.0/24"
}

variable "private_cidr_block" {
  type        = string
  description = "VPC cider block. e.g. 10.0.2.0/24"
}

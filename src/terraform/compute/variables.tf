variable "vpc_id" {
  type = string
}

variable "private_subnet_id" {
  type        = string
  description = "private subnet id where EMR cluster deployed"
}

variable "instance_type" {
  type = map(string)

  default = {
    master = "m4.large"
    core   = "c4.large"
  }
}

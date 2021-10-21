resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr_block
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = var.public_cidr_block
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = var.private_cidr_block
}

resource "aws_eip" "ngw_eip" {
  vpc = true
}

resource "aws_nat_gateway" "ngw" {
  allocation_id = aws_eip.ngw_eip.id
  subnet_id     = aws_subnet.public.id

  depends_on = [aws_internet_gateway.gw]
}

### issue https://github.com/hashicorp/terraform-provider-aws/issues/20756
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route = [
    {
      cidr_block                 = "0.0.0.0/0"
      gateway_id                 = aws_internet_gateway.gw.id
      egress_only_gateway_id     = ""
      instance_id                = ""
      nat_gateway_id             = ""
      network_interface_id       = ""
      transit_gateway_id         = ""
      vpc_peering_connection_id  = ""
      carrier_gateway_id         = ""
      destination_prefix_list_id = ""
      ipv6_cidr_block            = ""
      local_gateway_id           = ""
      vpc_endpoint_id            = ""
    },
    {
      cidr_block                 = aws_subnet.public.cidr_block
      gateway_id                 = ""
      egress_only_gateway_id     = ""
      instance_id                = ""
      nat_gateway_id             = aws_nat_gateway.ngw.id
      network_interface_id       = ""
      transit_gateway_id         = ""
      vpc_peering_connection_id  = ""
      carrier_gateway_id         = ""
      destination_prefix_list_id = ""
      ipv6_cidr_block            = ""
      local_gateway_id           = ""
      vpc_endpoint_id            = ""
    }
  ]
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route = [
    {
      cidr_block                 = aws_subnet.private.cidr_block
      gateway_id                 = ""
      egress_only_gateway_id     = ""
      instance_id                = ""
      nat_gateway_id             = aws_nat_gateway.ngw.id
      network_interface_id       = ""
      transit_gateway_id         = ""
      vpc_peering_connection_id  = ""
      carrier_gateway_id         = ""
      destination_prefix_list_id = ""
      ipv6_cidr_block            = ""
      local_gateway_id           = ""
      vpc_endpoint_id            = ""
    }
  ]
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

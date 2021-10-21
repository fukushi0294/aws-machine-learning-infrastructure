output "vpc_id" {
  value = aws_vpc.main.id
}

output "subnet_id" {
  value = {
    public  = aws_subnet.public.id
    private = aws_subnet.private.id
  }
}

output "cidr_block" {
  value = {
    main    = aws_vpc.main.cidr_block
    public  = aws_subnet.public.cidr_block
    private = aws_subnet.private.cidr_block
  }
}

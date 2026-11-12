terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Repositório ECR exclusivo do microsserviço OS Service
resource "aws_ecr_repository" "os_service" {
  name                 = "${var.project_name}-os-service"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Banco de Dados Relacional Isolado (PostgreSQL - os_db) — Database per Service
resource "aws_db_instance" "os_db" {
  identifier             = "${var.project_name}-os-db"
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  db_name                = "os_db"
  username               = var.db_username
  password               = var.db_password
  skip_final_snapshot    = true
  publicly_accessible    = false
  storage_encrypted      = true
  backup_retention_period = 7

  tags = {
    Project     = var.project_name
    Service     = "os-service"
    Environment = var.environment
  }
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.os_service.repository_url
  description = "URL do repositório ECR do OS Service"
}

output "os_db_endpoint" {
  value       = aws_db_instance.os_db.endpoint
  description = "Endpoint do banco PostgreSQL isolado (os_db)"
}

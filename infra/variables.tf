variable "aws_region" {
  description = "Região AWS para provisionamento"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo do projeto Tech Challenge Fase 4"
  type        = string
  default     = "oficina-fase4"
}

variable "environment" {
  description = "Ambiente de deploy"
  type        = string
  default     = "production"
}

variable "db_instance_class" {
  description = "Classe da instância RDS PostgreSQL"
  type        = string
  default     = "db.t3.micro"
}

variable "db_username" {
  description = "Usuário administrador do banco os_db"
  type        = string
  default     = "os_admin"
}

variable "db_password" {
  description = "Senha do banco os_db"
  type        = string
  sensitive   = true
  default     = "ChangeMeInSecrets123!"
}

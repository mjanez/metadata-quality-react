.PHONY: help build up down restart logs clean test shell health

# Default target
.DEFAULT_GOAL := help

# Variables
DOCKER_COMPOSE := docker-compose
SERVICE_NAME := mqa-app

# Colors
GREEN := \033[0;32m
BLUE := \033[0;34m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)MQA React - Docker Management Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Usage:$(NC)"
	@echo "  make [command]"
	@echo ""
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	$(DOCKER_COMPOSE) build

build-no-cache: ## Build Docker images without cache
	@echo "$(BLUE)Building Docker images without cache...$(NC)"
	$(DOCKER_COMPOSE) build --no-cache

up: ## Start services in detached mode
	@echo "$(GREEN)Starting services...$(NC)"
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)Services started!$(NC)"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:3001/api/health"

up-dev: ## Start services in development mode (with logs)
	@echo "$(GREEN)Starting services in development mode...$(NC)"
	$(DOCKER_COMPOSE) up

up-prod: ## Start services with production profile (including Nginx)
	@echo "$(GREEN)Starting services with production profile...$(NC)"
	$(DOCKER_COMPOSE) --profile production up -d
	@echo "$(GREEN)Services started with Nginx!$(NC)"
	@echo "HTTP:  http://localhost:80"
	@echo "HTTPS: https://localhost:443"

down: ## Stop and remove containers
	@echo "$(YELLOW)Stopping and removing containers...$(NC)"
	$(DOCKER_COMPOSE) down

down-volumes: ## Stop and remove containers and volumes
	@echo "$(YELLOW)Stopping and removing containers and volumes...$(NC)"
	$(DOCKER_COMPOSE) down -v

restart: ## Restart services
	@echo "$(YELLOW)Restarting services...$(NC)"
	$(DOCKER_COMPOSE) restart
	@echo "$(GREEN)Services restarted!$(NC)"

logs: ## View logs from all services
	$(DOCKER_COMPOSE) logs -f

logs-app: ## View logs from MQA app only
	$(DOCKER_COMPOSE) logs -f $(SERVICE_NAME)

logs-nginx: ## View logs from Nginx (if running)
	$(DOCKER_COMPOSE) logs -f nginx

ps: ## List running containers
	$(DOCKER_COMPOSE) ps

health: ## Check health status of services
	@echo "$(BLUE)Checking service health...$(NC)"
	@$(DOCKER_COMPOSE) ps
	@echo ""
	@echo "$(BLUE)Testing endpoints...$(NC)"
	@curl -f http://localhost:3000/ > /dev/null 2>&1 && echo "$(GREEN)✓ Frontend is healthy$(NC)" || echo "$(RED)✗ Frontend is not responding$(NC)"
	@curl -f http://localhost:3001/api/health > /dev/null 2>&1 && echo "$(GREEN)✓ Backend is healthy$(NC)" || echo "$(RED)✗ Backend is not responding$(NC)"

shell: ## Open shell in MQA app container
	$(DOCKER_COMPOSE) exec $(SERVICE_NAME) sh

shell-backend: ## Open shell in backend directory
	$(DOCKER_COMPOSE) exec $(SERVICE_NAME) sh -c "cd /app/backend && sh"

test: ## Run tests (if available)
	@echo "$(BLUE)Running tests...$(NC)"
	$(DOCKER_COMPOSE) exec $(SERVICE_NAME) npm test

clean: ## Remove all containers, images, and volumes
	@echo "$(YELLOW)Cleaning up Docker resources...$(NC)"
	$(DOCKER_COMPOSE) down -v --rmi all
	@echo "$(GREEN)Cleanup complete!$(NC)"

clean-build: ## Clean and rebuild everything
	@echo "$(YELLOW)Cleaning and rebuilding...$(NC)"
	$(MAKE) down-volumes
	$(DOCKER_COMPOSE) build --no-cache
	$(MAKE) up
	@echo "$(GREEN)Rebuild complete!$(NC)"

update: ## Pull latest code and rebuild
	@echo "$(BLUE)Pulling latest changes...$(NC)"
	git pull origin main
	@echo "$(BLUE)Rebuilding services...$(NC)"
	$(DOCKER_COMPOSE) up -d --build
	@echo "$(GREEN)Update complete!$(NC)"

stats: ## Show resource usage statistics
	docker stats $(shell docker-compose ps -q)

prune: ## Prune Docker system (clean unused resources)
	@echo "$(YELLOW)Pruning Docker system...$(NC)"
	docker system prune -f
	@echo "$(GREEN)Prune complete!$(NC)"

backup: ## Backup configuration files
	@echo "$(BLUE)Creating backup...$(NC)"
	@mkdir -p backups
	@tar -czf backups/mqa-config-backup-$$(date +%Y%m%d-%H%M%S).tar.gz \
		.env .env.example mqa-config.json public/data/ docker/nginx/nginx.conf 2>/dev/null || true
	@echo "$(GREEN)Backup created in backups/ directory$(NC)"

dev-setup: ## Setup development environment
	@echo "$(BLUE)Setting up development environment...$(NC)"
	@cp -n .env.example .env 2>/dev/null || true
	@echo "$(GREEN)Development environment ready!$(NC)"
	@echo "Edit .env file if needed, then run: make up"

prod-setup: ## Setup production environment
	@echo "$(BLUE)Setting up production environment...$(NC)"
	@cp -n .env.example .env 2>/dev/null || true
	@echo "$(YELLOW)Please configure the following:$(NC)"
	@echo "1. Edit .env file with production values"
	@echo "2. Generate SSL certificates: make ssl-generate"
	@echo "3. Start services: make up-prod"

ssl-generate: ## Generate self-signed SSL certificates
	@./docker/nginx/generate-ssl.sh

ssl-info: ## Show SSL certificate information
	@openssl x509 -in docker/nginx/ssl/mqa_local.crt -text -noout 2>/dev/null || echo "$(RED)SSL certificate not found. Run 'make ssl-generate' first.$(NC)"

ssl-verify: ## Verify SSL certificate
	@echo "$(BLUE)Verifying SSL certificate...$(NC)"
	@openssl verify -CAfile docker/nginx/ssl/mqa_local.crt docker/nginx/ssl/mqa_local.crt 2>/dev/null && echo "$(GREEN)✓ Certificate is valid$(NC)" || echo "$(YELLOW)⚠ Self-signed certificate (expected for local development)$(NC)"

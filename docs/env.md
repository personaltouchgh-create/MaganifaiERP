# Environment Variables Guide

## Rules

- Do not commit `.env` files.
- Copy from `.env.example` to `.env` locally when needed.
- Values in `.env.example` are safe local defaults only.

## Local Docker services

### Postgres

- URL: postgresql://postgres:postgres@localhost:5432/pharmacy

### Redis

- URL: redis://localhost:6379

### MinIO (S3 compatible)

- API: http://localhost:9000
- Console: http://localhost:9001
- Default access key/secret: minioadmin / minioadmin
- Suggested bucket: pharmacy-local

### Mailhog (optional)

- SMTP: localhost:1025
- UI: http://localhost:8025
- Start with: docker compose --profile mail up -d

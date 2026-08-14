.PHONY: up down logs test e2e migrate seed reset

up:      ; docker compose up --build
down:    ; docker compose down
reset:   ; docker compose down -v
logs:    ; docker compose logs -f api
migrate: ; docker compose run --rm migrate pnpm migrate
seed:    ; docker compose run --rm migrate pnpm seed
test:    ; docker compose run --rm -e DB_NAME=ecommerce_test api sh -c "pnpm test && pnpm test:e2e"
e2e:     ; docker compose run --rm -e DB_NAME=ecommerce_test api pnpm test:e2e

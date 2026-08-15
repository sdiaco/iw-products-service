.PHONY: up down reset logs shell format lint typecheck unit e2e check migrate seed

# Every command runs inside a container: the host's Node is not the one that ships.
# --no-deps is used wherever MySQL is not needed, so the stack is not started for a lint.

up:        ; docker compose up --build
down:      ; docker compose down
reset:     ; docker compose down -v
logs:      ; docker compose logs -f api
shell:     ; docker compose run --rm --no-deps api sh

format:    ; docker compose run --rm --no-deps api pnpm format
lint:      ; docker compose run --rm --no-deps api pnpm lint
typecheck: ; docker compose run --rm --no-deps api pnpm typecheck
unit:      ; docker compose run --rm --no-deps api pnpm test
e2e:       ; docker compose run --rm -e DB_NAME=ecommerce_test api pnpm test:e2e

# The whole gate, in the order that fails fastest first.
check:     ; docker compose run --rm --no-deps api sh -c "pnpm format && pnpm lint && pnpm typecheck && pnpm test"
test:      ; $(MAKE) check && $(MAKE) e2e

migrate:   ; docker compose run --rm migrate pnpm migrate
seed:      ; docker compose run --rm migrate pnpm seed

# Вещи

Домашний каталог вещей: где что лежит. У каждой вещи есть тип с параметрами (номинал, корпус, файлы), место — контейнер, вложенный в другие контейнеры, и наклейка с QR-кодом. Телефоном сканируешь наклейку — открывается карточка вещи; поиск по названию и параметрам показывает, сколько чего есть и где оно лежит. «Рабочий стол» помогает брать вещи в работу и возвращать их на место. Приложение адаптивное, на телефон ставится как PWA. Требования — в [docs/spec.md](docs/spec.md).

## Быстрый старт

Нужен Docker с Compose:

```sh
docker compose up --build
```

Откройте http://localhost:3000 и войдите как `admin` / `admin-password`. Compose поднимает PostgreSQL, MinIO и приложение, собранное из `Dockerfile`; данные лежат в именованных томах (`docker compose down -v` их удаляет). Это локальный запуск с тестовыми паролями, а не конфигурация для продакшена.

## Образ

Образ публикуется в GitHub Container Registry: `ghcr.io/kiraind/veschi`. `latest` и номера версий (`1.2.3`, `1.2`, `1`) — последний релиз (см. [Релизы](#релизы)); `master` и `sha-<коммит>` — сборки из ветки `master` между релизами.

```sh
docker run -d -p 3000:3000 \
  -e ORIGIN=https://veschi.example.com \
  -e DATABASE_URL=postgresql://veschi:пароль@db:5432/veschi \
  -e S3_ENDPOINT=http://minio:9000 -e S3_ACCESS_KEY=veschi -e S3_SECRET_KEY=пароль \
  -e ADMIN_LOGIN=admin -e ADMIN_PASSWORD=пароль \
  ghcr.io/kiraind/veschi
```

При старте приложение само применяет миграции из `prisma/migrations` (свой мигратор, совместимый с `prisma migrate deploy`: та же таблица `_prisma_migrations`), создаёт бакет в MinIO, если его нет, и первого пользователя из `ADMIN_LOGIN` / `ADMIN_PASSWORD`. Наружу — один HTTP-порт; HTTPS (без него не работают камера, геопозиция и PWA) даёт прокси перед контейнером. Файлы в параметрах бывают до 50 МБ, поэтому и у этого прокси, и у прокси перед MinIO, если он есть, нужен `client_max_body_size 60m` (у nginx по умолчанию 1 МБ: файл больше хранилище не примет, и приложение так и скажет). Проверка живости — `GET /healthz` (200, если есть связь с базой); она же прописана в `HEALTHCHECK` образа.

| Переменная                       | Зачем                                                                                                       | По умолчанию  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| `PORT`                           | HTTP-порт                                                                                                   | `3000`        |
| `ORIGIN`                         | публичный URL приложения; SvelteKit сверяет с ним отправку форм — без него вход за HTTPS-прокси не работает | —             |
| `QR_BASE_URL`                    | короткий адрес для ссылок в QR: `<QR_BASE_URL>/<ID>`; может быть отдельным коротким доменом                 | `ORIGIN`      |
| `DATABASE_URL`                   | подключение к PostgreSQL                                                                                    | обязательна   |
| `S3_ENDPOINT`                    | адрес MinIO; без него файлы хранятся в памяти и пропадают при перезапуске (только для разработки)           | —             |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | логин и пароль MinIO                                                                                        | —             |
| `S3_BUCKET`                      | бакет для файлов, создаётся при старте                                                                      | `veschi`      |
| `S3_REGION`                      | регион S3                                                                                                   | `us-east-1`   |
| `ADMIN_LOGIN`, `ADMIN_PASSWORD`  | первый пользователь; создаётся, если его нет. Перезапуск пароль не меняет                                   | —             |
| `ADMIN_RESET_PASSWORD`           | `1` — при старте сбросить пароль первого пользователя на `ADMIN_PASSWORD` и завершить его сессии            | —             |
| `ADMIN_NAME`                     | отображаемое имя первого пользователя                                                                       | `ADMIN_LOGIN` |
| `BODY_SIZE_LIMIT`                | предельный размер запроса; должен быть больше лимита файла (50 МБ)                                          | `52M`         |
| `ADDRESS_HEADER`                 | заголовок с адресом клиента от прокси (`X-Forwarded-For`): по адресу считаются неудачные попытки входа      | —             |

Пример со всеми переменными — [.env.example](.env.example); готовый `docker-compose.yml` только с приложением и комментариями к каждой переменной — [docs/docker-compose.yml](docs/docker-compose.yml).

В продакшене (`NODE_ENV=production`, как в образе) без `ORIGIN` и `QR_BASE_URL` наклейки не печатаются: QR-коды вели бы на `localhost`, а напечатанное потом не исправить.

Забыли пароль — перезапустите контейнер с `ADMIN_RESET_PASSWORD=1` и новым `ADMIN_PASSWORD`, войдите и уберите флаг (иначе пароль будет сбрасываться при каждом старте). Обычная смена пароля — в «Настройках»; перезапуск без флага её не трогает.

## Разработка

Нужны Node.js 24 и Docker.

```sh
npm ci
docker compose up -d postgres minio   # только зависимости
cp .env.example .env
npm run db:migrate                     # применить миграции (и создать новую после правки schema.prisma)
npm run dev                            # http://localhost:5173
```

При первом запуске создаётся пользователь из `ADMIN_LOGIN` / `ADMIN_PASSWORD` в `.env`. Консоль MinIO — http://localhost:9001 (`veschi` / `veschi-secret`).

Иконки PWA в `static/icons` рисуются из `static/favicon.svg`: после правки иконки запустите `node scripts/generate-icons.mjs`.

## Тесты и проверки

```sh
npm run test:unit                                    # юнит-тесты, без базы
DATABASE_URL=postgresql://veschi:veschi@localhost:5432/veschi_test npm run test:integration
npm run lint                                         # Prettier + ESLint
npm run check                                        # svelte-check (типы)
```

Интеграционные тесты очищают базу из `DATABASE_URL` перед каждым тестом — дайте им отдельную базу, а не рабочую. Схему в ней создаёт `DATABASE_URL=... npx prisma migrate deploy`.

Смоук-тест образа (пустые PostgreSQL и MinIO, миграции, бакет, вход, перезапуск): `docker build -t veschi . && docker/smoke-test.sh veschi`.

## Устройство

- [docs/spec.md](docs/spec.md) — спецификация: что и зачем, критерии приёмки.
- [docs/architecture.md](docs/architecture.md) — структура кода, слои и правила.
- [docs/decisions.md](docs/decisions.md) — решения, принятые по ходу разработки.

Стек: SvelteKit 2 (Svelte 5) + adapter-node, TypeScript, PostgreSQL + Prisma, MinIO, Vitest.

## CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) на каждый push и pull request:

- `checks` — `npm run lint`, `npm run check`, юнит-тесты;
- `integration` — интеграционные тесты против PostgreSQL 16;
- `build` — сборка приложения;
- `docker` — сборка образа и смоук-тест (`docker/smoke-test.sh`); при push в `master` образ публикуется в `ghcr.io/kiraind/veschi` с тегами `sha-<коммит>` и `master`.

## Релизы

Версии — [semver](https://semver.org/lang/ru/), первая — `1.0.0`. Релиз выпускается вручную: Actions → **Release** → Run workflow (ветка `master`) и выбор, что поднять:

- `patch` — исправления (`1.2.3` → `1.2.4`);
- `minor` (по умолчанию) — новые возможности (`1.2.3` → `1.3.0`);
- `major` — несовместимые изменения (`1.2.3` → `2.0.0`).

Номер считается от последнего тега `vX.Y.Z`, руками его не задают. Workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) сначала прогоняет те же проверки, что и CI (линтер, типы, unit- и интеграционные тесты, сборку), на выпускаемом коммите, и выпускает его, только если они прошли и если с прошлого релиза что-то изменилось. Он:

1. поднимает версию в `package.json` и коммитит «Релиз X.Y.Z» в `master` с тегом `vX.Y.Z`;
2. собирает образ и прогоняет смоук-тест — если он упал, ничего не публикуется;
3. переносит ветку `latest` на этот коммит: `latest` всегда указывает на последний релиз;
4. создаёт GitHub Release с заметками из PR, вошедших в релиз;
5. публикует образ с тегами `X.Y.Z`, `X.Y`, `X` и `latest`.

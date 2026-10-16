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

При старте контейнер применяет миграции (`prisma migrate deploy`), создаёт бакет в MinIO, если его нет, и первого пользователя из `ADMIN_LOGIN` / `ADMIN_PASSWORD`. Наружу — один HTTP-порт; HTTPS (без него не работают камера, геопозиция и PWA) даёт прокси перед контейнером. Проверка живости — `GET /healthz` (200, если есть связь с базой); она же прописана в `HEALTHCHECK` образа.

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
| `PHOTO_PROCESSING`               | `cutout` — убирать фон с фото типов через ComfyUI (см. [Обработка фото](#обработка-фото)), `off` — нет      | `off`         |
| `PHOTO_PROCESSOR_URL`            | адрес ComfyUI; обязателен, если обработка включена                                                          | —             |
| `PHOTO_PROCESSOR_API_KEY`        | ключ API Comfy Cloud; для своего ComfyUI не нужен                                                           | —             |

Пример со всеми переменными — [.env.example](.env.example).

В продакшене (`NODE_ENV=production`, как в образе) без `ORIGIN` и `QR_BASE_URL` наклейки не печатаются: QR-коды вели бы на `localhost`, а напечатанное потом не исправить.

Забыли пароль — перезапустите контейнер с `ADMIN_RESET_PASSWORD=1` и новым `ADMIN_PASSWORD`, войдите и уберите флаг (иначе пароль будет сбрасываться при каждом старте). Обычная смена пароля — в «Настройках»; перезапуск без флага её не трогает.

## Обработка фото

С `PHOTO_PROCESSING=cutout` приложение убирает фон с фото типов: фото сначала показывается как есть, а через несколько секунд заменяется вырезанной вещью с выровненным светом, кадрированной с полями 6%. Вырезку рисует [ComfyUI](https://github.com/comfyanonymous/ComfyUI) с моделью BiRefNet из набора нод [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG); свет, кадр и WebP приложение делает само. Очередь задач хранится в PostgreSQL и переживает перезапуск. При первом включении в очередь встают и все старые фото. На странице типа можно выбрать, что показывать: «Без фона» или «Оригинал»; оригинал всегда хранится. Выключить обработку можно в любой момент: уже вырезанные фото останутся.

**Comfy Cloud** — для начала, без своей видеокарты: нужна подписка и ключ API из аккаунта Comfy Cloud. Ноды ComfyUI-RMBG там уже установлены.

```sh
PHOTO_PROCESSING=cutout
PHOTO_PROCESSOR_URL=https://cloud.comfy.org
PHOTO_PROCESSOR_API_KEY=<ключ>
```

**Свой сервер с видеокартой NVIDIA** — образ `ghcr.io/kiraind/veschi-photo-processor` из папки [photo-processor](photo-processor): ComfyUI с ComfyUI-RMBG, рассчитанный на старые карты вроде GTX 1050 Ti с 4 ГБ: PyTorch линии CUDA 12.6, BiRefNet в FP32 на 832 px.

1. Драйвер NVIDIA ветки 580 — последней с поддержкой карт GTX 10xx (на Ubuntu `nvidia-driver-580`, закрепить: `apt-mark hold`); проверка — `nvidia-smi`.
2. [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), затем `sudo nvidia-ctk runtime configure --runtime=docker` и перезапуск Docker; проверка — `docker run --rm --gpus all ubuntu nvidia-smi`.
3. `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d` — добавляет сервис `photo-processor` и включает обработку в `app`. Модель (около 1 ГБ) скачивается при первой обработке в том `photo-models`.

Порт ComfyUI (8188) наружу не открывается: у ComfyUI нет авторизации. Переключиться с облака на свой сервер — поменять `PHOTO_PROCESSOR_URL` и убрать `PHOTO_PROCESSOR_API_KEY`. Посмотреть, что происходит, — `docker compose logs -f app photo-processor`: приложение пишет время каждой обработки и ошибки.

## Разработка

Нужны Node.js 22 и Docker.

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
- `docker` — сборка образа и смоук-тест (`docker/smoke-test.sh`); при push в `master` образ публикуется в `ghcr.io/kiraind/veschi` с тегами `sha-<коммит>` и `master`;
- `photo-processor` — при изменениях в `photo-processor/`: сборка образа обработки фото и проверка, что ComfyUI стартует (на CPU) с нодой BiRefNet; при push в `master` образ публикуется в `ghcr.io/kiraind/veschi-photo-processor`.

## Релизы

Версии — [semver](https://semver.org/lang/ru/), первая — `1.0.0`. Релиз выпускается вручную: Actions → **Release** → Run workflow (ветка `master`) и выбор, что поднять:

- `patch` — исправления (`1.2.3` → `1.2.4`);
- `minor` (по умолчанию) — новые возможности (`1.2.3` → `1.3.0`);
- `major` — несовместимые изменения (`1.2.3` → `2.0.0`).

Номер считается от последнего тега `vX.Y.Z`, руками его не задают. Workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) выпускает только коммит, на котором CI в `master` зелёный, и только если с прошлого релиза что-то изменилось. Он:

1. поднимает версию в `package.json` и коммитит «Релиз X.Y.Z» в `master` с тегом `vX.Y.Z`;
2. собирает образ и прогоняет смоук-тест — если он упал, ничего не публикуется;
3. переносит ветку `latest` на этот коммит: `latest` всегда указывает на последний релиз;
4. создаёт GitHub Release с заметками из PR, вошедших в релиз;
5. публикует образ с тегами `X.Y.Z`, `X.Y`, `X` и `latest`.

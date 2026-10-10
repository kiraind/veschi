# Архитектура

Как устроен код Veschi. Требования — в [spec.md](spec.md), принятые по ходу решения — в [decisions.md](decisions.md).

## Стек

SvelteKit 2 (Svelte 5, руны) + adapter-node, TypeScript (strict), PostgreSQL + Prisma 6, MinIO (S3) для файлов, Vitest, ESLint + Prettier. Интерфейс только на русском.

## Слои

```
src/
  lib/
    domain/          чистые функции без БД и сети (форматы, расчёты); юнит-тесты *.test.ts
    server/
      db.ts          Prisma-клиент (`db`) и тип транзакции `Tx`
      env.ts         конфигурация из переменных окружения (`config()`)
      errors.ts      доменные ошибки: NotFoundError, ValidationError, ConflictError, ...
      scope.ts       Actor и фильтры владения: visibleTo(actor), ownedBy(actor)
      api.ts         apiHandler, parseBody, errorResponse — обёртки для /api
      auth/          пароли (argon2id), сессии в cookie, первый пользователь
      storage/       Storage: S3Storage (MinIO) и MemoryStorage (тесты, dev без MinIO)
      services/      единственный слой бизнес-логики; интеграционные тесты *.int.test.ts
      pdf/           генерация PDF с наклейками
      testing/       хелперы интеграционных тестов (сброс БД, createTestActor)
    components/      Svelte-компоненты
    api.ts           браузерный клиент JSON API (`api.get/post/...`, ApiError)
  routes/
    api/**/+server.ts   JSON API (все изменения данных идут через него)
    files/[...key]      отдача файлов из хранилища с проверкой доступа
    **/+page.svelte     страницы; чтение через +page.server.ts → services
assets/fonts/        шрифты для PDF (копируются в образ)
prisma/              схема и миграции
```

### Правила

- **Сервисы** (`src/lib/server/services/*.ts`) принимают первым аргументом `actor: Actor` и фильтруют каждый запрос через `visibleTo(actor)`; новые записи создают с `...ownedBy(actor)`. Так права проверяются на сервере в каждом запросе, а домохозяйства потом добавятся без переписывания.
- Ошибки для пользователя — `AppError` и наследники из `errors.ts`, сообщения на русском. API превращает их в `{ error: { code, message, details } }` с нужным HTTP-статусом.
- **API**: `export const POST = apiHandler(async ({ actor, request, params }) => ...)`; тело валидируется zod-схемой через `parseBody`. Возвращаемые данные сериализуются в JSON, `undefined` → 204.
- **Страницы** читают данные в `+page.server.ts` через сервисы (`actorOrError(event)` даёт actor), а изменения отправляют из браузера через `$lib/api` в `/api/...` и после успеха вызывают `invalidateAll()` или `goto(...)`. Form actions используются только для входа.
- Без входа: страницы → редирект на `/login?next=...`, `/api/*` и `/files/*` → 401 (`src/hooks.server.ts`).
- Несколько изменений, которые должны пройти вместе, — в `db.$transaction(async (tx) => ...)`; хелперы принимают необязательный `tx: Tx = db`.
- Пути контейнеров считаются одним рекурсивным запросом: `getPaths(ids)` / `getPath(id)` в `services/paths.ts`; защита от циклов — `assertCanPlace(itemId, newParentId)`. Для показа — `formatPath` / `pathNodeName` из `$lib/domain/item` (рабочий стол показывается как «Рабочий стол Гараж»).
- Имя вещи для показа — `itemDisplayName(item)` (своё имя, иначе имя типа).
- ID наклеек хранятся без дефиса заглавными (`K7M4QX`), показываются через `formatCode` (`K7M-4QX`), ввод нормализуется `normalizeCode`.

## Тесты

- `npm run test:unit` — юнит-тесты `src/**/*.test.ts` (без БД).
- `npm run test:integration` — интеграционные `src/**/*.int.test.ts` против PostgreSQL из `DATABASE_URL`; перед каждым тестом БД очищается (`testing/setup.ts`), хранилище заменяется на `MemoryStorage`. Файлы идут последовательно.
- `npm run lint` (Prettier + ESLint) и `npm run check` (svelte-check) обязательны в CI.

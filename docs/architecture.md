# Архитектура

Как устроен код Veschi. Требования — в [spec.md](spec.md), принятые по ходу решения — в [decisions.md](decisions.md).

## Стек

SvelteKit 2 (Svelte 5, руны) + adapter-node, TypeScript (strict), PostgreSQL + Prisma 6, MinIO (S3) для файлов, Vitest, ESLint + Prettier. Интерфейс — Flowbite Svelte на Tailwind CSS 4, только на русском.

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
- **Параметры**: определение (`ParamDef`, страница «Параметры») задаёт название, тип значения, единицу (числа) и варианты выпадающего списка (свой `EnumDictionary` у каждого ENUM-параметра, правится только через параметр — `services/dictionaries.ts`); значения (`Param`) лежат у типа или вещи и ссылаются на него (`defId`). Схемы — в `$lib/domain/params` (`paramDefInputSchema`, `paramInputSchema`), сервис — `services/params.ts`. В интеграционных тестах параметры удобно задавать по названию: `setKeyedParams` / `keyed` из `testing/params.ts`.
- Фото есть только у типа (`ItemType.photoKey`); в интерфейсе — компонент `PhotoField` (иконка поверх фото → своя камера `CameraCapture`, выбор файла, удаление).
- Часть количества переносится через `placePart` (`services/split.ts`); он же сливает перенесённое с такой же записью на месте назначения. У контейнера количество всегда 1.
- Даты показываются только как ГГГГ-ММ-ДД (`$lib/domain/dates`), ввод даты — `DateInput`.
- Положить вещь можно только в контейнер — вещь типа с `ItemType.isContainer` или рабочий стол: `isContainerItem` / `assertIsContainer` из `services/paths.ts` (в запросе — `containerTypeInclude`).
- Подтверждение действия — `await confirmAction({ title, message?, confirmLabel? })` из `$lib/confirm.svelte`, не `confirm()` браузера.
- Длинные имена файлов и ссылки показываются через `shortenFileName` / `shortenUrl` из `$lib/domain/shorten`.
- **Интерфейс**: компоненты Flowbite Svelte (`Button`, `Card`, `Input`, `Badge`, `Alert`…) и утилиты Tailwind; `<style>` в компонентах — только если без него никак. Сначала вёрстка под телефон (≈390 px), кнопки не ниже 40 px. Общие приёмы: h1 — `text-2xl font-bold`, вторичный текст — `text-sm text-gray-500 dark:text-gray-400`, ошибка — `text-sm text-red-600 dark:text-red-500` с `role="alert"`.
- **Идентификаторы** — cuid (`@default(cuid())`, колонки `TEXT`); во входных данных — `idSchema` из `$lib/domain/id`.
- **Правка на месте**: отдельных страниц «Изменить» нет. Название или описание правится через карандаш (`EditButton`) и шторку (`TextEditSheet` поверх `Sheet` — Drawer снизу); количество, «Использовать» и «Выкинуть» — `QuantitySheet`. Тип вещи после создания не меняется.
- Наклейка — всегда на одну вещь: у записи с наклейкой количество 1 (`STICKER_QUANTITY` в `services/items.ts`); `bindSticker` отделяет одну вещь от записи с количеством больше 1.
- Фото при загрузке приводятся к квадрату с прозрачными полями и сохраняются в двух размерах (`toWebp` в `services/types.ts`; миниатюра — `thumbKeyOf`, отдаётся по `/files/<key>?size=thumb`, у старых фото её нет — отдаётся само фото). Удалять файлы — через `deleteStored`, он убирает и миниатюру.
- **История**: каждое изменение данных пишет событие `recordEvent(tx, actor, { kind, subject, data, refIds })` из `services/history.ts` в той же транзакции, что и само изменение. Виды событий и их `data` — `HistoryDataMap` в `$lib/domain/history`, там же текст события (`describeEvent`) и фильтры. Имена сущностей и мест сохраняются в событии на момент действия (`itemRef`, `placeRef`, `typeRef`, `paramDefRef`), внешних ключей на сущности нет — история переживает удаление. Новое действие → новый вид в `HistoryDataMap`, группа в `GROUP_OF`, ветка в `describeEvent` и запись в сервисе. Ссылка на историю одной сущности или человека — `historyHref({ entity: id })` / `historyHref({ actor: userId })`.
- ID наклеек хранятся без дефиса заглавными (`K7M4QX`), показываются через `formatCode` (`K7M-4QX`), ввод нормализуется `normalizeCode`.

## Тесты

- `npm run test:unit` — юнит-тесты `src/**/*.test.ts` (без БД).
- `npm run test:integration` — интеграционные `src/**/*.int.test.ts` против PostgreSQL из `DATABASE_URL`; перед каждым тестом БД очищается (`testing/setup.ts`), хранилище заменяется на `MemoryStorage`. Файлы идут последовательно.
- `npm run lint` (Prettier + ESLint) и `npm run check` (svelte-check) обязательны в CI.

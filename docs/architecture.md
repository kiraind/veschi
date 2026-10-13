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
      db.ts          Prisma-клиент (`db`), тип транзакции `Tx` и `writeTransaction`
      env.ts         конфигурация из переменных окружения (`config()`)
      errors.ts      доменные ошибки: NotFoundError, ValidationError, ConflictError, ...
      scope.ts       Actor и фильтры владения: visibleTo(actor), ownedBy(actor)
      api.ts         apiHandler, pageLoad, parseBody, errorResponse — обёртки для /api и страниц
      auth/          пароли (argon2id), сессии в cookie, первый пользователь, ограничение попыток входа
      storage/       Storage: S3Storage (MinIO) и MemoryStorage (тесты, dev без MinIO)
      services/      единственный слой бизнес-логики; интеграционные тесты *.int.test.ts
      pdf/           генерация PDF с наклейками
      testing/       хелперы интеграционных тестов (сброс БД, createTestActor)
    components/      Svelte-компоненты
    api.ts           браузерный клиент JSON API (`api.get/post/...`, ApiError, `errorText`)
    connection.svelte.ts  доступен ли сервер: о запросах сообщает api.ts, плашку показывает ConnectionNotice
  service-worker.ts  PWA: кэш файлов приложения, сохранённые копии страниц, страница «Нет связи»
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
- **Схемы в `$lib/domain`** импортирует и браузер, поэтому они пишутся на `zod/mini` (функциональный API: `z.string().check(z.trim(), z.maxLength(100))`, `z.optional(x)`, `z.pipe(x, z.transform(f))`) через `$lib/domain/zod` — там же включены русские сообщения; классический `zod` в браузер не попадает. Серверные схемы (`services/`, `+server.ts`) пишутся на обычном `zod` и оборачивают доменные функциями (`z.optional(idSchema)`), а не методами — у mini-схем их нет.
- **Страницы** читают данные в `+page.server.ts` через сервисы: `export const load: PageServerLoad = pageLoad(async ({ actor, params }) => ...)` — `pageLoad` требует вход и показывает ошибки сервисов на `+error.svelte` с их статусом (удалённая или неверная вещь → 404, а не 500). Изменения страницы отправляют из браузера через `$lib/api` в `/api/...` и после успеха вызывают `invalidateAll()` или `goto(...)`; текст ошибки для человека — `errorText(e)`. Form actions используются только для входа.
- Страница, которая открывается по id (`/items/[id]`), оборачивает содержимое в `{#key id}`: SvelteKit переиспользует компонент при переходе на другую вещь, и без этого открытые шторки и их состояние переезжают на неё.
- Без входа: страницы → редирект на `/login?next=...`, `/api/*` и `/files/*` → 401 (`src/hooks.server.ts`). Изменяющие запросы (не GET) с чужим `Origin` отклоняются там же с 403 — встроенная проверка SvelteKit смотрит только формы. `next` проверяет `safeRedirectPath`.
- **Изменения** идут через `writeTransaction(async (tx) => ...)` из `$lib/server/db`, не через `db.$transaction`: она берёт одну advisory-блокировку на все изменения каталога, поэтому два параллельных запроса (двойной тап, два устройства) не портят количество, не создают цикл и не привязывают одну наклейку дважды. Хелперы принимают необязательный `tx: Tx = db`. Проверки, от которых зависит запись (есть ли вещи у типа, свободна ли наклейка), — внутри той же транзакции.
- Пути контейнеров считаются одним рекурсивным запросом: `getPaths(ids)` / `getPath(id)` в `services/paths.ts`; защита от циклов — `assertCanPlace(itemId, newParentId)`. Для показа — `formatPath` / `pathNodeName` из `$lib/domain/item` (рабочий стол показывается как «Рабочий стол Гараж»).
- Имя вещи для показа — `itemDisplayName(item)` (своё имя, иначе имя типа).
- **Параметры**: определение (`ParamDef`, страница «Параметры») задаёт название, тип значения, единицу (числа) и варианты выпадающего списка (свой `EnumDictionary` у каждого ENUM-параметра, правится только через параметр — `services/dictionaries.ts`); значения (`Param`) лежат у типа или вещи и ссылаются на него (`defId`). Схемы — в `$lib/domain/params` (`paramDefInputSchema`, `paramInputSchema`), сервис — `services/params.ts`. Связи («Связь с вещами», «Связь с типами») — пара определений, указывающих друг на друга (`ParamDef.inverseId`, симметричная — сама на себя); цели значения лежат в `ParamRef` (одна или несколько). Любая запись значения связи (`replaceParams`, `addParam`, `updateParam`, `deleteParam`, копия при отделении части — `mirrorLinksOf`) проходит через `syncMirrors`, которая добавляет или убирает зеркальное значение на другой стороне и пишет это в историю. В интеграционных тестах параметры удобно задавать по названию: `setKeyedParams` / `keyed` из `testing/params.ts` (связи — `linkDef`).
- **Категории** (`Category`, страница «Категории»): список обязательных параметров (`CategoryParam`: параметр + `level` — `TYPE` — «у типа» или `ITEM` — «у каждой вещи»), типы в категории — `TypeCategory`. Правила и сложение требований нескольких категорий — `$lib/domain/categories` (`requiredAt`, `missingParams`), сервис — `services/categories.ts`. Проверки встроены в параметры и вещи: `createItem` требует значения «у каждой вещи» (`assertItemComplete`), `replaceParams` / `deleteParam` не дают удалить обязательное значение (`requiredDefsOf` в `services/params.ts`). Карточки типа и вещи отдают `typeRequired` / `itemRequired` и списки незаполненного; `ParamSection` показывает их как «не заполнено» (`missing`) и прячет удаление у обязательных (`required`).
- **Коллекции** (`Collection`, страница «Коллекции»): именованный список позиций `CollectionEntry` — тип (`typeId`) или запись вещи (`itemId`), ровно одно, и сколько нужно. Схемы и текст «есть / не хватает» — `$lib/domain/collections` (`entryInputSchema`, `shortage`, `stockText`), сервис — `services/collections.ts` (`addEntry` прибавляет к уже имеющейся позиции; `typeName` создаёт тип). Тип и вещь, на которые ссылается позиция, не удаляются навсегда (`collectionNamesHolding`) и не растворяются при слиянии одинаковых записей (`isPlainRecord`, `findTwin`). На карточках типа и вещи — `InCollections` (раздел «В коллекциях»), шторка добавления — `AddEntrySheet`.
- Фото есть только у типа (`ItemType.photoKey`); в интерфейсе — компонент `PhotoField` (иконка поверх фото → своя камера `CameraCapture`, выбор файла, удаление).
- Часть количества переносится через `placePart` (`services/split.ts`); он же сливает перенесённое с такой же записью на месте назначения. У контейнера количество всегда 1.
- Описание типа показывается через `Description` (три строки, остальное по клику, карандаш в конце). Склонение по числу — `plural` из `$lib/domain/plural`; количество вещей пишется словами через `pieces(n)` («3 штуки»), не «шт.».
- **Тема** (светлая / тёмная / системная) — cookie `theme` (`$lib/domain/theme`), сервер ставит `<html data-theme>` и класс `dark` в `hooks.server.ts`, скрипт в `app.html` обслуживает «Системную», смена — `setTheme` из `$lib/theme`. Стили для тёмной темы пишутся как обычно, через `dark:`.
- Даты показываются только как ГГГГ-ММ-ДД (`$lib/domain/dates`), ввод даты — `DateInput`.
- Положить вещь можно только в контейнер — вещь типа с `ItemType.isContainer` или рабочий стол: `isContainerItem` / `assertIsContainer` из `services/paths.ts` (в запросе — `containerTypeInclude`).
- Пояснения к разделу (что это, как работает) не пишутся абзацем на странице: иконка «i» рядом с заголовком — `<InfoHint title="…">текст</InfoHint>`, текст открывается в шторке.
- Подтверждение действия — `await confirmAction({ title, message?, confirmLabel? })` из `$lib/confirm.svelte`, не `confirm()` браузера.
- Длинные имена файлов и ссылки показываются через `shortenFileName` / `shortenUrl` из `$lib/domain/shorten`.
- **Интерфейс**: компоненты Flowbite Svelte (`Button`, `Card`, `Input`, `Badge`, `Alert`…) и утилиты Tailwind; `<style>` в компонентах — только если без него никак. Сначала вёрстка под телефон (≈390 px), кнопки не ниже 40 px. Общие приёмы: h1 — `text-2xl font-bold`, вторичный текст — `text-sm text-gray-500 dark:text-gray-400`, ошибка — `text-sm text-red-600 dark:text-red-500` с `role="alert"`.
- **Flowbite и размер сборки**: Tailwind ищет классы только в папках `flowbite-svelte`, перечисленных через `@source` в `src/app.css`. Новый компонент Flowbite (и те, что он рисует внутри) — добавить его папку туда, иначе у него не будет стилей. В `vite.config.ts` модули `flowbite-svelte` помечены как не имеющие побочных эффектов, поэтому в бандл попадают только используемые компоненты.
- Тяжёлое, что нужно не на каждой странице, загружается через `import()` в момент использования (так `QrScanner` через `$lib/scan-decoder.ts` грузит jsQR или, для штрихкодов, zxing-wasm, а где есть — берёт встроенный `BarcodeDetector`).
- Страницы, `__data.json` и ответы API сжимаются gzip в `hooks.server.ts` (`compress` из `$lib/server/compress`); статика сжата при сборке.
- Prisma с `relationJoins`: `include` загружает связи одним SQL-запросом. Независимые чтения в `load` идут через `Promise.all`.
- **Идентификаторы** — cuid (`@default(cuid())`, колонки `TEXT`); во входных данных — `idSchema` из `$lib/domain/id`.
- **Правка на месте**: отдельных страниц «Изменить» нет. Название или описание правится через карандаш (`EditButton`, ставится в строку в конце текста) и шторку (`TextEditSheet` поверх `Sheet` — Drawer снизу); количество, «Использовать» и «Выкинуть» — `QuantitySheet`. Тип вещи после создания не меняется.
- Наклейка — всегда на одну вещь: у записи с наклейкой количество 1 (`STICKER_QUANTITY` в `services/items.ts`); `bindSticker` отделяет одну вещь от записи с количеством больше 1.
- Фото при загрузке приводятся к квадрату с прозрачными полями и сохраняются в двух размерах (`toWebp` в `services/types.ts`; миниатюра — `thumbKeyOf`, отдаётся по `/files/<key>?size=thumb`, у старых фото её нет — отдаётся само фото). Картинки больше 50 Мп отклоняются до распаковки, фото обрабатываются по одному. Удалять файлы — через `deleteStored`, он убирает и миниатюру; файлы параметров, на которые больше никто не ссылается, — `deleteUnreferencedFiles` после транзакции.
- **История**: каждое изменение данных пишет событие `recordEvent(tx, actor, { kind, subject, data, refIds })` из `services/history.ts` в той же транзакции, что и само изменение. Виды событий и их `data` — `HistoryDataMap` в `$lib/domain/history`, там же текст события (`describeEvent`) и фильтры. Имена сущностей и мест сохраняются в событии на момент действия (`itemRef`, `placeRef`, `typeRef`, `paramDefRef`), внешних ключей на сущности нет — история переживает удаление. Новое действие → новый вид в `HistoryDataMap`, группа в `GROUP_OF`, ветка в `describeEvent` и запись в сервисе. Ссылка на историю одной сущности или человека — `historyHref({ entity: id })` / `historyHref({ actor: userId })`; на карточках вещи, типа, параметра и категории — `HistoryLink`. Вещи, которых событие касается помимо субъекта (содержимое выкинутого контейнера, параметры новой вещи), идут в `refIds`, чтобы событие было видно в их истории.
- **Заказ наклейки**: `Item.stickerOrderedAt` — вещь ждёт наклейку (`orderSticker` / `cancelStickerOrder`, список — `listStickerOrders`). `issueBatch` получает `orderItemIds` (заказы, которые человек видел на «Наклейках»), печатает их первыми с именем вещи и сразу привязывает (`Sticker.fromOrder`); `bindSticker` вручную тоже снимает заказ. «Не распечатано» — `unprintBatch`: удаляет пачку и её наклейки (ID снова свободны), вещам возвращает заказ; отказ, если хоть одна наклейка уже в ходу.
- ID наклеек хранятся без дефиса заглавными (`K7M4QX`), показываются через `formatCode` (`K7M-4QX`), ввод нормализуется `normalizeCode`. Новая папка в `src/routes` добавляется в `TOP_LEVEL_ROUTES` (`$lib/domain/sticker-code`), иначе упадёт тест: код наклейки, совпадающий с адресом страницы (`PARAMS`), не выпускается.
- Поля поиска внутри форм (`ContainerPicker`, `RefPicker`, выбор параметра и категории) гасят Enter, чтобы он не отправлял форму. Сравнение названий через Prisma `equals`/`contains` с `mode: 'insensitive'` — только с `escapeLike(...)`: иначе `%` и `_` работают как шаблон.
- Вещь в архиве и рабочий стол параметров не меняют; связь не ведёт на саму вещь (тип) и на вещь в архиве. «Удалить навсегда» отказывает, пока вещь связана через параметры с другими вещами или типами или вещи на столе ждут возврата в неё.
- **Нет связи с сервером.** Service worker (`src/service-worker.ts`) открывает страницы сначала из сети. Если ответа нет, он не пришёл за 15 с или прокси ответил 502/503/504, показывается сохранённая копия страницы (в `<html>` отметка `data-offline-copy` со временем копии) или, если копии нет, страница «Нет связи» (`offlinePage` из `$lib/domain/offline`), которая сама перезагружается, когда `/healthz` ответит. Переход внутри приложения без связи SvelteKit сам превращает в обычную загрузку страницы, так что он попадает туда же. `/api/` и `/files/` service worker не трогает. В открытом приложении `ConnectionNotice` (в `+layout.svelte`) показывает плашку: нет интернета, сервер не отвечает (после неудачного запроса через `$lib/api`, пока `/healthz` не ответит), сервер отвечает дольше 3 с, это сохранённая копия. GET через `$lib/api` обрывается через 20 с; изменения не обрываются (фото грузятся долго). Свой `fetch` мимо `$lib/api` о связи не сообщает.

## Тесты

- `npm run test:unit` — юнит-тесты `src/**/*.test.ts` (без БД).
- `npm run test:integration` — интеграционные `src/**/*.int.test.ts` против PostgreSQL из `DATABASE_URL`; перед каждым тестом БД очищается (`testing/setup.ts`), хранилище заменяется на `MemoryStorage`. Файлы идут последовательно.
- `npm run lint` (Prettier + ESLint) и `npm run check` (svelte-check) обязательны в CI.

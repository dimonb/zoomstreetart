# Zoom Street Art

Галерея уличного искусства, построенная из выгрузки Instagram через Hugo.

## Установка

```bash
# Создать виртуальное окружение
python3 -m venv .venv

# Активировать
source .venv/bin/activate

# Установить зависимости
pip install -e ".[dev]"
```

## Использование

Проект использует [Poe the Poet](https://poethepoet.natn.io/) для управления задачами:

```bash
# Активировать окружение
source .venv/bin/activate

# Собрать сайт (очистить → сгенерировать посты → собрать Hugo)
poe build

# Запустить dev сервер Hugo
poe serve

# Скачать новые посты из Instagram
poe download

# Только сгенерировать markdown из Instagram данных
poe generate

# Проверить код линтером
poe lint

# Отформатировать код
poe format
```

## Структура проекта

```
├── insta_to_hugo.py          # Конвертер Instagram → Hugo
├── zoomstreetart/            # Выгрузка Instagram (Instaloader)
├── site/                     # Hugo сайт
│   ├── content/posts/        # Генерируемые посты
│   ├── static/media/         # Копируемые изображения/видео
│   ├── layouts/              # Шаблоны Hugo
│   └── assets/               # CSS и JS
└── pyproject.toml            # Конфигурация проекта
```

## Возможности

- ✅ Автоматическая генерация постов из Instagram данных
- ✅ Поддержка каруселей (несколько изображений/видео)
- ✅ Транслитерация кириллических заголовков в URL
- ✅ Уникальные slug'и с коротким хэшом
- ✅ Тёмная тема
- ✅ Адаптивный дизайн
- ✅ Ссылки на оригинальные посты в Instagram
- ✅ Интерактивная карусель с управлением

## Технологии

- **Python 3.10+** для обработки данных
- **Hugo** для генерации статического сайта
- **Unidecode** для транслитерации
- **Instaloader** для выгрузки Instagram
- **Poethepoet** для автоматизации задач

## CI/CD — GitHub Pages

Репозиторий содержит workflow `.github/workflows/deploy.yml`, который:
- Собирает сайт на каждом пуше в ветку `main`
- Генерирует контент (`insta_to_hugo.py`) и собирает Hugo (`site/public`)
- Публикует на GitHub Pages через `actions/deploy-pages`

Настройка в репозитории GitHub:
1. Settings → Pages → Build and Deployment: Source = GitHub Actions
2. Settings → Pages → Custom domain (опционально)

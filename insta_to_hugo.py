#!/usr/bin/env python3
"""
insta_to_hugo.py

Конвертирует выгрузку Instaloader в контент для Hugo.
Поддерживает sidecar файлы с расширениями: .json и .json.xz
Корректно группирует карусели (имена вида *_UTC_1.jpg, *_UTC_2.mp4 и т.д.)

Пример:
  python insta_to_hugo.py --src /path/to/instaloader/profile --out /path/to/hugo/site --author "Dmitrii"
"""

import argparse
import hashlib
import json
import lzma
import pathlib
import re
import shutil
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple, TypedDict

from unidecode import unidecode

IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
VIDEO_EXT = {'.mp4', '.mov', '.webm'}

UTC_KEY_RE = re.compile(r'(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC)')

def slugify(s: str) -> str:
    # Transliterate to ASCII if unidecode is available
    s = unidecode(s)
    s = s.lower()
    s = re.sub(r'[^a-z0-9\-_ \.]+', '', s)
    s = re.sub(r'\s+', '-', s).strip('-')
    # Remove only leading/trailing dots
    s = s.strip('.')
    return s or 'post'

def strip_sidecar_suffixes(p: pathlib.Path) -> str:
    """
    Убирает двойные расширения .json.xz -> возвращает имя без них.
    Например: 2025-09-01_12-00-00_UTC.json.xz -> 2025-09-01_12-00-00_UTC
    """
    name = p.name
    if name.endswith('.json.xz'):
        return name[:-8]  # len('.json.xz') == 8
    if name.endswith('.json'):
        return name[:-5]
    return p.stem

def key_from_name(p: pathlib.Path) -> str | None:
    """
    Достаёт базовый ключ поста (до _UTC) из имени файла (без расширений .json/.xz).
    Работает и для *_UTC_1.jpg — вернёт часть до _UTC.
    """
    base = strip_sidecar_suffixes(p)
    m = UTC_KEY_RE.search(base)
    return m.group(1) if m else None

def yaml_escape(value: str) -> str:
    """
    Escapes a string for safe inclusion inside double-quoted YAML values.
    Handles backslashes and double quotes.
    """
    s = value.replace('\\', '\\\\')
    s = s.replace('"', '\\"')
    return s

class PostGroup(TypedDict):
    meta: Optional[pathlib.Path]
    media: List[pathlib.Path]


def find_posts(src: pathlib.Path) -> List[Tuple[str, PostGroup]]:
    """
    Проходит по папке Instaloader и группирует файлы в посты по ключу *_UTC.
    Возвращает список (key, data) по убыванию даты.
    data = {'meta': Path|None, 'media': [Path,...]}
    """
    posts: Dict[str, PostGroup] = {}
    for entry in src.iterdir():
        if not entry.is_file():
            continue
        key = key_from_name(entry)
        if not key:
            continue
        posts.setdefault(key, {'meta': None, 'media': []})
        # sidecar?
        if (entry.name.endswith('.json') or entry.name.endswith('.json.xz')) and not entry.name.endswith('_comments.json'):
            posts[key]['meta'] = entry
        else:
            # любые медиа форматов из списков
            if entry.suffix.lower() in IMAGE_EXT.union(VIDEO_EXT):
                posts.setdefault(key, {'meta': None, 'media': []})
                posts[key]['media'].append(entry)

    def parse_dt(key: str) -> datetime:
        # key e.g. 2025-09-01_12-00-00_UTC
        return datetime.strptime(key.replace('_UTC',''), '%Y-%m-%d_%H-%M-%S')

    items: List[Tuple[str, PostGroup]] = list(posts.items())
    items.sort(key=lambda kv: parse_dt(kv[0]), reverse=True)
    return items

def read_sidecar(meta_path: Optional[pathlib.Path]) -> dict:
    """
    Читает sidecar JSON (обычный или .xz), вынимает caption, timestamp, location.name
    """
    if not meta_path or not meta_path.exists():
        return {}
    if meta_path.name.endswith('.xz'):
        f = lzma.open(meta_path, 'rt', encoding='utf-8')
    else:
        f = open(meta_path, 'r', encoding='utf-8')
    with f as fh:
        data = json.load(fh)

    if isinstance(data, list):
        data = next((item for item in data if isinstance(item, dict)), {})
    if not isinstance(data, dict):
        return {}

    # caption
    caption = ''
    node = data.get('node') if isinstance(data, dict) else None
    if node:
        edges = node.get('edge_media_to_caption', {}).get('edges', [])
        if edges and edges[0].get('node', {}).get('text'):
            caption = edges[0]['node']['text']
    if not caption:
        caption = data.get('caption') or data.get('edge_media_to_caption', {}).get('edges', [{}])[0].get('node', {}).get('text', '')

    # Fallback to adjacent .txt if caption still empty
    if not caption and meta_path:
        base = strip_sidecar_suffixes(meta_path)
        txt_path = meta_path.with_name(base + '.txt')
        if txt_path.exists():
            caption = txt_path.read_text(encoding='utf-8', errors='ignore')

    shortcode = None
    if node and isinstance(node, dict):
        shortcode = node.get('shortcode') or None
    if not shortcode and isinstance(data, dict):
        shortcode = data.get('shortcode') or None

    # timestamp
    ts = data.get('taken_at_timestamp') or (node.get('taken_at_timestamp') if node else None)
    ts = int(ts) if ts is not None else None

    # location
    location = data.get('location') or (node.get('location') if node else {}) or {}
    loc_name = location.get('name') if isinstance(location, dict) else None

    return {'caption': caption or '', 'timestamp': ts, 'location': loc_name, 'shortcode': shortcode}

def write_hugo_post(out_dir: pathlib.Path, slug: str, front: dict, body: str) -> None:
    content_dir = out_dir / 'content' / 'posts'
    content_dir.mkdir(parents=True, exist_ok=True)
    path = content_dir / (slug + '.md')

    # YAML front matter
    fm = ['---']
    for k, v in front.items():
        if v is None:
            continue
        if isinstance(v, (list, tuple)):
            fm.append(f'{k}:')
            for it in v:
                fm.append('  - "' + yaml_escape(str(it)) + '"')
        else:
            fm.append(f'{k}: "{yaml_escape(str(v))}"')
    fm.append('---\n')

    body_content = clean_caption(body or '')
    content = body_content + '\n' if body_content else ''
    path.write_text('\n'.join(fm) + content, encoding='utf-8')


def clean_caption(caption: str) -> str:
    """
    Clean up Instagram caption by removing excessive hashtags and mentions.
    """
    lines = caption.split('\n')
    cleaned_lines: List[str] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Remove excessive hashtags (more than 3 in a row)
        hashtag_count = len(re.findall(r'#\w+', line))
        if hashtag_count > 3:
            # Keep only first 3 hashtags
            hashtags = re.findall(r'#\w+', line)[:3]
            other_words = re.sub(r'#\w+', '', line).strip()
            if other_words:
                line = other_words + ' ' + ' '.join(hashtags)

        # Remove Instagram handles at the end
        line = re.sub(r'@\w+\s*$', '', line)

        if line:
            cleaned_lines.append(line)

    return '\n'.join(cleaned_lines)

def clean_title(text: str) -> str:
    return text.strip()

def copy_media_files(media_list: Sequence[pathlib.Path], out_dir: pathlib.Path) -> List[str]:
    media_out = out_dir / 'static' / 'media'
    media_out.mkdir(parents=True, exist_ok=True)
    copied: List[str] = []
    for p in sorted(media_list, key=lambda x: x.name):
        dest = media_out / p.name
        if not dest.exists():
            shutil.copy2(p, dest)
        copied.append('/media/' + dest.name)
    return copied

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='Путь к папке Instaloader профиля')
    ap.add_argument('--out', required=True, help='Путь к корню Hugo сайта')
    ap.add_argument('--author', default='')
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    out = pathlib.Path(args.out)

    count = 0
    for key, data in find_posts(src):
        media_paths = data.get('media', [])
        if not media_paths:
            continue
        side = read_sidecar(data.get('meta'))
        images = copy_media_files(media_paths, out)

        dt = datetime.strptime(key.replace('_UTC',''), '%Y-%m-%d_%H-%M-%S')
        datestr = dt.strftime('%Y-%m-%dT%H:%M:%S')
        title_src = (side.get('caption') or '').split('\n', 1)[0]
        if not title_src:
            txt_fallback = (src / f"{key}.txt")
            if txt_fallback.exists():
                title_src = txt_fallback.read_text(encoding='utf-8', errors='ignore').split('\n', 1)[0]
        title_clean = clean_title(title_src) if title_src else ''
        title = title_clean[:60] or key
        
        slug_suffix = slugify(title)
        # If slugify returns empty or generic 'post', use key to ensure uniqueness
        if not slug_suffix or slug_suffix == 'post':
            slug_suffix = 'post'
        
        # Add short hash from key for guaranteed uniqueness
        key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()[:8]
        slug = dt.strftime('%Y%m%d') + '-' + slug_suffix + '-' + key_hash

        # Caption full text with fallback to .txt
        caption_full = side.get('caption') or ''
        if not caption_full:
            txt_fallback = (src / f"{key}.txt")
            if txt_fallback.exists():
                caption_full = txt_fallback.read_text(encoding='utf-8', errors='ignore')

        # Determine instagram shortcode with fallback to raw meta JSON
        shortcode = side.get('shortcode')
        if not shortcode and data.get('meta'):
            meta_path = data.get('meta')
            if isinstance(meta_path, pathlib.Path) and meta_path.exists():
                if meta_path.name.endswith('.xz'):
                    with lzma.open(meta_path, 'rt', encoding='utf-8') as fh:
                        raw = json.load(fh)
                else:
                    with open(meta_path, 'r', encoding='utf-8') as fh:
                        raw = json.load(fh)
                node = raw.get('node') if isinstance(raw, dict) else {}
                if isinstance(node, dict):
                    shortcode = node.get('shortcode') or shortcode
                if not shortcode and isinstance(raw, dict):
                    shortcode = raw.get('shortcode') or shortcode

        front = {
            'title': title,
            'date': datestr,
            'draft': False,
            'images': images,
            'tags': ['instagram'],
            'author': args.author or None,
            'description': (clean_caption(caption_full)[:160] or None),
            'location': side.get('location') or None,
            'instagram_url': (f"https://www.instagram.com/p/{shortcode}/" if shortcode else None)
        }
        body = caption_full
        write_hugo_post(out, slug, front, body)
        count += 1

    print(f'Done. Generated/updated {count} posts.')

if __name__ == '__main__':
    main()

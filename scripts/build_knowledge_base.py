from __future__ import annotations

import json
import re
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from xml.etree import ElementTree

try:
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover - user-facing setup error
    raise SystemExit(
        "Missing dependency: pypdf. Install it with `python3 -m pip install pypdf` "
        "or `python3 -m pip install --target /tmp/ereviews_pdf_deps pypdf` and set PYTHONPATH."
    ) from exc


ROOT = Path(__file__).resolve().parent.parent
GUIDES_DIR = ROOT / "Guides"
OUTPUT_DIR = ROOT / "data"
OUTPUT_PATH = OUTPUT_DIR / "knowledge-base.json"
OUTPUT_JS_PATH = OUTPUT_DIR / "knowledge-base.js"

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".md"}
IGNORE_PATH_PARTS = {".download"}

MANUAL_OVERRIDES = {
    "DigEplanClientOnboarding.md": {
        "id": "digeplan-client-onboarding",
        "family": "digeplan-client-onboarding",
        "topic": "digeplan onboarding",
        "vendor": "digeplan",
        "category": "setup",
        "guide_type": "setup",
        "source_system": "confluence",
    },
    "DigEplanCCFCredentialsGeneration.md": {
        "id": "digeplan-ccf-credentials",
        "family": "digeplan-ccf-credentials",
        "topic": "digeplan authentication",
        "vendor": "digeplan",
        "category": "setup",
        "guide_type": "setup",
        "source_system": "confluence",
    },
    "DigEplanFAQs.md": {
        "id": "digeplan-faqs",
        "family": "digeplan-faqs",
        "topic": "digeplan faq",
        "vendor": "digeplan",
        "category": "faq",
        "guide_type": "faq",
        "source_system": "confluence",
    },
    "DigEplanMigrationStepsForLiveClients.md": {
        "id": "digeplan-live-client-migration",
        "family": "digeplan-live-client-migration",
        "topic": "digeplan migration",
        "vendor": "digeplan",
        "category": "migration",
        "guide_type": "setup",
        "source_system": "confluence",
    },
    "ICChatSupplementalQA.md": {
        "id": "ic-chat-supplemental-qa",
        "family": "ic-chat-supplemental-qa",
        "topic": "implementation faq",
        "vendor": "general",
        "category": "faq",
        "guide_type": "faq",
        "source_system": "local",
    },
}

SECTION_PATTERNS = [
    re.compile(r"^[A-Z][A-Za-z0-9/&'(),:+ -]{2,90}$"),
    re.compile(r"^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,8}$"),
]

NOISE_PATTERNS = [
    re.compile(r"^Updated:\s*\d"),
    re.compile(r"^Table of Contents$"),
    re.compile(r"^\d+$"),
    re.compile(r"^Enterprise Permitting"),
    re.compile(r"^This image displays"),
    re.compile(r"^NOTE\s"),
    re.compile(r"\.{8,}"),
]


@dataclass
class Chunk:
    id: str
    guide_id: str
    guide_title: str
    guide_family: str
    guide_type: str
    guide_version: str
    guide_version_sort: list[int]
    source_system: str
    source_priority: int
    is_preferred_source: bool
    vendor: str
    topic: str
    category: str
    page: int
    section: str
    text: str


def normalize_whitespace(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "guide"


def title_from_stem(stem: str) -> str:
    stem = re.sub(r"[_\-]+", " ", stem)
    stem = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem


def parse_version_from_text(value: str) -> str:
    matches = re.findall(r"\b(20\d{2}(?:\.\d+)?)\b", value)
    if not matches:
        return ""
    matches.sort(key=version_sort_key, reverse=True)
    return matches[0]


def parse_version(path: Path, title: str) -> str:
    direct_candidates = [
        title,
        path.stem,
        path.name,
    ]
    for candidate in direct_candidates:
        version = parse_version_from_text(candidate)
        if version:
            return version

    guide_folder_pattern = re.compile(r"\b(20\d{2}(?:\.\d+)?)\s+(?:user|setup)\s+guides?\b", re.IGNORECASE)
    for part in reversed(path.parts):
        match = guide_folder_pattern.search(part)
        if match:
            return match.group(1)

    return ""


def version_sort_key(version: str) -> list[int]:
    if not version:
        return [0]
    return [int(part) for part in version.split(".")]


def source_priority(source_system: str) -> int:
    priorities = {
        "tyleru": 100,
        "confluence": 70,
        "pdf": 60,
        "local": 40,
    }
    return priorities.get(source_system, 10)


def guide_type_from_path(path: Path, title: str) -> str:
    text = " ".join(path.parts).lower() + " " + title.lower()
    if "setup guide" in text or "setup guides" in text:
        return "setup"
    if "user guide" in text or "user guides" in text or "admin guide" in text:
        return "user"
    if "faq" in text or "overview" in text:
        return "faq"
    return "reference"


def source_system_from_path(path: Path) -> str:
    parts = {part.lower() for part in path.parts}
    if "onedrive_1_6-25-2026" in parts or "onedrive_1_6-25-2026-2" in parts:
        return "tyleru"
    if path.suffix.lower() == ".md":
        return "local"
    return "pdf"


def vendor_from_text(text: str) -> str:
    lowered = text.lower()
    if "digeplan" in lowered:
        return "digeplan"
    if "bluebeam" in lowered:
        return "bluebeam"
    return "general"


def category_from_guide_type(guide_type: str, title: str) -> str:
    lowered = title.lower()
    if "dashboard" in lowered:
        return "dashboard"
    if "team" in lowered:
        return "teams"
    if "migration" in lowered:
        return "migration"
    if "faq" in lowered:
        return "faq"
    if guide_type == "setup":
        return "setup"
    if guide_type == "user":
        return "user"
    return "reference"


def family_from_title(title: str, vendor: str) -> str:
    lowered = title.lower()
    lowered = re.sub(r"\b20\d{2}(?:\.\d+)?\b", "", lowered)
    lowered = re.sub(r"\b(user guide|setup guide|admin guide|guide|overview|faq|faqs)\b", "", lowered)
    lowered = re.sub(r"\bwith bluebeam\b", "bluebeam", lowered)
    lowered = re.sub(r"\bwith digeplan\b", "digeplan", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    base = slugify(lowered)
    if vendor in {"bluebeam", "digeplan"} and vendor not in base:
        return f"{base}-{vendor}"
    return base


def topic_from_title(title: str) -> str:
    lowered = title.lower()
    lowered = re.sub(r"\b20\d{2}(?:\.\d+)?\b", "", lowered)
    lowered = re.sub(r"\b(user guide|setup guide|admin guide|guide)\b", "", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def derived_metadata(path: Path) -> dict:
    override = MANUAL_OVERRIDES.get(path.name, {})
    title = override.get("title", title_from_stem(path.stem))
    vendor = override.get("vendor", vendor_from_text(title))
    guide_type = override.get("guide_type", guide_type_from_path(path, title))
    source_system = override.get("source_system", source_system_from_path(path))
    category = override.get("category", category_from_guide_type(guide_type, title))
    family = override.get("family", family_from_title(title, vendor))
    topic = override.get("topic", topic_from_title(title))
    version = parse_version(path, title)
    return {
        "id": override.get("id", slugify(f"{family}-{version or path.stem}")),
        "title": title,
        "family": family,
        "topic": topic,
        "vendor": vendor,
        "category": category,
        "guide_type": guide_type,
        "source_system": source_system,
        "description": override.get("description", f"{title} imported from local guide files."),
        "version": version,
        "version_sort": version_sort_key(version),
        "source_priority": source_priority(source_system),
    }


def should_include(path: Path) -> bool:
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False
    lowered_parts = [part.lower() for part in path.parts]
    if any(part.endswith(".download") for part in lowered_parts):
        return False
    if path.name.startswith("."):
        return False
    return True


def discover_guides() -> list[Path]:
    return sorted(path for path in GUIDES_DIR.rglob("*") if path.is_file() and should_include(path))


def looks_like_section(line: str) -> bool:
    if any(pattern.match(line) for pattern in NOISE_PATTERNS):
        return False
    if len(line) > 90 or "." in line:
        return False
    return any(pattern.match(line) for pattern in SECTION_PATTERNS)


def extract_section(lines: list[str], fallback: str) -> str:
    for line in lines[:12]:
        cleaned = line.strip()
        if looks_like_section(cleaned):
            return cleaned
    return fallback


def cleaned_page_text(raw: str) -> str:
    lines = [line.strip() for line in raw.splitlines()]
    kept: list[str] = []
    for line in lines:
        if not line:
            kept.append("")
            continue
        if any(pattern.match(line) for pattern in NOISE_PATTERNS):
            continue
        kept.append(line)
    return normalize_whitespace("\n".join(kept))


def read_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = []
    for paragraph in root.findall(".//w:p", namespace):
        texts = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
        text = "".join(texts).strip()
        if text:
            paragraphs.append(text)
    return normalize_whitespace("\n".join(paragraphs))


def read_pdf_pages(path: Path) -> list[str]:
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        raw = page.extract_text() or ""
        if "Table of Contents" in raw:
            continue
        text = cleaned_page_text(raw)
        if len(text) >= 120:
            pages.append(text)
    return pages


def split_markdown_sections(text: str) -> list[str]:
    return [normalize_whitespace(part) for part in re.split(r"\n(?=##? )", text) if normalize_whitespace(part)]


def split_docx_sections(text: str) -> list[str]:
    sections = re.split(r"\n(?=(?:[A-Z][A-Za-z0-9/&'(),:+ -]{2,90}|[0-9]+\.\s))", text)
    cleaned = [normalize_whitespace(part) for part in sections if normalize_whitespace(part)]
    return cleaned or [text]


def preferred_guide_ids(guide_records: list[dict]) -> set[str]:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for guide in guide_records:
        key = (guide["family"], guide["guide_type"])
        grouped.setdefault(key, []).append(guide)

    preferred: set[str] = set()
    for items in grouped.values():
        items.sort(
            key=lambda guide: (
                guide["source_priority"],
                guide["version_sort"],
            ),
            reverse=True,
        )
        preferred.add(items[0]["id"])
    return preferred


def uniquify_guide_id(base_id: str, source_system: str, used_ids: set[str]) -> str:
    if base_id not in used_ids:
        used_ids.add(base_id)
        return base_id

    candidate = f"{base_id}-{source_system}"
    if candidate not in used_ids:
        used_ids.add(candidate)
        return candidate

    suffix = 2
    while True:
        candidate = f"{base_id}-{source_system}-{suffix}"
        if candidate not in used_ids:
            used_ids.add(candidate)
            return candidate
        suffix += 1


def build_chunks() -> tuple[list[dict], list[dict]]:
    guides: list[dict] = []
    chunk_seed: list[Chunk] = []
    used_ids: set[str] = set()

    for path in discover_guides():
        meta = derived_metadata(path)
        meta["id"] = uniquify_guide_id(meta["id"], meta["source_system"], used_ids)
        relative_filename = str(path.relative_to(GUIDES_DIR))
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            pages = read_pdf_pages(path)
            if not pages:
                continue
            guides.append({**meta, "filename": relative_filename, "pages": len(pages)})
            for page_number, text in enumerate(pages, start=1):
                lines = [line for line in text.splitlines() if line.strip()]
                section = extract_section(lines, f"Page {page_number}")
                chunk_seed.append(
                    Chunk(
                        id=f"{meta['id']}-p{page_number}",
                        guide_id=meta["id"],
                        guide_title=meta["title"],
                        guide_family=meta["family"],
                        guide_type=meta["guide_type"],
                        guide_version=meta["version"],
                        guide_version_sort=meta["version_sort"],
                        source_system=meta["source_system"],
                        source_priority=meta["source_priority"],
                        is_preferred_source=False,
                        vendor=meta["vendor"],
                        topic=meta["topic"],
                        category=meta["category"],
                        page=page_number,
                        section=section,
                        text=text,
                    )
                )
            continue

        if suffix == ".docx":
            text = read_docx_text(path)
            sections = split_docx_sections(text)
        else:
            text = normalize_whitespace(path.read_text(encoding="utf-8"))
            sections = split_markdown_sections(text)

        if not sections:
            continue

        guides.append({**meta, "filename": relative_filename, "pages": len(sections)})
        for index, section_text in enumerate(sections, start=1):
            if len(section_text) < 120:
                continue
            lines = [line.strip() for line in section_text.splitlines() if line.strip()]
            header = extract_section(lines, f"Section {index}")
            chunk_seed.append(
                Chunk(
                    id=f"{meta['id']}-s{index}",
                    guide_id=meta["id"],
                    guide_title=meta["title"],
                    guide_family=meta["family"],
                    guide_type=meta["guide_type"],
                    guide_version=meta["version"],
                    guide_version_sort=meta["version_sort"],
                    source_system=meta["source_system"],
                    source_priority=meta["source_priority"],
                    is_preferred_source=False,
                    vendor=meta["vendor"],
                    topic=meta["topic"],
                    category=meta["category"],
                    page=index,
                    section=header,
                    text=section_text,
                )
            )

    preferred_ids = preferred_guide_ids(guides)
    for guide in guides:
        guide["is_latest_in_family"] = guide["id"] in preferred_ids
        guide["is_preferred_source"] = guide["id"] in preferred_ids

    chunks: list[dict] = []
    for chunk in chunk_seed:
        chunk.is_preferred_source = chunk.guide_id in preferred_ids
        chunks.append(asdict(chunk))

    return guides, chunks


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    guides, chunks = build_chunks()
    payload = {
        "generated_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "source_folder": "Guides",
        "vendors": ["bluebeam", "digeplan"],
        "guides": guides,
        "chunks": chunks,
    }
    json_text = json.dumps(payload, indent=2)
    OUTPUT_PATH.write_text(json_text, encoding="utf-8")
    OUTPUT_JS_PATH.write_text(
        "window.EREVIEWS_KNOWLEDGE_BASE = " + json.dumps(payload) + ";\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {len(chunks)} chunks from {len(guides)} guides to "
        f"{OUTPUT_PATH} and {OUTPUT_JS_PATH}"
    )


if __name__ == "__main__":
    main()

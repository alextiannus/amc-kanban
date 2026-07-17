#!/usr/bin/env python3
"""Generate standard AMC service terms PDFs from the canonical Markdown source.

By default, files are regenerated only when missing or older than the source
Markdown. Use --force to refresh both PDFs.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "content" / "service-terms.md"
OUTPUT_DIR = ROOT / "public" / "legal"
OUTPUTS = {
    "en": OUTPUT_DIR / "AI-Marketing-Crew-Service-Terms-English.pdf",
    "zh": OUTPUT_DIR / "AI-Marketing-Crew-Service-Terms-Chinese.pdf",
}


def split_markdown(markdown: str) -> dict[str, str]:
    parts = re.split(r"\n---\n", markdown, maxsplit=1)
    return {
        "en": parts[0].strip(),
        "zh": parts[1].strip() if len(parts) > 1 else markdown.strip(),
    }


def clean_inline(markdown: str) -> str:
    text = markdown.strip()
    text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.replace("&", "&amp;")


def should_generate(output: Path, force: bool) -> bool:
    if force or not output.exists():
        return True
    return output.stat().st_mtime < SOURCE.stat().st_mtime


def build_styles(language: str):
    styles = getSampleStyleSheet()
    if language == "zh":
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        font = "STSong-Light"
        leading = 14
        word_wrap = "CJK"
    else:
        font = "Helvetica"
        leading = 13
        word_wrap = None

    title = ParagraphStyle(
        "AMCTitle",
        parent=styles["Title"],
        fontName=font,
        fontSize=18,
        leading=24,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=10,
        wordWrap=word_wrap,
    )
    heading = ParagraphStyle(
        "AMCHeading",
        parent=styles["Heading2"],
        fontName=font,
        fontSize=11.5,
        leading=16,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=5,
        wordWrap=word_wrap,
    )
    body = ParagraphStyle(
        "AMCBody",
        parent=styles["BodyText"],
        fontName=font,
        fontSize=8.7,
        leading=leading,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
        wordWrap=word_wrap,
    )
    bullet = ParagraphStyle(
        "AMCBullet",
        parent=body,
        leftIndent=4 * mm,
        firstLineIndent=0,
        spaceAfter=3,
        wordWrap=word_wrap,
    )
    return title, heading, body, bullet


def markdown_to_flowables(markdown: str, language: str):
    title_style, heading_style, body_style, bullet_style = build_styles(language)
    flowables = []
    pending_bullets = []

    def flush_bullets():
        nonlocal pending_bullets
        if not pending_bullets:
            return
        for item in pending_bullets:
            flowables.append(Paragraph(f"- {clean_inline(item)}", bullet_style))
        flowables.append(Spacer(1, 2))
        pending_bullets = []

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            flush_bullets()
            continue
        if line.startswith("- "):
            pending_bullets.append(line[2:].strip())
            continue

        flush_bullets()
        if line.startswith("# "):
            flowables.append(Paragraph(clean_inline(line[2:]), title_style))
            flowables.append(Spacer(1, 4))
        elif line.startswith("## "):
            flowables.append(Paragraph(clean_inline(line[3:]), heading_style))
        else:
            flowables.append(Paragraph(clean_inline(line), body_style))

    flush_bullets()
    return flowables


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.drawCentredString(A4[0] / 2, 10 * mm, f"AI Marketing Crew Service Terms - Page {doc.page}")
    canvas.restoreState()


def generate_pdf(markdown: str, language: str, output: Path):
    doc = SimpleDocTemplate(
        str(output),
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="AI Marketing Crew Service Terms",
        author="Deliverychinatown Pte. Ltd.",
    )
    doc.build(markdown_to_flowables(markdown, language), onFirstPage=draw_footer, onLaterPages=draw_footer)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate PDFs even when cached files are current")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sections = split_markdown(SOURCE.read_text(encoding="utf-8"))

    for language, output in OUTPUTS.items():
        if should_generate(output, args.force):
            generate_pdf(sections[language], language, output)
            print(f"generated {output.relative_to(ROOT)}")
        else:
            print(f"current {output.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

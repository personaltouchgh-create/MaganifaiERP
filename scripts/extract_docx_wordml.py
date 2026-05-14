import argparse
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def q(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


@dataclass
class Block:
    kind: str
    style: str | None
    text: str


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def para_text(p: ET.Element) -> str:
    parts: list[str] = []
    for t in p.findall(f".//{q('t')}"):
        if t.text:
            parts.append(t.text)
    return norm_ws("".join(parts))


def para_style(p: ET.Element) -> str | None:
    ppr = p.find(q("pPr"))
    if ppr is None:
        return None
    pstyle = ppr.find(q("pStyle"))
    if pstyle is None:
        return None
    val = pstyle.attrib.get(q("val")) or pstyle.attrib.get("val")
    return val


def extract_blocks(document_xml: bytes) -> list[Block]:
    root = ET.fromstring(document_xml)
    body = root.find(q("body"))
    if body is None:
        return []

    blocks: list[Block] = []
    for child in list(body):
        if child.tag == q("p"):
            text = para_text(child)
            if text:
                blocks.append(Block(kind="p", style=para_style(child), text=text))
        elif child.tag == q("tbl"):
            rows: list[str] = []
            for tr in child.findall(q("tr")):
                cells: list[str] = []
                for tc in tr.findall(q("tc")):
                    cell_ps = tc.findall(f".//{q('p')}")
                    cell_text = norm_ws(" ".join(para_text(p) for p in cell_ps if para_text(p)))
                    cells.append(cell_text)
                rows.append(" | ".join(cells))
            table_text = "\n".join(rows).strip()
            if table_text:
                blocks.append(Block(kind="tbl", style=None, text=table_text))
    return blocks


def to_markdown(blocks: list[Block]) -> str:
    out: list[str] = []
    for b in blocks:
        if b.kind == "p":
            style = (b.style or "").lower()
            if style.startswith("heading"):
                m = re.search(r"heading(\d+)", style)
                level = int(m.group(1)) if m else 2
                level = max(1, min(6, level))
                out.append("#" * level + " " + b.text)
            else:
                out.append(b.text)
        elif b.kind == "tbl":
            rows = [r.strip() for r in b.text.splitlines() if r.strip()]
            if not rows:
                continue
            header = rows[0]
            cols = [c.strip() for c in header.split("|")]
            out.append("| " + " | ".join(cols) + " |")
            out.append("| " + " | ".join(["---"] * len(cols)) + " |")
            for r in rows[1:]:
                cols = [c.strip() for c in r.split("|")]
                out.append("| " + " | ".join(cols) + " |")
        out.append("")
    return "\n".join(out).strip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docx", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    docx_path = Path(args.docx)
    out_path = Path(args.out)
    with zipfile.ZipFile(docx_path, "r") as z:
        document_xml = z.read("word/document.xml")

    blocks = extract_blocks(document_xml)
    md = to_markdown(blocks)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")
    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


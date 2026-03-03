"""Convert NotebookLM markdown files to PDFs for upload to Google NotebookLM."""
import os
import re
from fpdf import FPDF

SRC_DIR = os.path.join(os.path.dirname(__file__), 'notebooklm')
OUT_DIR = os.path.join(os.path.dirname(__file__), 'notebooklm-pdfs')

FILES = [
    '01-what-is-packout.md',
    '02-insurance-lifecycle.md',
    '03-industry-glossary.md',
    '04-customer-types.md',
    '05-competitive-landscape.md',
    '06-fire-leads-program.md',
    '07-hubspot-logging.md',
]


class LessonPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 8, '1-800-Packouts  |  SDR Onboarding  |  Confidential', align='C')
        self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'Page {self.page_no()}', align='C')


def sanitize(text):
    """Replace Unicode characters that core fonts can't handle."""
    replacements = {
        '\u2014': '--',   # em dash
        '\u2013': '-',    # en dash
        '\u2018': "'",    # left single quote
        '\u2019': "'",    # right single quote
        '\u201c': '"',    # left double quote
        '\u201d': '"',    # right double quote
        '\u2026': '...',  # ellipsis
        '\u2022': '*',    # bullet
        '\u00e9': 'e',    # é
        '\u00ed': 'i',    # í
        '\u00f3': 'o',    # ó
        '\u00fa': 'u',    # ú
        '\u00e1': 'a',    # á
        '\u00f1': 'n',    # ñ
        '\u00e8': 'e',    # è
        '\u00fc': 'u',    # ü
        '\u2192': '->',   # arrow
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    # Catch any remaining non-latin-1 chars
    return text.encode('latin-1', errors='replace').decode('latin-1')


def render_markdown(pdf, text):
    """Simple markdown renderer for our lesson format."""
    text = sanitize(text)
    lines = text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]

        # Skip empty lines
        if not line.strip():
            pdf.ln(3)
            i += 1
            continue

        # H1
        if line.startswith('# ') and not line.startswith('## '):
            pdf.set_font('Helvetica', 'B', 22)
            pdf.set_text_color(27, 54, 93)  # Navy
            pdf.multi_cell(0, 10, line[2:].strip())
            pdf.ln(4)
            i += 1
            continue

        # H2
        if line.startswith('## '):
            pdf.ln(4)
            pdf.set_font('Helvetica', 'B', 16)
            pdf.set_text_color(27, 54, 93)
            pdf.multi_cell(0, 8, line[3:].strip())
            pdf.ln(2)
            i += 1
            continue

        # H3
        if line.startswith('### '):
            pdf.ln(3)
            pdf.set_font('Helvetica', 'B', 13)
            pdf.set_text_color(27, 54, 93)
            pdf.multi_cell(0, 7, line[4:].strip())
            pdf.ln(2)
            i += 1
            continue

        # Horizontal rule
        if line.strip() == '---':
            pdf.ln(4)
            pdf.set_draw_color(212, 168, 83)  # Gold
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(6)
            i += 1
            continue

        # Bullet points
        if line.strip().startswith('- ') or line.strip().startswith('• '):
            content = line.strip()[2:]
            render_body_line(pdf, '  -  ' + content)
            i += 1
            continue

        # Numbered list
        num_match = re.match(r'^(\d+)\.\s+(.+)', line.strip())
        if num_match:
            render_body_line(pdf, f'  {num_match.group(1)}.  {num_match.group(2)}')
            i += 1
            continue

        # Regular paragraph
        render_body_line(pdf, line.strip())
        i += 1


def render_body_line(pdf, text):
    """Render a line of body text with **bold** support."""
    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(40, 40, 40)

    # Split on bold markers
    parts = re.split(r'(\*\*.+?\*\*)', text)
    line_height = 6

    # Check if we need a new page
    if pdf.get_y() > 270:
        pdf.add_page()

    x_start = pdf.get_x()
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            pdf.set_font('Helvetica', 'B', 11)
            pdf.write(line_height, part[2:-2])
            pdf.set_font('Helvetica', '', 11)
        else:
            pdf.write(line_height, part)

    pdf.ln(line_height + 1)


def convert_file(md_path, pdf_path):
    """Convert a single markdown file to PDF."""
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    pdf = LessonPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    render_markdown(pdf, content)
    pdf.output(pdf_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Individual PDFs
    for fname in FILES:
        md_path = os.path.join(SRC_DIR, fname)
        pdf_name = fname.replace('.md', '.pdf')
        pdf_path = os.path.join(OUT_DIR, pdf_name)
        print(f'Converting {fname} -> {pdf_name}')
        convert_file(md_path, pdf_path)

    # Combined PDF (all 7 in one)
    print('Creating combined PDF: 00-all-lessons-combined.pdf')
    pdf = LessonPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    for fname in FILES:
        md_path = os.path.join(SRC_DIR, fname)
        with open(md_path, 'r', encoding='utf-8') as f:
            content = f.read()
        pdf.add_page()
        render_markdown(pdf, content)

    pdf.output(os.path.join(OUT_DIR, '00-all-lessons-combined.pdf'))

    print(f'\nDone! {len(FILES) + 1} PDFs created in: {OUT_DIR}')


if __name__ == '__main__':
    main()

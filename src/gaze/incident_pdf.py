"""Render observation reports without inferring misconduct or fetching external assets."""
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
import re

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, KeepTogether, LongTable, TableStyle


def validate_report(value):
    if not isinstance(value, dict) or value.get('schemaVersion') != 1 or value.get('mode') not in ('image', 'video', 'camera'):
        raise ValueError('Invalid report schema or source mode')
    for name, limit in [('id', 100), ('source', 500), ('generatedAt', 100), ('summary', 20000),
                        ('notes', 10000), ('reviewer', 120)]:
        if not isinstance(value.get(name), str) or len(value[name]) > limit:
            raise ValueError(f'Invalid report {name}')
    if value.get('signedOffAt') is not None and (not isinstance(value['signedOffAt'], str) or len(value['signedOffAt']) > 100):
        raise ValueError('Invalid report sign-off')
    if type(value.get('omittedItems')) is not int or value['omittedItems'] < 0:
        raise ValueError('Invalid omitted-item count')
    for key, maximum in [('metadata', 30), ('items', 500), ('coverage', 600), ('limitations', 50)]:
        if not isinstance(value.get(key), list) or len(value[key]) > maximum:
            raise ValueError(f'Invalid report {key}')
    for pair in value['metadata']:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2 or any(not isinstance(s, str) or len(s) > 10000 for s in pair):
            raise ValueError('Invalid metadata pair')
    for item in value['items']:
        if not isinstance(item, dict) or any(not isinstance(item.get(key), str) or len(item[key]) > limit
            for key, limit in [('label', 200), ('time', 300), ('detail', 20000), ('status', 100), ('notes', 2000)]):
            raise ValueError('Invalid review item')
    for text in value['coverage'] + value['limitations']:
        if not isinstance(text, str) or len(text) > 10000:
            raise ValueError('Invalid report text')
    return value


def render_incident_pdf(value):
    data = validate_report(value)
    font_dir = Path(reportlab.__file__).parent / 'fonts'
    for name, filename in [('Ocular', 'Vera.ttf'), ('Ocular-Bold', 'VeraBd.ttf')]:
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
    pdfmetrics.registerFontFamily('Ocular', normal='Ocular', bold='Ocular-Bold', italic='Ocular', boldItalic='Ocular-Bold')
    supported = pdfmetrics.getFont('Ocular').face.charToGlyph
    replaced = False

    def text(value):
        nonlocal replaced
        value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', str(value))
        value = value.translate(str.maketrans({'\u2010': '-', '\u2011': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
                                               '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"'}))
        result = []
        for character in value:
            if character in '\n\t' or ord(character) in supported:
                result.append(character)
            else:
                result.append(f'[U+{ord(character):04X}]')
                replaced = True
        return escape(''.join(result)).replace('\n', '<br/>')

    ink, muted = colors.HexColor('#25394a'), colors.HexColor('#526574')
    base = dict(fontName='Ocular', fontSize=9, leading=14, textColor=ink, alignment=TA_LEFT,
                splitLongWords=True, spaceAfter=7)
    styles = {name: ParagraphStyle(name, **{**base, **changes}) for name, changes in {
        'body': {}, 'small': {'fontSize': 8, 'leading': 12, 'textColor': muted},
        'title': {'fontName': 'Ocular-Bold', 'fontSize': 22, 'leading': 27, 'spaceAfter': 10},
        'section': {'fontName': 'Ocular-Bold', 'fontSize': 13, 'leading': 18, 'spaceBefore': 16, 'spaceAfter': 9, 'keepWithNext': True},
        'item': {'fontName': 'Ocular-Bold', 'fontSize': 10, 'leading': 15, 'spaceBefore': 11, 'keepWithNext': True},
        'itemmeta': {'fontSize': 8, 'leading': 12, 'textColor': muted, 'keepWithNext': True},
        'table': {'fontSize': 8, 'leading': 12, 'spaceAfter': 0},
    }.items()}
    para = lambda value, style='body': Paragraph(text(value), styles[style])
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=44, leftMargin=44, topMargin=58, bottomMargin=52,
                            title='Potential incident review report', author='Ocular', pageCompression=1)
    story = [para('Potential incident\nreview report', 'title'),
             para(f"OCULAR / {data['mode'].upper()} / HUMAN REVIEW REQUIRED", 'small'),
             para('This report lists observations to check for potential examination irregularities. It does not identify cheating, intent, or a disciplinary finding.'),
             para('Head movements alone cannot establish misconduct. Writing, looking around briefly, occlusion and model errors can produce review prompts.'),
             para('Session record', 'section')]
    metadata = [('Source', data['source']), ('Report ID', data['id']), ('Generated at (UTC)', data['generatedAt']), *data['metadata']]
    rows = [[para('Record', 'table'), para('Value', 'table')], *[[para(key, 'table'), para(val, 'table')] for key, val in metadata]]
    table = LongTable(rows, colWidths=[124, A4[0] - 88 - 124], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8edf1')),
                              ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 8),
                              ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 7),
                              ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                              ('LINEBELOW', (0, 0), (-1, -1), .3, colors.HexColor('#d6dfe5'))]))
    story += [table, para('Summary', 'section'), para(data['summary']), para('Observations for review', 'section')]
    if not data['items']:
        story.append(para('No review observations are listed in the retained results. This does not establish that no relevant incident occurred or that all heads were observed.'))
    for index, item in enumerate(data['items'], 1):
        story += [para(f"{index}. {item['label']}", 'item'), para(f"{item['time']} | {item['status']}", 'itemmeta'), para(item['detail'])]
        if item['notes']:
            story += [para('Reviewer notes', 'small'), para(item['notes'])]
    if data['omittedItems']:
        story.append(para(f"Report limit: {data['omittedItems']} further review observations are omitted. This is an incomplete item list; review the original records where available."))
    story += [para('Coverage and uncertainty', 'section')]
    story += [para(line) for line in data['coverage']]
    signoff = [para(f"Reviewer: {data['reviewer'] or 'Not entered'}"),
               para(f"Local acknowledgement: {data['signedOffAt']}" if data['signedOffAt'] else 'Draft - awaiting human review and sign-off.'),
               para('A typed name and local acknowledgement do not verify identity or constitute a digital signature.', 'small')]
    if data['notes']:
        story += [para('Proctor notes and human sign-off', 'section'), para(data['notes']), KeepTogether(signoff)]
    else:
        story.append(KeepTogether([para('Proctor notes and human sign-off', 'section'), para('No proctor notes have been supplied.'), *signoff]))
    story.append(para('Method limitations', 'section'))
    story += [para(line) for line in data['limitations']]
    if replaced:
        story.append(para('Characters outside the embedded font are represented by explicit [U+XXXX] Unicode codepoint tokens. Original names and notes remain in the source records.', 'small'))

    def page_footer(canvas, document):
        canvas.saveState()
        canvas.setFillColor(muted); canvas.setFont('Ocular', 8)
        canvas.drawString(44, A4[1] - 32, 'OCULAR / EXAMINATION OBSERVATION REVIEW')
        canvas.setStrokeColor(colors.HexColor('#d6dfe5')); canvas.line(44, 40, A4[0] - 44, 40)
        canvas.drawString(44, 27, 'For human review. Head movement alone does not establish cheating.')
        canvas.drawRightString(A4[0] - 44, 27, f'Page {document.page}')
        canvas.restoreState()

    doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
    return output.getvalue()

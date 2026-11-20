"""The faculty seat check layout for live camera reports.

Faculty read this after an exam to decide which seats to look at again. Page 1 summarises (seats ranked by
alerts not dismissed, a seat map, a timeline), page 2 shows each alert with its photo, page 3 lists what Ocular
could not see and leaves room for the faculty member's own decision. Nothing here judges a student.
"""
import math

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Image, KeepTogether, PageBreak, Spacer, Table, TableStyle

MAX_TEXT = 2000
MAX_SEATS = 20
MAX_ALERTS = 500
MAX_IMAGES = 200
STATUSES = {'look-again', 'dismissed'}
KINDS = {'checked', 'not-reviewed', 'dismissed'}

INK = colors.HexColor('#1f2c3b')
MUTED = colors.HexColor('#545e69')
RULE = colors.HexColor('#dfe2e6')
SOFT = colors.HexColor('#f6f7f9')
BUTTER = colors.HexColor('#f5ed9c')
TINT = colors.HexColor('#fbf8e2')
WARM = colors.HexColor('#fbf3ea')
ORANGE = colors.HexColor('#b45309')
GREY = colors.HexColor('#9aa4af')
TRACK = colors.HexColor('#eef0f3')
HIDDEN = colors.HexColor('#c3cad3')
OFF = colors.Color(.94, .79, .66, alpha=.85)
MARK_COLOURS = {'checked': INK, 'not-reviewed': ORANGE, 'dismissed': GREY}

# The frame's usable width: page minus 44 pt margins, minus the frame's own 6 pt padding on each side.
WIDTH = A4[0] - 88 - 12


# ---------------------------------------------------------------------------- validation

def _text(value, name):
    if not isinstance(value, str) or len(value) > MAX_TEXT:
        raise ValueError(f'Invalid faculty report {name}')
    return value


def _count(value, name):
    if type(value) is not int or value < 0:
        raise ValueError(f'Invalid faculty report {name}')


def _fraction(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f'Invalid faculty report {name}')


def _list(value, name, limit):
    if not isinstance(value, list) or len(value) > limit:
        raise ValueError(f'Invalid faculty report {name}')
    return value


def _dict(value, name):
    if not isinstance(value, dict):
        raise ValueError(f'Invalid faculty report {name}')
    return value


def validate_faculty(value, resolve):
    """Check every field the layout reads; `resolve(relative)` checks an alert photo (raises ValueError)."""
    fac = _dict(value, 'section')
    exam = _dict(fac.get('exam'), 'exam')
    for key in ('title', 'room', 'proctor'):
        _text(exam.get(key), f'exam {key}')
    for key in ('date', 'timeRange', 'quietSeats', 'rules', 'sessionLine'):
        _text(fac.get(key), key)
    _count(fac.get('seatsWatched'), 'seatsWatched')
    glance = _dict(fac.get('glance'), 'glance')
    for key in ('alerts', 'lookAgain', 'notReviewed', 'notWatchedMinutes'):
        _count(glance.get(key), f'glance {key}')
    for seat in _list(fac.get('seats'), 'seats', MAX_SEATS):
        _dict(seat, 'seat')
        if seat.get('status') not in STATUSES:
            raise ValueError('Invalid faculty report seat status')
        _count(seat.get('alerts'), 'seat alerts')
        for key in ('seat', 'saw', 'when', 'marks'):
            _text(seat.get(key), f'seat {key}')
    for seat in _list(fac.get('map'), 'map', MAX_SEATS):
        _dict(seat, 'map seat')
        _text(seat.get('label'), 'map label')
        if seat.get('status') not in STATUSES | {'none'} or type(seat.get('hidden')) is not bool:
            raise ValueError('Invalid faculty report map seat')
        roi = _list(seat.get('roi'), 'map roi', 4)
        if len(roi) != 4:
            raise ValueError('Invalid faculty report map roi')
        for edge in roi:
            _fraction(edge, 'map roi')
    timeline = _dict(fac.get('timeline'), 'timeline')
    for tick in _list(timeline.get('ticks'), 'ticks', 50):
        _dict(tick, 'tick'); _fraction(tick.get('at'), 'tick'); _text(tick.get('label'), 'tick label')
    for row in _list(timeline.get('rows'), 'rows', MAX_SEATS):
        _dict(row, 'row'); _text(row.get('label'), 'row label')
        for mark in _list(row.get('marks'), 'marks', MAX_ALERTS):
            _dict(mark, 'mark'); _fraction(mark.get('at'), 'mark')
            if mark.get('kind') not in KINDS:
                raise ValueError('Invalid faculty report mark kind')
        for span in _list(row.get('hidden'), 'hidden', 300):
            _dict(span, 'hidden span'); _fraction(span.get('from'), 'hidden'); _fraction(span.get('to'), 'hidden')
    for span in _list(timeline.get('off'), 'off', 100):
        _dict(span, 'off span'); _fraction(span.get('from'), 'off'); _fraction(span.get('to'), 'off')
    images, alerts = 0, 0
    for group in _list(fac.get('alertGroups'), 'alertGroups', MAX_SEATS):
        _dict(group, 'group'); _text(group.get('seat'), 'group seat')
        if group.get('status') not in STATUSES:
            raise ValueError('Invalid faculty report group status')
        for item in _list(group.get('alerts'), 'alerts', MAX_ALERTS):
            alerts += 1
            _dict(item, 'alert')
            for key in ('time', 'title', 'rule', 'note'):
                _text(item.get(key), f'alert {key}')
            if item.get('mark') not in ('Checked', 'Dismissed', None):
                raise ValueError('Invalid faculty report mark')
            for key in ('markedAt', 'imageNote'):
                if item.get(key) is not None:
                    _text(item[key], f'alert {key}')
            if item.get('image') is not None:
                images += 1
                resolve(_text(item['image'], 'image'))
    if alerts > MAX_ALERTS or images > MAX_IMAGES:
        raise ValueError('Too many faculty report alerts or photos')
    for spot in _list(fac.get('blindSpots'), 'blindSpots', 60):
        _dict(spot, 'blind spot')
        for key in ('what', 'when', 'reason'):
            _text(spot.get(key), f'blind spot {key}')
    for seat in _list(fac.get('reviewSeats'), 'reviewSeats', MAX_SEATS):
        _text(seat, 'review seat')
    if 'offLabel' in fac:
        _text(fac['offLabel'], 'offLabel')
    if 'omittedAlerts' in fac:
        _count(fac['omittedAlerts'], 'omittedAlerts')
    return fac


# ---------------------------------------------------------------------------- drawing helpers

def _numbered_canvas(confidential):
    """A canvas that draws 'Page N of M' and the confidential line once the page count is known."""
    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self.saveState()
                self.setStrokeColor(RULE)
                self.line(44, 40, A4[0] - 44, 40)
                self.setFillColor(MUTED)
                self.setFont('Ocular', 7.5)
                if confidential:
                    self.drawString(44, 28, 'Confidential: contains images of students. Keep only as long as your institution allows.')
                self.drawRightString(A4[0] - 44, 28, f'Page {self._pageNumber} of {total}')
                self.restoreState()
                super().showPage()
            super().save()
    return NumberedCanvas


def _checkbox(size=8):
    box = Drawing(size + 2, size + 2)
    box.add(Rect(1, 1, size, size, strokeColor=INK, strokeWidth=.8, fillColor=colors.white))
    return box


def _seat_map(seats):
    width, height = 190, 107
    top = 14
    drawing = Drawing(width, height + top + 2)
    drawing.add(Rect(0, 0, width, height, strokeColor=RULE, fillColor=SOFT, strokeWidth=.8))
    drawing.add(String(width / 2, height + 4, 'AS SEEN FROM THE CAMERA', fontName='Ocular-Bold', fontSize=6.5,
                       fillColor=MUTED, textAnchor='middle'))
    inner = 6
    for seat in seats:
        left, upper, right, lower = seat['roi']
        x = inner + left * (width - 2 * inner)
        w = max((right - left) * (width - 2 * inner), 6)
        y = inner + (1 - lower) * (height - 2 * inner)
        h = max((lower - upper) * (height - 2 * inner), 6)
        look = seat['status'] == 'look-again'
        drawing.add(Rect(x, y, w, h, fillColor=BUTTER if look else colors.white, strokeColor=INK if look else GREY,
                         strokeWidth=1.6 if look else .8, strokeDashArray=[2.5, 2] if seat['hidden'] else None, rx=2, ry=2))
        drawing.add(String(x + w / 2, y + h / 2 - 3, seat['label'], fontName='Ocular-Bold' if look else 'Ocular',
                           fontSize=9 if look else 8, fillColor=INK if seat['status'] != 'dismissed' else MUTED, textAnchor='middle'))
    return drawing


def _timeline(timeline, width):
    """The alert timeline, drawn to exactly `width` points so it never runs past its column."""
    label_width, row_height = 44, 13
    rows = timeline['rows']
    track = width - label_width - 6
    top = 14
    height = top + max(len(rows), 1) * row_height + 4
    drawing = Drawing(width, height)
    x0 = label_width
    for tick in timeline['ticks']:
        x = x0 + tick['at'] * track
        drawing.add(String(x, height - 9, tick['label'], fontName='Ocular', fontSize=6.5, fillColor=MUTED,
                           textAnchor='start' if tick['at'] < .02 else 'end' if tick['at'] > .98 else 'middle'))
    for index, row in enumerate(rows):
        y = height - top - (index + 1) * row_height + 3
        bold = any(mark['kind'] != 'dismissed' for mark in row['marks'])
        drawing.add(String(0, y + 1.5, row['label'], fontName='Ocular-Bold' if bold else 'Ocular', fontSize=7, fillColor=INK))
        drawing.add(Rect(x0, y, track, 7, fillColor=TRACK, strokeColor=None))
        for span in row['hidden']:
            drawing.add(Rect(x0 + span['from'] * track, y, max((span['to'] - span['from']) * track, 1.5), 7, fillColor=HIDDEN, strokeColor=None))
        for mark in row['marks']:
            drawing.add(Rect(x0 + mark['at'] * track - 1.25, y - 2, 2.5, 11, fillColor=MARK_COLOURS[mark['kind']], strokeColor=None))
    bottom = height - top - len(rows) * row_height
    for span in timeline['off']:
        x = x0 + span['from'] * track
        drawing.add(Rect(x, bottom, max((span['to'] - span['from']) * track, 1.5), len(rows) * row_height, fillColor=OFF,
                         strokeColor=ORANGE, strokeWidth=.5))
    for tick in timeline['ticks']:
        x = x0 + tick['at'] * track
        drawing.add(Line(x, bottom, x, height - top + 2, strokeColor=RULE, strokeWidth=.4))
    return drawing


def _legend_swatch(colour, wide=False):
    swatch = Drawing(12 if wide else 5, 9)
    swatch.add(Rect(0, 0, 12 if wide else 3, 9, fillColor=colour, strokeColor=None))
    return swatch


# ---------------------------------------------------------------------------- the layout

def build_story(fac, para, clean, resolve):
    """Flowables for the three parts. `para(markup, style)` makes a Paragraph from trusted markup; `clean(text)`
    escapes untrusted text for that markup; `resolve(relative)` returns a checked photo path."""
    exam = fac['exam']
    blank = lambda value, width=20: clean(value) if value.strip() else '_' * width
    story = []

    # Page 1 — summary.
    title = clean(exam['title']) if exam['title'].strip() else 'Exam: ' + '_' * 30
    header = [para('OCULAR · SEAT CHECK REVIEW', 'label'), para(title, 'h1'),
              para(f"{clean(fac['date'])} · {clean(fac['timeRange'])} · Room: {blank(exam['room'], 8)}", 'meta'),
              para(f"Proctor: {blank(exam['proctor'])} · {fac['seatsWatched']} seats watched by one camera at the front", 'meta')]
    tag = Table([[para('CONFIDENTIAL · CONTAINS STUDENT PHOTOS', 'tag')]], colWidths=[118])
    tag.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), BUTTER), ('BOX', (0, 0), (-1, -1), .6, colors.HexColor('#b9b06a')),
                             ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
    top = Table([[header, tag]], colWidths=[WIDTH - 124, 124])
    top.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    story += [top, Spacer(1, 10)]

    glance = fac['glance']
    off_label = fac.get('offLabel')
    seats_word = 'seat' if glance['lookAgain'] == 1 else 'seats'
    cells = [[para(str(glance['alerts']), 'big'), para('alerts during the exam', 'glance')],
             [para(f"{glance['lookAgain']} {seats_word}", 'big'), para('to look at again', 'glance')],
             [para(str(glance['notReviewed']), 'big'), para('alert you did not review' if glance['notReviewed'] == 1 else 'alerts you did not review', 'glance')],
             [para(f"{glance['notWatchedMinutes']} min", 'big'), para(clean(off_label) if off_label else 'not watched (camera off)', 'glance')]]
    boxes = Table([cells], colWidths=[WIDTH / 4] * 4)
    boxes.setStyle(TableStyle([('BOX', (0, 0), (0, 0), .7, RULE), ('BOX', (2, 0), (2, 0), .7, RULE), ('BOX', (3, 0), (3, 0), .7, RULE),
                               ('BOX', (1, 0), (1, 0), 1.6, INK), ('BACKGROUND', (1, 0), (1, 0), SOFT), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                               ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6), ('LEFTPADDING', (0, 0), (-1, -1), 8)]))
    story += [boxes, Spacer(1, 12), para('Seats to look at again', 'h2'),
              para('Seats with alerts you did not dismiss come first. A turn of the head is not evidence of cheating: use this list to decide whom to talk to.', 'body')]
    if fac['seats']:
        head = [para(text, 'th') for text in ('SEAT', 'STUDENT', 'WHAT OCULAR SAW', 'WHEN', 'YOUR MARKS')]
        rows = [head]
        for seat in fac['seats']:
            status = '<font color="#6b4e00"><b>LOOK AGAIN</b></font>' if seat['status'] == 'look-again' else '<font color="#545e69">You dismissed</font>'
            rows.append([para(f"<b>{clean(seat['seat'])}</b><br/><font size=\"7\">{status}</font>", 'seat'),
                         para('<font color="#767676">________________</font>', 'td'),
                         para(clean(seat['saw']), 'td'), para(clean(seat['when']), 'td'), para(clean(seat['marks']), 'td')])
        table = Table(rows, colWidths=[64, 90, 161, 80, WIDTH - 395], repeatRows=1)
        style = [('LINEBELOW', (0, 0), (-1, 0), 1.2, INK), ('LINEBELOW', (0, 1), (-1, -1), .5, RULE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                 ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 6), ('LEFTPADDING', (0, 0), (-1, -1), 4)]
        style += [('BACKGROUND', (0, index), (-1, index), TINT) for index, seat in enumerate(fac['seats'], 1) if seat['status'] == 'look-again']
        table.setStyle(TableStyle(style))
        story.append(table)
    else:
        story.append(para('No seats to look at again.', 'body'))
    if fac['quietSeats']:
        story.append(para(clean(fac['quietSeats']), 'small'))
    story.append(Spacer(1, 10))

    legend = Table([[_legend_swatch(INK), para('Checked', 'legend'), _legend_swatch(ORANGE), para('Not reviewed', 'legend'),
                     _legend_swatch(GREY), para('Dismissed', 'legend'), _legend_swatch(HIDDEN, True), para('Seat hidden', 'legend'),
                     _legend_swatch(OFF, True), para(f'Video {clean(off_label)}' if off_label else 'Camera off', 'legend')]],
                   colWidths=[7, 40, 7, 52, 7, 45, 14, 46, 14, 44 if not off_label else 80])
    legend.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 1), ('RIGHTPADDING', (0, 0), (-1, -1), 2), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    left = [para('Where the seats are', 'h3'), _seat_map(fac['map']),
            para('Numbered left to right as the camera sees them. Highlighted: look again. Dashed: hidden 10% or more of the exam.', 'small')]
    right = [para('When alerts happened', 'h3'), _timeline(fac['timeline'], WIDTH - 205 - 12), legend]
    pair = Table([[left, right]], colWidths=[205, WIDTH - 205])
    pair.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    story += [pair, Spacer(1, 10)]
    note = Table([[para(clean(fac['rules']), 'body')]], colWidths=[WIDTH])
    note.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), SOFT), ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
    story += [note, PageBreak()]

    # Page 2 — each alert with its photo.
    story += [para('Each alert, with its photo', 'h1'),
              para('Grouped by seat, most activity first. Each photo is one moment cropped to that seat. It cannot show what happened before or after.', 'body')]
    if not fac['alertGroups']:
        story.append(para('No alerts during this session.', 'body'))
    omitted = fac.get('omittedAlerts', 0)
    if omitted:
        story.append(para(f'{omitted} more alert{"s are" if omitted != 1 else " is"} not shown here. The numbers on page 1 count every alert.', 'body'))
    for group in fac['alertGroups']:
        look = group['status'] == 'look-again'
        count = len(group['alerts'])
        tagline = '<font color="#6b4e00"><b>LOOK AGAIN</b></font>' if look else ('you dismissed it' if count == 1 else 'you dismissed them')
        heading = para(f"<b>{clean(group['seat'])}</b>   <font size=\"8.5\">{tagline} · {count} alert{'s' if count != 1 else ''}</font>", 'group')
        rule = Table([[heading]], colWidths=[WIDTH])
        rule.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 1.2 if look else .8, INK if look else GREY),
                                  ('LEFTPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
        story += [Spacer(1, 8), rule, Spacer(1, 6)]
        photo_width = 150 if look else 100
        for item in group['alerts']:
            if item['image']:
                picture = Image(str(resolve(item['image'])))
                scale = min(photo_width / picture.imageWidth, (photo_width * .75) / picture.imageHeight)
                picture.drawWidth, picture.drawHeight = picture.imageWidth * scale, picture.imageHeight * scale
                photo = picture
            else:
                photo = Table([[para(clean(item['imageNote'] or 'Photo unavailable'), 'placeholder')]], colWidths=[photo_width], rowHeights=[photo_width * .6])
                photo.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#e6e9ee')), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
            lines = [para(f"<b>{clean(item['time'])} · {clean(item['title'])}</b>", 'alert'), para(clean(item['rule']), 'small')]
            if item['mark']:
                when = f" at {clean(item['markedAt'])}" if item['markedAt'] else ''
                lines.append(para(f"<b>Your mark:</b> {clean(item['mark'])}{when}", 'td'))
                if item['note']:
                    lines.append(para(f"<b>Your note:</b> “{clean(item['note'])}”", 'td'))
            else:
                lines.append(para('<font color="#8a3c00"><b>Not reviewed during the exam. Look at the photo and decide.</b></font>', 'td'))
                choices = Table([[_checkbox(), para('Nothing to follow up', 'td'), _checkbox(), para('Follow up', 'td')]], colWidths=[12, 100, 12, 70])
                choices.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
                lines.append(choices)
            card = Table([[photo, lines]], colWidths=[photo_width + 12, WIDTH - photo_width - 12])
            style = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 4), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]
            if not item['mark']:
                style.append(('BACKGROUND', (0, 0), (-1, -1), WARM))
            card.setStyle(TableStyle(style))
            story += [KeepTogether([card]), Spacer(1, 6)]
    story.append(PageBreak())

    # Page 3 — blind spots and the faculty member's review.
    story += [para('What Ocular could not see', 'h1'),
              para('No alert does not mean nothing happened. These are the times and seats Ocular could not watch.', 'body')]
    if fac['blindSpots']:
        rows = [[para(text, 'th') for text in ('WHAT', 'WHEN', 'LIKELY REASON')]]
        rows += [[para(f"<b>{clean(spot['what'])}</b>", 'td'), para(clean(spot['when']), 'td'), para(clean(spot['reason']), 'td')] for spot in fac['blindSpots']]
        table = Table(rows, colWidths=[150, 170, WIDTH - 320], repeatRows=1)
        table.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, 0), 1.2, INK), ('LINEBELOW', (0, 1), (-1, -1), .5, RULE),
                                   ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
        story.append(table)
    else:
        story.append(para('Ocular watched every seat for the whole session.', 'body'))

    review = [para('Write your decision for each seat after looking at the photos. Ocular leaves this blank on purpose.', 'body')]
    if fac['reviewSeats']:
        rows = [[para(f"<b>{clean(seat)}</b>", 'td'), _checkbox(), para('Follow up', 'td'), _checkbox(), para('No action', 'td'), ''] for seat in fac['reviewSeats']]
        table = Table(rows, colWidths=[70, 12, 60, 12, 60, WIDTH - 250], rowHeights=[22] * len(rows))
        table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'BOTTOM'), ('LINEBELOW', (5, 0), (5, -1), .6, GREY), ('LEFTPADDING', (0, 0), (-1, -1), 2)]))
        review.append(table)
    else:
        review.append(para('No seats need a decision.', 'body'))
    lines = Table([[para('<b>Overall notes</b>', 'td')], [''], [''], ['']], colWidths=[WIDTH - 24], rowHeights=[16, 20, 20, 20])
    lines.setStyle(TableStyle([('LINEBELOW', (0, 1), (-1, -1), .6, GREY), ('LEFTPADDING', (0, 0), (-1, -1), 2)]))
    third = (WIDTH - 24 - 32) / 3
    sign = Table([['', '', '', '', ''], [para('Reviewed by', 'small'), '', para('Signature', 'small'), '', para('Date', 'small')]],
                 colWidths=[third, 16, third, 16, third], rowHeights=[28, 16])
    sign.setStyle(TableStyle([('LINEBELOW', (0, 0), (0, 0), .8, INK), ('LINEBELOW', (2, 0), (2, 0), .8, INK), ('LINEBELOW', (4, 0), (4, 0), .8, INK),
                              ('LEFTPADDING', (0, 0), (-1, -1), 2)]))
    review += [Spacer(1, 6), lines, Spacer(1, 6), sign]
    box = Table([[review]], colWidths=[WIDTH])
    box.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), .8, HIDDEN), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 10)]))
    story += [Spacer(1, 10), para('Your review', 'h2'), box, Spacer(1, 12)]

    guide = Table([[[para('How to read this report', 'h3'),
                     para(clean(fac['rules']) + ' Glasses, lighting and how a student sits can cause alerts or hide a seat. '
                          'Talk to the student and use your own judgment before recording any conclusion.', 'body')]]], colWidths=[WIDTH])
    guide.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), SOFT), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    story += [KeepTogether([guide]), Spacer(1, 10), para(clean(fac['sessionLine']), 'small')]
    return story


STYLE_CHANGES = {
    'label': {'fontName': 'Ocular-Bold', 'fontSize': 7.5, 'leading': 10, 'textColor': MUTED, 'spaceAfter': 3},
    'h1': {'fontName': 'Ocular-Bold', 'fontSize': 19, 'leading': 23, 'textColor': INK, 'spaceAfter': 5},
    'h2': {'fontName': 'Ocular-Bold', 'fontSize': 12.5, 'leading': 16, 'textColor': INK, 'spaceAfter': 3, 'keepWithNext': True},
    'h3': {'fontName': 'Ocular-Bold', 'fontSize': 10.5, 'leading': 14, 'textColor': INK, 'spaceAfter': 4, 'keepWithNext': True},
    'meta': {'fontSize': 9, 'leading': 13, 'textColor': colors.HexColor('#3f4a56'), 'spaceAfter': 1},
    'tag': {'fontName': 'Ocular-Bold', 'fontSize': 6.5, 'leading': 9, 'textColor': colors.HexColor('#3d3a1c'), 'spaceAfter': 0},
    'big': {'fontName': 'Ocular-Bold', 'fontSize': 17, 'leading': 20, 'textColor': INK, 'spaceAfter': 1},
    'glance': {'fontSize': 8, 'leading': 10, 'textColor': MUTED, 'spaceAfter': 0},
    'th': {'fontName': 'Ocular-Bold', 'fontSize': 7, 'leading': 9, 'textColor': MUTED, 'spaceAfter': 0},
    'td': {'fontSize': 8.5, 'leading': 11.5, 'textColor': INK, 'spaceAfter': 2},
    'seat': {'fontSize': 11, 'leading': 13, 'textColor': INK, 'spaceAfter': 0},
    'group': {'fontSize': 12, 'leading': 15, 'textColor': INK, 'spaceAfter': 0},
    'alert': {'fontSize': 10, 'leading': 13, 'textColor': INK, 'spaceAfter': 3},
    'placeholder': {'fontSize': 8, 'leading': 10, 'textColor': MUTED, 'alignment': 1, 'spaceAfter': 0},
    'legend': {'fontSize': 6.5, 'leading': 8, 'textColor': colors.HexColor('#3f4a56'), 'spaceAfter': 0},
    'small': {'fontSize': 7.5, 'leading': 10, 'textColor': MUTED, 'spaceAfter': 3},
    'body': {'fontSize': 8.5, 'leading': 12, 'textColor': colors.HexColor('#3f4a56'), 'spaceAfter': 5},
}

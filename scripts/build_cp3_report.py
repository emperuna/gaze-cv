"""Build four-page CP3 results PDF and failure gallery from evaluator JSON."""
import argparse
from collections import Counter
import json
from pathlib import Path
import textwrap

import cv2
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np

from gaze.cp3_report import select_failures
from gaze.evaluation import DIRECTIONS, PREDICTIONS
from gaze.pipeline import FaceObservation, ImageResult
from gaze.preprocessing import read_image, write_image
from gaze.visualization import annotate


def paragraph(fig, x, y, text, width=102, size=9, color='#24344a'):
    lines = '\n'.join(textwrap.fill(part, width) for part in text.split('\n'))
    fig.text(x, y, lines, fontsize=size, va='top', color=color, linespacing=1.4)


def page(title, number):
    fig = plt.figure(figsize=(8.27, 11.69), facecolor='white')
    fig.text(.07, .955, 'GAZE  /  CP3 CORE IMPLEMENTATION & TESTING', size=9, color='#53667c')
    fig.text(.07, .915, title, size=20, weight='bold', color='#102a43')
    fig.text(.07, .035, 'Head orientation supports instructor review; it does not establish misconduct.', size=8, color='#53667c')
    fig.text(.92, .035, str(number), size=9)
    return fig


def matrix_axes(fig, bounds, method, result):
    ax = fig.add_axes(bounds)
    values = np.array([[result['metrics']['confusion_matrix'][a][b] for b in PREDICTIONS] for a in DIRECTIONS])
    ax.imshow(values, cmap='Blues', vmin=0, vmax=max(1, values.max()))
    for y in range(4):
        for x in range(5):
            ax.text(x, y, str(values[y, x]), ha='center', va='center', fontsize=9,
                    color='white' if values[y, x] > values.max()*.6 else '#102a43')
    ax.set_xticks(range(5), PREDICTIONS, rotation=35, ha='right', fontsize=8)
    ax.set_yticks(range(4), DIRECTIONS, fontsize=8)
    ax.set_title(method, fontsize=11)
    ax.set_xlabel('Predicted', fontsize=9); ax.set_ylabel('Reference', fontsize=9)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--evidence-dir', required=True, type=Path)
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    args.evidence_dir = args.evidence_dir.resolve()
    args.output = args.output.resolve()
    report = json.loads(args.results.read_text(encoding='utf-8'))
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    methods = report['methods']; head = methods['head']; baseline = methods['baseline']
    chosen = select_failures(head['records'], 12)
    if args.output.exists() or (args.evidence_dir/'gallery').exists():
        raise ValueError('Report or gallery exists; choose new destinations')
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    gallery = args.evidence_dir/'gallery'; gallery.mkdir()
    gallery_records = []
    for index, record in enumerate(chosen, 1):
        image = read_image(root/record['image'])
        value = record['observations']
        detections = [FaceObservation(**item) for item in value['detections']]
        drawn = annotate(image, ImageResult(value['width'], value['height'], detections, value['processing_ms'], value['preprocessing']))
        path = gallery/f'{index:02d}-{record["id"]}.jpg'
        write_image(path, drawn)
        gallery_records.append({**record, 'gallery_image': str(path.relative_to(root))})
    (args.evidence_dir/'gallery.json').write_text(json.dumps(gallery_records, indent=2)+'\n', encoding='utf-8')
    matrix = page('Direction confusion matrices', 1)
    matrix_axes(matrix, [.12, .50, .32, .28], 'Geometric baseline', baseline)
    matrix_axes(matrix, [.58, .50, .32, .28], 'Learned head model', head)
    matrix.savefig(args.evidence_dir/'confusion-matrices.png', dpi=150); plt.close(matrix)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with PdfPages(args.output, metadata={'Title': 'GAZE CP3 preliminary results', 'Author': 'GAZE team', 'Subject': 'Frozen initial testing; human label review and live demonstration pending'}) as pdf:
        fig = page('Integrated pipeline and fixed test set', 1)
        paragraph(fig, .07, .865, 'Team: Marc Justin Alberto, Jose III Aquino, Jeremy Garin. Phase 3 hand-in: 29 October 2026, 11:30 PM; class check: 30 October. This is preliminary evidence, not instructor acceptance.')
        paragraph(fig, .07, .78, 'Main method: Gold-YOLO head detection followed by 6DRepNet360 full-rotation estimation. It needs no facial landmarks or per-input seat calibration in automatic mode. Baseline: MediaPipe facial landmarks plus eye/nose/chin ratios. Both run on the identical prepared images.')
        paragraph(fig, .07, .665, 'Pipeline: decoded BGR image -> model-specific preprocessing -> head/face detection -> rotation or geometric ratios -> direction and explicit unknowns -> annotated PNG/AVI plus JSON labels and counts. Counts are observations, not unique identities. Saved video uses source-frame timestamps and requires constant frame rate.')
        paragraph(fig, .07, .54, 'Head preprocessing: whole-image 640-square RGB /255 tensor; detected crop expanded 1.2x, resized to 256, center-cropped to 224 and ImageNet-normalized. The reconstructed rotation maps the forward head axis into camera axes. Fixed yaw/down thresholds are 25 degrees; mixed side/down, upward, poor-quality and unsupported poses remain unknown.')
        paragraph(fig, .07, .395, 'Fixed set: 63 images from 15 base frames and 3 target subjects/recordings. Twelve portrait bases each have original, low-light, blur, occlusion and reduced-size variants (60 images); 3 masked classroom crops add natural clutter. No local model fitting or threshold tuning used these sources. Labels were visually assigned before inference; human cross-check is pending. Final Pointing04 test images remain locked.')
        paragraph(fig, .07, .24, 'These are single-subject classification examples, mostly portrait stress proxies. Adjacent frames and variants are correlated; 63 images do not mean 63 independent subjects. Labels describe visible head direction, not measured angles or eye gaze. Synthetic conditions are explicitly identified. Upstream pretraining overlap cannot be fully audited.')
        fig.text(.07, .10, 'python scripts/run.py --input teacher-inputs --output-dir outputs/runs/live --method head', size=8, family='monospace')
        pdf.savefig(fig); fig.savefig(root/'.work/cp3-report-page-1.png', dpi=120); plt.close(fig)

        fig = page('Measured comparison on identical inputs', 2)
        rows = []
        for name, result in [('Baseline', baseline), ('Main: head model', head)]:
            m, t = result['metrics'], result['timing']
            rows.append([name, f"{m['correct']}/{m['eligible']}", f"{m['accuracy']*100:.1f}%", f"{m['macro_f1']:.3f}", f"{m['coverage']*100:.1f}%", f"{t['ms_per_image']:.2f}", f"{t['images_per_second']:.2f}"])
        ax = fig.add_axes([.07,.735,.86,.115]); ax.axis('off')
        table = ax.table(cellText=rows, colLabels=['Method','Correct','Accuracy','Macro-F1','Coverage','ms/image','images/s'], loc='center', cellLoc='center')
        table.auto_set_font_size(False); table.set_fontsize(8); table.scale(1,1.8)
        paragraph(fig,.07,.70,'Accuracy includes all 63 references; missed detections and unknowns are incorrect. Macro-F1 averages four fixed classes, including zero-support handling. Coverage is usable directions / all references. More than one detection makes a single-subject image ambiguous; no best-face selection. These metrics are not multi-person detection AP or event accuracy.',size=8,width=115)
        original=head['by_variant']['original']['metrics']; original_b=baseline['by_variant']['original']['metrics']
        paragraph(fig,.07,.59,f"Original images: baseline {original_b['correct']}/{original_b['eligible']}, main {original['correct']}/{original['eligible']}. On six unmodified portrait side profiles the main model gets 6/6 correct, baseline 1/6; this subgroup benefit does not establish overall improvement. Overall main accuracy is lower. No thresholds were changed after seeing these results.",size=9)
        matrix_axes(fig,[.12,.275,.32,.25],'Baseline',baseline); matrix_axes(fig,[.58,.275,.32,.25],'Main model',head)
        cm=head['metrics']['confusion_matrix']; unknown=sum(cm[c]['unknown'] for c in DIRECTIONS)
        paragraph(fig,.07,.19,f"Rows are reference classes; columns are predictions. Main model: {unknown}/63 unknown; {cm['down']['forward']} down references are predicted forward. A large unknown column indicates observation failure or rejection, not correct classification. The fixed 25-degree down threshold leaves the original downward examples (estimated about 20-22 degrees) labeled forward.",size=8,width=115)
        env=report['environment']
        paragraph(fig,.07,.105,f"Laptop: Apple M5 MacBook Air, {env['machine']}, Python {env['python']}, {env['os']}. CPU inference; sequential baseline then main. Timing includes decode, preprocessing, inference and record construction; excludes model load, checksum preflight and rendering/writes. No explicit warmup excluded. This is one initial run; it is not whole-video real-time FPS.",size=8,width=115)
        pdf.savefig(fig);fig.savefig(root/'.work/cp3-report-page-2.png', dpi=120);plt.close(fig)

        fig = page('Twelve recorded main-model failures', 3)
        paragraph(fig,.07,.865,'Deterministic round-robin selection across input conditions; every panel is an actual recorded error. Labels show reference -> prediction. Gallery selection affects presentation only; aggregate counts include every failure. See gallery.json for full predictions and reasons.',size=8,width=115)
        for index, record in enumerate(gallery_records):
            col,row=index%3,index//3
            ax=fig.add_axes([.065+col*.30,.655-row*.185,.275,.14])
            image=read_image(root/record['gallery_image'])
            ax.imshow(cv2.cvtColor(image,cv2.COLOR_BGR2RGB));ax.axis('off')
            ax.set_title(f"{index+1}. {record['cause']}\n{record['expected']} -> {record['predicted']}",fontsize=7)
        paragraph(fig,.07,.082,'Sources: cottonbro studio (Pexels 5474326), Nicola Barts (7924513), RDNE Stock project (8363848). Pexels license permits use/modification; no endorsement is implied. Images illustrate model behavior only.',size=7,width=130)
        pdf.savefig(fig);fig.savefig(root/'.work/cp3-report-page-3.png', dpi=120);plt.close(fig)

        fig = page('Error groups, next changes and reproduction', 4)
        counts='; '.join(f"{k}: {v}" for k,v in sorted(head['failure_counts'].items()))
        paragraph(fig,.07,.86,f"Main-model failures by assigned input condition ({sum(head['failure_counts'].values())} total): {counts}. These are observed conditions, not proven causal diagnoses. Recorded unknown reasons distinguish detector misses, blur rejection and unsupported pose estimates.")
        paragraph(fig,.07,.735,'1. Blur/low light: test a better head detector and validated preprocessing on a separate development set. Expected effect: higher detection coverage and fewer unusable poses on a new stress set; target at least +10 percentage points of coverage without lowering overall accuracy.')
        paragraph(fig,.07,.615,'2. Downward and mild sideways poses: obtain independent angle/ordinal labels and select class boundaries on development data. Expected effect: fewer down -> forward and right -> forward errors. Target at least +0.10 down/right recall on a new held-out set; never select thresholds using this CP3 set.')
        paragraph(fig,.07,.49,'3. Occlusion and reduced-size heads: compare multiscale detection and temporal evidence with explicit gaps on labeled development clips. Expected effect: fewer missed heads and less jitter, while keeping unknowns explicit. Target +10 points coverage with no increase in false review events; measure speed cost separately.')
        paragraph(fig,.07,.35,'Reproduce: install the pinned base and head requirements, download verified models and the three pinned source videos, run prepare_cp3.py, then evaluate_cp3.py with the versioned manifest and frozen protocol. Regeneration verifies image hashes without rewriting the manifest. The submission index supplies exact commands. Numbers come from outputs/evidence/cp3-core/comparison.json; no manual table entries replace evaluator measurements.',size=8,width=115)
        paragraph(fig,.07,.235,'Limits and remaining checks: three subjects, correlated frames, synthetic stress and pending human label review limit generalization. Main method does not improve overall baseline accuracy, so the excellent primary-method rubric tier is not established. Teacher-provided inputs and each member\'s explanation remain in-class checks. Seat/event accuracy and live camera support are outside this automatic-mode result.',size=8,width=115)
        paragraph(fig,.07,.13,'Explain one failure: trace detection score/quality gate -> pose angles -> 25-degree decision -> output. Know why a masked face may defeat landmark geometry, why a head can be detected but direction rejected, and why head orientation cannot prove where the eyes are looking. Every member must rehearse their own explanation.',size=8,width=115)
        pdf.savefig(fig);fig.savefig(root/'.work/cp3-report-page-4.png', dpi=120);plt.close(fig)
    print(f'Wrote four-page report and {len(chosen)}-failure gallery: {args.output}')


if __name__ == '__main__': main()

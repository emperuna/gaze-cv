"""Recreate the predeclared CP3 examples from three checksum-pinned local videos.

Download URLs and terms: docs/checkpoints/cp3-hand-in/data-card.md.
No models are loaded and no predictions influence selection or labels.
"""
import hashlib
import json
from pathlib import Path
import sys
import cv2

from gaze.cp3_data import stress_variant
from gaze.preprocessing import write_image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    '5474326': {'author': 'cottonbro studio', 'sha256': 'e401a1cc953f919730eed205def342ac3d73ce46c15bf1f66069d66e89646978',
                'url': 'https://videos.pexels.com/video-files/5474326/5474326-hd_2048_1080_25fps.mp4',
                'page': 'https://www.pexels.com/video/a-man-turning-his-head-sideways-5474326/'},
    '7924513': {'author': 'Nicola Barts', 'sha256': '1c73068f0db0215dcb765fd8dd5e56556217d171784a93cfa3606f8aa32743c4',
                'url': 'https://videos.pexels.com/video-files/7924513/7924513-hd_1080_1920_24fps.mp4',
                'page': 'https://www.pexels.com/video/bald-man-looking-down-7924513/'},
    '8363848': {'author': 'RDNE Stock project', 'sha256': '423969064835fe3df13f490a3678ae41f195511150f4fffd9a2b2857a09c7f2f',
                'url': 'https://videos.pexels.com/video-files/8363848/8363848-hd_1920_1080_30fps.mp4',
                'page': 'https://www.pexels.com/video/kids-having-a-class-8363848/'}}


def main():
    output = ROOT/'data/processed/cp3'
    manifest_path = ROOT/'data/annotations/cp3.json'
    if output.exists():
        raise ValueError('CP3 prepared data exists; do not replace a fixed set')
    expected_manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else None
    for source, spec in SOURCES.items():
        path = ROOT/f'data/raw/cp3/{source}.mp4'
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != spec['sha256']:
            raise ValueError(f'Missing or changed source {source}; use the pinned URL in the data card')
    selections = [('5474326', frame, label, None) for label, frames in
                  [('forward', [0, 289, 636]), ('left', [115, 173, 231]), ('right', [404, 462, 520])]
                  for frame in frames]
    selections += [('7924513', frame, 'down', None) for frame in [0, 95, 191]]
    selections += [('8363848', frame, label, [870, 400, 1070, 600]) for frame, label in [(0, 'forward'), (135, 'right'), (202, 'right')]]
    samples = []
    output.mkdir(parents=True)
    for source, frame_index, label, crop in selections:
        capture = cv2.VideoCapture(str(ROOT/f'data/raw/cp3/{source}.mp4'))
        try:
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, image = capture.read()
        finally:
            capture.release()
        if not ok: raise ValueError(f'Cannot decode {source} frame {frame_index}')
        if crop:
            x0, y0, x1, y1 = crop
            image = image[y0:y1, x0:x1]
        else:
            image = cv2.resize(image, (640, round(image.shape[0]*640/image.shape[1])), interpolation=cv2.INTER_AREA)
        variants = ['original'] if crop else ['original', 'low_light', 'blur', 'occlusion', 'small']
        for variant in variants:
            ident = f'{source}-{frame_index:04d}-{variant}'
            path = output/f'{ident}.png'
            pixels = stress_variant(image, variant)
            write_image(path, pixels)
            cause = 'mask_and_classroom_clutter' if crop else ('profile_angle' if label in ['left', 'right'] else 'clean_pose')
            if variant != 'original': cause = variant
            samples.append({'id': ident, 'image': str(path.relative_to(ROOT)),
                            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'source': f'pexels-{source}',
                            'subject': f'pexels-{source}-target', 'label': label, 'variant': variant, 'cause': cause,
                            'frame_index': frame_index, 'crop_xyxy': crop, 'base_id': f'{source}-{frame_index:04d}',
                            'width': pixels.shape[1], 'height': pixels.shape[0]})
    manifest = {'schema_version': 1, 'purpose': 'cp3_fixed_test', 'sources': SOURCES,
                'selection': '15 base frames selected and visually labeled before any inference on these sources; 12 portrait bases have four synthetic variants each, plus 3 natural masked classroom crops',
                'labeler': 'agent visual annotation before scoring; human cross-check pending',
                'excluded_subjects': [f'pointing04-{i:02d}' for i in range(1, 16)],
                'excluded_sources': ['pointing04', 'pexels-8419341', 'pexels-6672299', 'pexels-7092229', 'FourPeople'],
                'limitations': ['Only three target subjects and recordings; adjacent frames and synthetic variants are correlated, not independent samples.',
                                'Labels are ordinal visual head directions, not measured pose angles; human label cross-check pending.',
                                'No local training or tuning used these sources; upstream pretrained training-image overlap cannot be fully audited.',
                                'Classroom examples are cropped single-subject classification cases; most images are portrait stress proxies.',
                                'Synthetic low light, blur, occlusion and reduced size are separately identified; they do not establish natural-condition performance.'],
                'samples': samples}
    if expected_manifest is not None:
        if manifest != expected_manifest:
            raise ValueError('Reconstructed data differs from the versioned manifest; manifest preserved')
    else:
        manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(f'Prepared {len(samples)} fixed samples without model inference')


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError) as error:
        print(f'Preparation failed: {error}', file=sys.stderr); raise SystemExit(2)

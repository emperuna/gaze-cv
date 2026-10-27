"""Deterministic selection of recorded errors for the CP3 gallery."""
from collections import defaultdict, deque


def select_failures(records, count=12):
    groups = defaultdict(deque)
    seen = set()
    for row in records:
        if row['expected'] != row['predicted'] and row['id'] not in seen:
            groups[row['cause']].append(row)
            seen.add(row['id'])
    if len(seen) < count:
        raise ValueError(f'Need {count} actual failures, found {len(seen)}')
    chosen = []
    while len(chosen) < count:
        for cause in sorted(groups):
            if groups[cause] and len(chosen) < count:
                chosen.append(groups[cause].popleft())
    return chosen

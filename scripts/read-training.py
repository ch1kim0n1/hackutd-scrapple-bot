"""Stream exported training examples using only Python's standard library.

Optional PyTorch use:
    torch.tensor(example['x']), torch.tensor(example['xMask'])
Filter kind='own_bid' and accepted actions for private-state policy training.
"""
import argparse
import gzip
import json
from pathlib import Path


def iter_examples(snapshot, split="train", kind=None, accepted_only=False):
    root = Path(snapshot)
    manifest = json.loads((root / "manifest.json").read_text())
    for shard in manifest["shards"]:
        if shard["split"] != split:
            continue
        with gzip.open(root / shard["file"], "rt") as stream:
            for line in stream:
                sample = json.loads(line)
                if kind and sample["kind"] != kind:
                    continue
                if accepted_only and not (
                    sample["action"].get("accepted") is True
                    and sample["action"].get("status") in ("submitted", "abstain")
                ):
                    continue
                yield sample


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    parser.add_argument("--split", choices=("train", "validation", "test"), default="train")
    parser.add_argument("--kind")
    parser.add_argument("--accepted-only", action="store_true")
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args()
    for i, example in enumerate(iter_examples(args.snapshot, args.split, args.kind, args.accepted_only)):
        if i >= args.limit:
            break
        print(json.dumps(example))

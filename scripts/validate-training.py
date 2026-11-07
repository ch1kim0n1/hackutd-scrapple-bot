"""Verify a complete exported snapshot, its hashes, features, and split membership."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


def validate(snapshot):
    root = Path(snapshot)
    manifest = json.loads((root / "manifest.json").read_text())
    membership = {row["id"]: row["split"] for row in manifest["matches"]}
    assert len(membership) == len(manifest["matches"]), "duplicate match in manifest"
    counts = {name: 0 for name in ("train", "validation", "test")}
    kinds = {}
    for shard in manifest["shards"]:
        digest = hashlib.sha256()
        rows = 0
        with gzip.open(root / shard["file"], "rb") as stream:
            for raw in stream:
                digest.update(raw)
                row = json.loads(raw)
                assert membership[row["matchId"]] == shard["split"], "match leaked across splits"
                assert len(row["x"]) == len(row["xMask"]) == len(manifest["featureNames"])
                assert all(mask in (0, 1) for mask in row["xMask"])
                assert row["schemaVersion"] == manifest["schemaVersion"]
                if row["kind"] == "public_bid" and not row["action"]["bidAmountKnown"]:
                    assert row["action"]["bidAmount"] is None, "unknown bid imputed as a label"
                kinds[row["kind"]] = kinds.get(row["kind"], 0) + 1
                rows += 1
        assert rows == shard["examples"], "shard count mismatch"
        assert digest.hexdigest() == shard["uncompressedSha256"], "shard hash mismatch"
        counts[shard["split"]] += rows
    assert counts == manifest["counts"], "snapshot count mismatch"
    return {"games": len(membership), "counts": counts, "kinds": kinds, "valid": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    args = parser.parse_args()
    print(json.dumps(validate(args.snapshot)))

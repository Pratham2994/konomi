#!/usr/bin/env sh
# Pack the serving artifacts for the Docker build. Commit the result: the Dockerfile unpacks it.
# Usage: sh scripts/pack-artifacts.sh  ->  deploy/konomi-artifacts.tar.gz
set -e
cd "$(dirname "$0")/.."
mkdir -p deploy
tar -czf deploy/konomi-artifacts.tar.gz -C data/build \
  artifacts/items.parquet artifacts/multvae.npz artifacts/ease_topk.npz artifacts/axes.npy artifacts/axes.json \
  artifacts/clusters.json artifacts/calibration.json artifacts/manifest.json artifacts/item_quality.npy
ls -la deploy/konomi-artifacts.tar.gz

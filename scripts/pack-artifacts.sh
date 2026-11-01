#!/usr/bin/env sh
# Pack the serving artifacts for the Docker build (upload the result somewhere the build can download it,
# e.g. a GitHub release asset). Usage: sh scripts/pack-artifacts.sh  ->  dist/konomi-artifacts.tar.gz
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
tar -czf dist/konomi-artifacts.tar.gz -C data/build \
  artifacts/items.parquet artifacts/multvae.npz artifacts/ease_topk.npz artifacts/axes.npy artifacts/axes.json \
  artifacts/clusters.json artifacts/calibration.json artifacts/manifest.json artifacts/item_quality.npy
ls -la dist/konomi-artifacts.tar.gz

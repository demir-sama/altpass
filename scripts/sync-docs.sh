#!/usr/bin/env bash
# Keeps root copies of the Devpost planning docs identical to devpost/*.md
set -e
cd "$(dirname "$0")/.."
for f in scope prd spec; do cp "devpost/$f.md" "$f.md"; done

#!/bin/sh
set -e

mkdir -p server/uploads/task server/uploads/certificates

exec node server/cluster.js

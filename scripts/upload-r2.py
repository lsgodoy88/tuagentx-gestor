#!/usr/bin/env python3
"""Sube /tmp/next-build.tar.gz a R2. Vars de entorno: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, BUILD_KEY"""
import boto3, os, sys

required = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'BUILD_KEY']
missing = [k for k in required if not os.environ.get(k)]
if missing:
    print(f"❌ Variables faltantes: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

s3 = boto3.client(
    's3',
    endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    region_name='auto',
)
build_key = os.environ['BUILD_KEY']
s3.upload_file('/tmp/next-build.tar.gz', os.environ['R2_BUCKET'], build_key)
print(f"✓ Subido a R2: {build_key}")

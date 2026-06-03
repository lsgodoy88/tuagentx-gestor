#!/usr/bin/env python3
"""Retiene los últimos 10 builds en R2, elimina el resto."""
import boto3, os, sys

s3 = boto3.client('s3',
    endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    region_name='auto',
)
resp = s3.list_objects_v2(Bucket=os.environ['R2_BUCKET'], Prefix='deploys/gestor-')
objs = sorted(resp.get('Contents', []), key=lambda x: x['LastModified'], reverse=True)
to_delete = objs[10:]
for o in to_delete:
    s3.delete_object(Bucket=os.environ['R2_BUCKET'], Key=o['Key'])
    print(f"Eliminado: {o['Key']}")
print(f"Builds en R2: {min(len(objs),10)} activos, {len(to_delete)} eliminados")

import { S3Client, GetBucketCorsCommand } from '@aws-sdk/client-s3'
const client = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT as string, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID as string, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string } })
const r = await client.send(new GetBucketCorsCommand({ Bucket: process.env.R2_BUCKET_PUBLIC as string }))
console.log(JSON.stringify(r.CORSRules, null, 2))

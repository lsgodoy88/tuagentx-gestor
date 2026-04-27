import { Queue } from 'bullmq'

const REDIS = { host: 'localhost', port: 6379 }

export const entregasQueue = new Queue('entregas', { connection: REDIS })

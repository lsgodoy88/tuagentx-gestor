import { Queue } from 'bullmq'

const REDIS = { host: 'localhost', port: 6379, password: process.env.REDIS_PASSWORD || '7wzadPIuzVn84WkSfPUoOAIlb0PKCZK' }

export const entregasQueue = new Queue('entregas', { connection: REDIS })

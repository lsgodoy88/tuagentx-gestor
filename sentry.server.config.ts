import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://8ac697c90fc9cf126c6f8f9ea96bcdfa@o4511294770511872.ingest.us.sentry.io/4511294775558144",
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
})

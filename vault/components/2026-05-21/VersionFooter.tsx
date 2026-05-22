'use client'
import { VERSION_INFO } from '@/lib/version'

export default function VersionFooter() {
  const { version, commit, env, tag } = VERSION_INFO
  const label = tag || `v${version}`
  const isStaging = (env as string) === 'staging'
  return (
    <footer className="mt-8 pt-4 border-t border-white/5 text-[10px] text-gray-500 flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span className="font-mono">{label}</span>
        <span className="text-gray-600">·</span>
        <a
          href={`https://github.com/lsgodoy88/tuagentx-gestor/commit/${VERSION_INFO.fullCommit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono hover:text-gray-300"
          title={`Build: ${VERSION_INFO.buildDate}`}
        >
          {commit}
        </a>
        {isStaging && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 font-semibold">STAGING</span>
        )}
      </span>
      <span className="text-gray-600">TuAgentX</span>
    </footer>
  )
}

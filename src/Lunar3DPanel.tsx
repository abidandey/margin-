import { lazy, Suspense } from 'react'
import type { Lunar3DExperienceProps } from './lunar3dTypes'

const Lunar3DExperience = lazy(() => import('./Lunar3DExperience'))

export function Lunar3DPanel(props: Lunar3DExperienceProps) {
  return (
    <Suspense fallback={<div className="lunar3d-loading" role="status">Loading interactive lunar visualization…</div>}>
      <Lunar3DExperience {...props} />
    </Suspense>
  )
}

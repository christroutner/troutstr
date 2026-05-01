import React from 'react'

/**
 * Curated categories from API: { label, weight } in [0,1].
 * Hover shows score via native tooltip (title).
 */
export default function CategoryTagCloud ({ categories }) {
  const list = Array.isArray(categories) ? categories : []
  if (!list.length) return null

  return (
    <div className='category-tag-cloud d-flex flex-wrap gap-1 mb-2' aria-label='Post categories'>
      {list.map((c, i) => {
        const w = Number(c.weight)
        const safe = Number.isFinite(w) ? Math.min(1, Math.max(0, w)) : 0
        const pct = (safe * 100).toFixed(0)
        const title = `Score: ${pct}% (weight ${safe.toFixed(3)})`
        return (
          <span
            key={`${c.label}-${i}`}
            className='badge rounded-pill bg-secondary category-tag'
            title={title}
          >
            {c.label}
          </span>
        )
      })}
    </div>
  )
}

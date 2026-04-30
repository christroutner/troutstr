import React from 'react'

const URL_REGEX = /https?:\/\/[^\s<>'"()[\]{}]+/gi

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i
const VIDEO_EXT = /\.(mp4|webm|ogg)(\?|$)/i

function isImageUrl (url) {
  try {
    const p = new URL(url).pathname
    return IMAGE_EXT.test(p)
  } catch {
    return IMAGE_EXT.test(url)
  }
}

function isVideoUrl (url) {
  try {
    const p = new URL(url).pathname
    return VIDEO_EXT.test(p)
  } catch {
    return VIDEO_EXT.test(url)
  }
}

/**
 * Renders note text with plain URLs turned into links; image/video URLs render as media.
 */
export default function NoteContent ({ content }) {
  const text = content ?? ''
  const parts = []
  let last = 0
  let m
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags)
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: text.slice(last, m.index) })
    }
    parts.push({ type: 'url', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) })
  }
  if (!parts.length) {
    parts.push({ type: 'text', value: text })
  }

  return (
    <div className='note-content'>
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return (
            <span key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {p.value}
            </span>
          )
        }
        const url = p.value
        if (isImageUrl(url)) {
          return (
            <span key={i} className='d-block my-2'>
              <a href={url} target='_blank' rel='noopener noreferrer'>
                <img src={url} alt='' className='img-fluid rounded' style={{ maxHeight: '480px' }} />
              </a>
            </span>
          )
        }
        if (isVideoUrl(url)) {
          return (
            <span key={i} className='d-block my-2'>
              <video src={url} controls className='w-100 rounded' style={{ maxHeight: '480px' }}>
                <a href={url} target='_blank' rel='noopener noreferrer'>
                  Video
                </a>
              </video>
            </span>
          )
        }
        return (
          <a key={i} href={url} target='_blank' rel='noopener noreferrer'>
            {url}
          </a>
        )
      })}
    </div>
  )
}

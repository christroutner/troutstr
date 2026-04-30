import React, { useState } from 'react'
import { Alert, Button, Form, Table } from 'react-bootstrap'
import { useNostr } from '../context/NostrContext'
import { normalizeRelayUrl } from '../lib/nostr'

export default function Settings () {
  const { relays, setRelays } = useNostr()
  const [newUrl, setNewUrl] = useState('')
  const [msg, setMsg] = useState('')

  const rows = Object.entries(relays).sort(([a], [b]) => a.localeCompare(b))

  const updateRelay = (url, patch) => {
    setRelays((prev) => {
      const cur = prev[url] || { read: true, write: false }
      return { ...prev, [url]: { ...cur, ...patch } }
    })
  }

  const removeRelay = (url) => {
    setRelays((prev) => {
      const next = { ...prev }
      delete next[url]
      return next
    })
  }

  const addRelay = () => {
    setMsg('')
    const n = normalizeRelayUrl(newUrl)
    if (!n) {
      setMsg('Enter a valid ws:// or wss:// relay URL.')
      return
    }
    if (relays[n]) {
      setMsg('That relay is already in the list.')
      return
    }
    setRelays((prev) => ({ ...prev, [n]: { read: true, write: true } }))
    setNewUrl('')
  }

  return (
    <div>
      <h1 className='h3 mb-3'>Relays</h1>
      <p className='text-secondary'>
        Choose which relays the client connects to for reading (and writing when posting is added). Changes apply on
        the next subscription or refresh.
      </p>
      {msg ? <Alert variant='warning'>{msg}</Alert> : null}
      <Table striped bordered hover size='sm' responsive className='align-middle'>
        <thead>
          <tr>
            <th>URL</th>
            <th>Read</th>
            <th>Write</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(([url, prefs]) => (
            <tr key={url}>
              <td>
                <code className='small'>{url}</code>
              </td>
              <td>
                <Form.Check
                  type='switch'
                  checked={!!prefs.read}
                  onChange={(e) => updateRelay(url, { read: e.target.checked })}
                  aria-label={`Read ${url}`}
                />
              </td>
              <td>
                <Form.Check
                  type='switch'
                  checked={!!prefs.write}
                  onChange={(e) => updateRelay(url, { write: e.target.checked })}
                  aria-label={`Write ${url}`}
                />
              </td>
              <td>
                <Button variant='outline-danger' size='sm' onClick={() => removeRelay(url)}>
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className='d-flex flex-wrap gap-2 mt-3'>
        <Form.Control
          style={{ maxWidth: '28rem' }}
          placeholder='wss://relay.example.com'
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
        />
        <Button variant='secondary' onClick={addRelay}>
          Add relay
        </Button>
      </div>
    </div>
  )
}

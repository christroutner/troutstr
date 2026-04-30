import React, { useEffect, useState } from 'react'
import { Alert, Button, Form, Spinner } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { useNostr } from '../context/NostrContext'

export default function Login () {
  const { login, pubkeyHex } = useNostr()
  const navigate = useNavigate()
  const [keyInput, setKeyInput] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pubkeyHex) navigate('/feed', { replace: true })
  }, [pubkeyHex, navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      login(keyInput, { remember })
      setKeyInput('')
      navigate('/feed', { replace: true })
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className='h3 mb-3'>Log in</h1>
      <p className='text-secondary'>
        Enter your <strong>nsec</strong> (bech32) or 64-character hex private key. This client keeps the key in
        this browser only; it is never sent to a server. Using a dedicated Nostr signing extension is safer when
        available.
      </p>
      <Alert variant='warning'>
        <strong>Do not trust any web client with your nsec.</strong> If you check &quot;Remember me&quot;, the key
        is stored in <code>localStorage</code> on this device (plain hex). Only use on a machine you control.
      </Alert>
      <Form onSubmit={handleSubmit}>
        <Form.Group className='mb-3' controlId='nsec'>
          <Form.Label>Private key</Form.Label>
          <Form.Control
            type='password'
            autoComplete='off'
            placeholder='nsec1… or hex'
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            rows={3}
            as='textarea'
            style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
          />
        </Form.Group>
        <Form.Group className='mb-3'>
          <Form.Check
            type='checkbox'
            id='remember'
            label='Remember me (stores private key in browser localStorage)'
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
        </Form.Group>
        {error ? <Alert variant='danger'>{error}</Alert> : null}
        <Button type='submit' variant='primary' disabled={busy || !keyInput.trim()}>
          {busy ? <Spinner animation='border' size='sm' className='me-2' /> : null}
          Continue
        </Button>
      </Form>
    </div>
  )
}

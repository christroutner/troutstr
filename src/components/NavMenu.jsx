import React, { useState } from 'react'
import { Nav, Navbar } from 'react-bootstrap'
import { NavLink, useNavigate } from 'react-router-dom'
import { useNostr } from '../context/NostrContext'

export default function NavMenu ({ currentPath }) {
  const { pubkeyHex, logout } = useNostr()
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    setExpanded(false)
    navigate('/login')
  }

  return (
    <Navbar
      expanded={expanded}
      onToggle={setExpanded}
      expand='lg'
      bg='dark'
      variant='dark'
      className='px-3'
    >
      <Navbar.Brand as={NavLink} to='/' onClick={() => setExpanded(false)}>
        Troutstr
      </Navbar.Brand>
      <Navbar.Toggle aria-controls='troutstr-nav' />
      <Navbar.Collapse id='troutstr-nav'>
        <Nav className='me-auto'>
          {pubkeyHex && (
            <>
              <NavLink
                className={currentPath === '/feed' ? 'nav-link-active' : 'nav-link-inactive'}
                to='/feed'
                onClick={() => setExpanded(false)}
              >
                Feed
              </NavLink>
              <NavLink
                className={currentPath === '/settings' ? 'nav-link-active' : 'nav-link-inactive'}
                to='/settings'
                onClick={() => setExpanded(false)}
              >
                Relays
              </NavLink>
            </>
          )}
          {!pubkeyHex && (
            <NavLink
              className={currentPath === '/login' ? 'nav-link-active' : 'nav-link-inactive'}
              to='/login'
              onClick={() => setExpanded(false)}
            >
              Log in
            </NavLink>
          )}
        </Nav>
        {pubkeyHex && (
          <Nav>
            <Navbar.Text className='me-2 text-secondary d-none d-md-inline text-truncate' style={{ maxWidth: '12rem' }} title={pubkeyHex}>
              {pubkeyHex.slice(0, 12)}…
            </Navbar.Text>
            <Nav.Link onClick={handleLogout} role='button'>
              Log out
            </Nav.Link>
          </Nav>
        )}
      </Navbar.Collapse>
    </Navbar>
  )
}

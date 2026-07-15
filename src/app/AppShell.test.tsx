import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'

function renderShell(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShell><p>contenido</p></AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('should_RenderChildren', () => {
    renderShell('/')

    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('should_LinkToEveryDestination', () => {
    renderShell('/')

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Ciclo' })).toHaveAttribute('href', '/ciclo')
    expect(screen.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '/registro')
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/historial')
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes')
  })

  it('should_HighlightActiveItem_When_RouteMatches', () => {
    renderShell('/ciclo')

    expect(screen.getByRole('link', { name: 'Ciclo' }).firstChild).toHaveClass('text-accent-bright')
    expect(screen.getByRole('link', { name: 'Inicio' }).firstChild).not.toHaveClass('text-accent-bright')
  })

  it('should_HideNav_When_ChromeIsFalse', () => {
    render(
      <MemoryRouter initialEntries={['/registro']}>
        <AppShell chrome={false}><p>contenido</p></AppShell>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('should_ShowNav_When_ChromeIsOmitted', () => {
    renderShell('/')

    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
})
